/*
  # Sistema di gestione sottoscrizioni avanzato
  
  Questo file implementa un sistema completo per gestire le sottoscrizioni con le seguenti caratteristiche:
  
  1. Piano Free: inizia la sottoscrizione al primo login
  2. Piano Basic: prova gratuita di 7 giorni, ma il piano inizia dall'acquisto su Stripe
  3. Piano Advanced: la sottoscrizione inizia al primo login
  4. Cambio Piano: la sottoscrizione riparte dal momento del cambio piano
  
  Funzionalità implementate:
  - Trigger di creazione sottoscrizione al login
  - Gestione cambio piano
  - Rinnovo automatico delle sottoscrizioni
  - Logica differenziata per tier
*/

-- 1. Tabella per tracciare l'attività degli utenti
CREATE TABLE IF NOT EXISTS user_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  event_type text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- 2. Funzione per garantire che esista una sottoscrizione valida
CREATE OR REPLACE FUNCTION ensure_valid_subscription(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now timestamptz := now();
  v_user_record record;
  v_plan_id uuid;
  v_subscription_id uuid;
  v_is_first_login boolean := false;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_latest_subscription record;
BEGIN
  -- Ottieni dati utente
  SELECT 
    id, 
    subscription_tier, 
    subscription_start_date,
    created_at
  INTO v_user_record
  FROM users
  WHERE id = p_user_id;
  
  -- Verifica se esiste l'utente
  IF v_user_record IS NULL THEN
    RAISE EXCEPTION 'Utente con ID % non trovato', p_user_id;
  END IF;

  -- Determina se è il primo login
  SELECT 
    COUNT(*) = 0 INTO v_is_first_login
  FROM user_activity_log
  WHERE user_id = p_user_id AND event_type = 'login';
  
  -- Inserisci il log di accesso
  INSERT INTO user_activity_log (user_id, event_type, metadata)
  VALUES (p_user_id, 'login', jsonb_build_object('is_first_login', v_is_first_login));

  -- Ottieni il piano corrispondente al tier dell'utente
  SELECT id INTO v_plan_id
  FROM subscription_plans
  WHERE name = v_user_record.subscription_tier;

  -- Se nessun piano corrisponde, usa il piano Free
  IF v_plan_id IS NULL THEN
    SELECT id INTO v_plan_id
    FROM subscription_plans
    WHERE name = 'free';
    
    -- Crea il piano Free se non esiste
    IF v_plan_id IS NULL THEN
      INSERT INTO subscription_plans (name, monthly_minutes, price_monthly)
      VALUES ('free', 30, 0)
      RETURNING id INTO v_plan_id;
    END IF;
  END IF;

  -- Cerca una sottoscrizione attiva
  SELECT * INTO v_latest_subscription
  FROM user_subscriptions
  WHERE user_id = p_user_id
  AND current_period_start <= v_now
  AND current_period_end >= v_now
  ORDER BY current_period_end DESC
  LIMIT 1;

  -- Se esiste una sottoscrizione attiva, ritorna il suo ID
  IF v_latest_subscription.id IS NOT NULL THEN
    RETURN v_latest_subscription.id;
  END IF;
  
  -- Determina la data di inizio in base al tier
  CASE
    -- Piano Free: inizia al primo login
    WHEN v_user_record.subscription_tier = 'free' AND v_is_first_login THEN
      v_period_start := v_now;
      v_period_end := v_now + interval '30 days';
      
    -- Piano Basic: inizia dalla data di acquisto (registrata in subscription_start_date)
    WHEN v_user_record.subscription_tier = 'basic' THEN
      v_period_start := COALESCE(v_user_record.subscription_start_date, v_now);
      v_period_end := v_period_start + interval '30 days';
      
    -- Piano Advanced: inizia al primo login
    WHEN v_user_record.subscription_tier = 'advanced' AND v_is_first_login THEN
      v_period_start := v_now;
      v_period_end := v_now + interval '30 days';
      
    -- Qualsiasi altro caso: usa la data corrente (per gestire casi imprevisti)
    ELSE
      v_period_start := v_now;
      v_period_end := v_now + interval '30 days';
  END CASE;

  -- Crea una nuova sottoscrizione
  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    minutes_used,
    current_period_start,
    current_period_end
  ) VALUES (
    p_user_id,
    v_plan_id,
    0,
    v_period_start,
    v_period_end
  )
  RETURNING id INTO v_subscription_id;
  
  -- Aggiorna la data di inizio sottoscrizione nell'utente se non è impostata
  IF v_user_record.subscription_start_date IS NULL THEN
    UPDATE users
    SET subscription_start_date = v_period_start
    WHERE id = p_user_id;
  END IF;
  
  RETURN v_subscription_id;
END;
$$;

-- 3. Funzione per gestire il cambio piano
CREATE OR REPLACE FUNCTION handle_plan_change(p_user_id uuid, p_new_tier text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now timestamptz := now();
  v_plan_id uuid;
  v_subscription_id uuid;
BEGIN
  -- Aggiorna il tier dell'utente
  UPDATE users
  SET 
    subscription_tier = p_new_tier,
    subscription_start_date = v_now  -- Registra la data del cambio piano
  WHERE id = p_user_id;
  
  -- Ottieni il nuovo piano
  SELECT id INTO v_plan_id
  FROM subscription_plans
  WHERE name = p_new_tier;
  
  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Piano % non trovato', p_new_tier;
  END IF;
  
  -- Disattiva tutte le sottoscrizioni attive
  UPDATE user_subscriptions
  SET 
    current_period_end = v_now - interval '1 second'  -- Termina immediatamente
  WHERE 
    user_id = p_user_id AND
    current_period_end > v_now;

  -- Crea nuova sottoscrizione con il nuovo piano
  -- Per il piano basic, se c'è una prova gratuita, potremmo aggiungere 7 giorni
  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    minutes_used,
    current_period_start,
    current_period_end
  ) VALUES (
    p_user_id,
    v_plan_id,
    0,
    v_now,
    CASE 
      WHEN p_new_tier = 'basic' THEN v_now + interval '37 days'  -- 30 giorni + 7 giorni di prova
      ELSE v_now + interval '30 days'
    END
  )
  RETURNING id INTO v_subscription_id;
  
  -- Registra il cambio piano nel log
  INSERT INTO user_activity_log (
    user_id, 
    event_type, 
    metadata
  ) VALUES (
    p_user_id, 
    'plan_change', 
    jsonb_build_object(
      'previous_tier', (SELECT subscription_tier FROM users WHERE id = p_user_id),
      'new_tier', p_new_tier,
      'new_subscription_id', v_subscription_id
    )
  );
  
  RETURN v_subscription_id;
