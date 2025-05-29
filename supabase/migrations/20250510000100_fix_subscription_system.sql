-- Migrazione per migliorare il sistema di gestione delle sottoscrizioni
-- 1. Assicurare che ogni utente abbia una sola sottoscrizione attiva
-- 2. Implementare il rinnovo automatico a fine mese
-- 3. Gestire gli upgrade di piano

-- Crea trigger e funzione per gestire il rinnovo automatico
CREATE OR REPLACE FUNCTION manage_user_subscriptions()
RETURNS TRIGGER AS $$
DECLARE
  v_current_period_start TIMESTAMP WITH TIME ZONE;
  v_current_period_end TIMESTAMP WITH TIME ZONE;
  v_plan_id UUID;
  v_existing_sub UUID;
BEGIN
  -- Se è un nuovo utente o un nuovo record, impostiamo la data di inizio e fine periodo
  IF TG_OP = 'INSERT' THEN
    -- Inizio mese corrente
    v_current_period_start := DATE_TRUNC('month', NOW());
    -- Fine mese corrente
    v_current_period_end := (DATE_TRUNC('month', NOW()) + INTERVAL '1 month' - INTERVAL '1 second');
    
    -- Verifica se esiste già una sottoscrizione attiva per questo utente
    SELECT id INTO v_existing_sub
    FROM user_subscriptions
    WHERE user_id = NEW.user_id
    AND current_period_end >= NOW();
    
    IF v_existing_sub IS NOT NULL THEN
      -- Se esiste già una sottoscrizione, blocca la creazione di una nuova
      RAISE EXCEPTION 'Esiste già una sottoscrizione attiva per questo utente (ID: %)', v_existing_sub;
    END IF;
    
    -- Imposta le date di inizio e fine periodo
    NEW.current_period_start := v_current_period_start;
    NEW.current_period_end := v_current_period_end;
    
    -- Se i minuti usati non sono specificati, imposta a 0
    IF NEW.minutes_used IS NULL THEN
      NEW.minutes_used := 0;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crea trigger per applicare la funzione
DROP TRIGGER IF EXISTS manage_subscriptions_trigger ON user_subscriptions;
CREATE TRIGGER manage_subscriptions_trigger
BEFORE INSERT ON user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION manage_user_subscriptions();

-- Funzione per rinnovare automaticamente le sottoscrizioni a fine mese
CREATE OR REPLACE FUNCTION renew_monthly_subscriptions()
RETURNS INT AS $$
DECLARE
  v_count INT := 0;
  v_sub RECORD;
  v_start_date TIMESTAMP WITH TIME ZONE;
  v_end_date TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Calcola le date per il nuovo periodo
  v_start_date := DATE_TRUNC('month', NOW() + INTERVAL '1 month');
  v_end_date := (v_start_date + INTERVAL '1 month' - INTERVAL '1 second');
  
  -- Log informativo
  RAISE NOTICE 'Rinnovo sottoscrizioni per periodo: % a %', v_start_date, v_end_date;
  
  -- Per ogni sottoscrizione attiva che scade a fine mese
  FOR v_sub IN
    SELECT * FROM user_subscriptions
    WHERE current_period_end BETWEEN 
      DATE_TRUNC('month', NOW() + INTERVAL '1 day') - INTERVAL '5 days' 
      AND DATE_TRUNC('month', NOW() + INTERVAL '1 day')
  LOOP
    -- Log
    RAISE NOTICE 'Rinnovo sottoscrizione: % (Utente: %)', v_sub.id, v_sub.user_id;
    
    -- Inserisci nuova sottoscrizione per il mese successivo
    INSERT INTO user_subscriptions (
      user_id,
      plan_id,
      current_period_start,
      current_period_end,
      minutes_used
    ) VALUES (
      v_sub.user_id,
      v_sub.plan_id,
      v_start_date,
      v_end_date,
      0
    );
    
    -- Incrementa contatore
    v_count := v_count + 1;
  END LOOP;
  
  RAISE NOTICE 'Rinnovate % sottoscrizioni', v_count;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Crea funzione per gestire l'upgrade di piano
CREATE OR REPLACE FUNCTION upgrade_subscription_plan(
  p_user_id UUID,
  p_new_plan_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_current_sub_id UUID;
  v_current_sub RECORD;
  v_new_sub_id UUID;
  v_start_date TIMESTAMP WITH TIME ZONE;
  v_end_date TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Ottieni la sottoscrizione corrente
  SELECT * INTO v_current_sub
  FROM user_subscriptions
  WHERE user_id = p_user_id
  AND current_period_end >= NOW()
  ORDER BY current_period_end DESC
  LIMIT 1;
  
  IF v_current_sub IS NULL THEN
    RAISE EXCEPTION 'Nessuna sottoscrizione attiva trovata per l''utente';
  END IF;
  
  -- Usa lo stesso periodo della sottoscrizione corrente
  v_start_date := NOW(); -- La data di upgrade è ora
  v_end_date := v_current_sub.current_period_end;
  
  -- Crea nuova sottoscrizione con il nuovo piano
  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    current_period_start,
    current_period_end,
    minutes_used
  ) VALUES (
    p_user_id,
    p_new_plan_id,
    v_start_date,
    v_end_date,
    v_current_sub.minutes_used -- Mantieni i minuti usati
  )
  RETURNING id INTO v_new_sub_id;
  
  -- Disattiva la vecchia sottoscrizione (aggiorna la data di fine)
  UPDATE user_subscriptions
  SET current_period_end = NOW() - INTERVAL '1 second'
  WHERE id = v_current_sub.id;
  
  -- Aggiorna anche il tier dell'utente
  UPDATE users
  SET subscription_tier = (
    SELECT name FROM subscription_plans WHERE id = p_new_plan_id
  )
  WHERE id = p_user_id;
  
  RETURN v_new_sub_id;
END;
$$ LANGUAGE plpgsql;

-- Crea funzione per assicurare che ogni utente abbia una sottoscrizione
CREATE OR REPLACE FUNCTION ensure_user_has_subscription()
RETURNS TRIGGER AS $$
DECLARE
  v_free_plan_id UUID;
  v_has_subscription BOOLEAN;
BEGIN
  -- Verifica se l'utente ha già una sottoscrizione
  SELECT EXISTS (
    SELECT 1 FROM user_subscriptions
    WHERE user_id = NEW.id
    AND current_period_end >= NOW()
  ) INTO v_has_subscription;
  
  -- Se non ha una sottoscrizione, crea una sottoscrizione free
  IF NOT v_has_subscription THEN
    -- Trova il piano free
    SELECT id INTO v_free_plan_id
    FROM subscription_plans
    WHERE name = 'free';
    
    IF v_free_plan_id IS NULL THEN
      RAISE WARNING 'Piano free non trovato, impossibile creare sottoscrizione per utente %', NEW.id;
      RETURN NEW;
    END IF;
    
    -- Crea una sottoscrizione free
    INSERT INTO user_subscriptions (
      user_id,
      plan_id,
      current_period_start,
      current_period_end,
      minutes_used
    ) VALUES (
      NEW.id,
      v_free_plan_id,
      DATE_TRUNC('month', NOW()),
      DATE_TRUNC('month', NOW()) + INTERVAL '1 month' - INTERVAL '1 second',
      0
    );
    
    -- Imposta il tier dell'utente
    NEW.subscription_tier := 'free';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crea trigger per assicurare che ogni nuovo utente abbia una sottoscrizione
DROP TRIGGER IF EXISTS ensure_subscription_trigger ON users;
CREATE TRIGGER ensure_subscription_trigger
AFTER INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION ensure_user_has_subscription();

-- Crea una funzione cron per eseguire il rinnovo automatico ogni giorno
CREATE OR REPLACE FUNCTION daily_subscription_renewal()
RETURNS VOID AS $$
BEGIN
  PERFORM renew_monthly_subscriptions();
END;
$$ LANGUAGE plpgsql;

-- Programma il job cron per eseguire la funzione ogni giorno alle 1:00
SELECT cron.schedule(
  'daily-subscription-renewal',  -- name of the job
  '0 1 * * *',                   -- cron schedule (ogni giorno alle 1:00)
  'SELECT daily_subscription_renewal()'
);

-- Verifica l'utente yumi.aibot@gmail.com e assicura che abbia una sottoscrizione
DO $$
DECLARE
  v_user_id UUID;
  v_basic_plan_id UUID;
  v_has_subscription BOOLEAN;
BEGIN
  -- Trova l'utente
  SELECT id INTO v_user_id
  FROM users
  WHERE email = 'yumi.aibot@gmail.com';
  
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Utente yumi.aibot@gmail.com non trovato';
    RETURN;
  END IF;
  
  -- Verifica se l'utente ha già una sottoscrizione attiva
  SELECT EXISTS (
    SELECT 1 FROM user_subscriptions
    WHERE user_id = v_user_id
    AND current_period_end >= NOW()
  ) INTO v_has_subscription;
  
  -- Se non ha una sottoscrizione, crea una sottoscrizione basic
  IF NOT v_has_subscription THEN
    -- Trova il piano basic
    SELECT id INTO v_basic_plan_id
    FROM subscription_plans
    WHERE name = 'basic';
    
    IF v_basic_plan_id IS NULL THEN
      RAISE NOTICE 'Piano basic non trovato';
      RETURN;
    END IF;
    
    -- Crea una sottoscrizione basic
    INSERT INTO user_subscriptions (
      user_id,
      plan_id,
      current_period_start,
      current_period_end,
      minutes_used
    ) VALUES (
      v_user_id,
      v_basic_plan_id,
      DATE_TRUNC('month', NOW()),
      DATE_TRUNC('month', NOW()) + INTERVAL '1 month' - INTERVAL '1 second',
      0
    );
    
    -- Aggiorna il tier dell'utente
    UPDATE users
    SET subscription_tier = 'basic'
    WHERE id = v_user_id;
    
    RAISE NOTICE 'Creata sottoscrizione basic per yumi.aibot@gmail.com';
  ELSE
    RAISE NOTICE 'L''utente yumi.aibot@gmail.com ha già una sottoscrizione attiva';
  END IF;
END $$; 