END;
$$;

-- 4. Funzione per rinnovare automaticamente le sottoscrizioni
CREATE OR REPLACE FUNCTION renew_expired_subscriptions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user record;
  v_now timestamptz := now();
  v_plan_id uuid;
  v_subscription_id uuid;
BEGIN
  -- Per ogni utente con sottoscrizione scaduta, crea una nuova sottoscrizione
  FOR v_user IN 
    SELECT DISTINCT u.id, u.subscription_tier
    FROM users u
    JOIN user_subscriptions s ON s.user_id = u.id
    WHERE s.current_period_end < v_now
    AND NOT EXISTS (
      SELECT 1 
      FROM user_subscriptions s2 
      WHERE s2.user_id = u.id 
      AND s2.current_period_start <= v_now 
      AND s2.current_period_end >= v_now
    )
  LOOP
    -- Ottieni piano
    SELECT id INTO v_plan_id
    FROM subscription_plans
    WHERE name = v_user.subscription_tier;
    
    -- Crea nuova sottoscrizione
    INSERT INTO user_subscriptions (
      user_id,
      plan_id,
      minutes_used,
      current_period_start,
      current_period_end
    ) VALUES (
      v_user.id,
      v_plan_id,
      0,
      v_now,
      v_now + interval '30 days'
    )
    RETURNING id INTO v_subscription_id;
    
    -- Log rinnovo
    INSERT INTO user_activity_log (
      user_id, 
      event_type, 
      metadata
    ) VALUES (
      v_user.id, 
      'subscription_renewal', 
      jsonb_build_object(
        'subscription_id', v_subscription_id,
        'tier', v_user.subscription_tier
      )
    );
  END LOOP;
END;
$$;

-- 5. Trigger per verifica sottoscrizione al login
CREATE OR REPLACE FUNCTION check_subscription_on_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Prendi l'ID utente dalla tabella auth.users
  v_user_id := NEW.id;
  
  -- Verifica se l'utente esiste nella tabella users
  PERFORM id FROM users WHERE id = v_user_id;
  
  -- Se l'utente esiste, garantisci che abbia una sottoscrizione valida
  IF FOUND THEN
    PERFORM ensure_valid_subscription(v_user_id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Crea o sostituisci il trigger che verifica la sottoscrizione al login
DROP TRIGGER IF EXISTS subscription_check_on_auth ON auth.users;
CREATE TRIGGER subscription_check_on_auth
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION check_subscription_on_auth();

-- 6. Funzione API pubblica per creare/aggiornare sottoscrizione (per admin)
CREATE OR REPLACE FUNCTION admin_create_subscription(
  p_email text, 
  p_tier text DEFAULT 'basic',
  p_minutes_used int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_plan_id uuid;
  v_subscription_id uuid;
  v_period_start timestamptz := now();
  v_period_end timestamptz;
BEGIN
  -- Ottieni l'id utente dalla email
  SELECT id INTO v_user_id
  FROM users
  WHERE email = p_email;
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Utente con email %s non trovato', p_email)
    );
  END IF;
  
  -- Ottieni il piano corrispondente al tier
  SELECT id INTO v_plan_id
  FROM subscription_plans
  WHERE name = p_tier;
  
  IF v_plan_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Piano %s non trovato', p_tier)
    );
  END IF;
  
  -- Determina la fine del periodo
  IF p_tier = 'basic' THEN
    v_period_end := v_period_start + interval '37 days'; -- include prova 7 giorni
  ELSE
    v_period_end := v_period_start + interval '30 days';
  END IF;
  
  -- Crea una nuova sottoscrizione
  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    minutes_used,
    current_period_start,
    current_period_end
  ) VALUES (
    v_user_id,
    v_plan_id,
    p_minutes_used,
    v_period_start,
    v_period_end
  )
  RETURNING id INTO v_subscription_id;
  
  -- Aggiorna il tier utente
  UPDATE users
  SET 
    subscription_tier = p_tier,
    subscription_start_date = v_period_start
  WHERE id = v_user_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', v_subscription_id,
    'user_id', v_user_id,
    'tier', p_tier,
    'period_start', v_period_start,
    'period_end', v_period_end
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- Concedi i privilegi di esecuzione alla funzione
REVOKE ALL ON FUNCTION admin_create_subscription(text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_create_subscription(text, text, int) TO authenticated;

-- Aggiunta campo subscription_start_date a users se non esiste
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'subscription_start_date'
  ) THEN
    ALTER TABLE users ADD COLUMN subscription_start_date timestamptz;
  END IF;
END$$;

-- Esegui job di rinnovo iniziale
SELECT renew_expired_subscriptions();

-- Log della migrazione
DO $$
BEGIN
  RAISE NOTICE 'Migrazione completata: sistema avanzato di gestione sottoscrizioni installato';
END $$; 