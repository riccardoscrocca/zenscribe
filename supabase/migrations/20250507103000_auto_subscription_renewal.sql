/*
  # Implementazione rinnovo automatico sottoscrizioni basato sulla data di abbonamento

  1. Funzionalità
    - Aggiunta di un trigger e una funzione per verificare e creare sottoscrizioni al login
    - Aggiunta di una funzione per garantire che ogni utente abbia una sottoscrizione valida
    - Implementazione del rinnovo basato sulla data di sottoscrizione (ogni 30 giorni)
    
  2. Sicurezza
    - Utilizzo di funzioni SECURITY DEFINER
    - Mantenimento delle policy RLS esistenti
*/

-- Funzione per calcolare il prossimo periodo di abbonamento
CREATE OR REPLACE FUNCTION calculate_subscription_period(start_date timestamptz DEFAULT NULL)
RETURNS TABLE (
  period_start timestamptz,
  period_end timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    COALESCE(start_date, now())::date as period_start,
    (COALESCE(start_date, now())::date + interval '30 days' - interval '1 second') as period_end;
$$;

-- Funzione per garantire che esista una sottoscrizione valida
CREATE OR REPLACE FUNCTION ensure_valid_subscription(user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now timestamptz := now();
  v_period record;
  v_plan_id uuid;
  v_subscription_id uuid;
  v_user_tier text;
  v_latest_subscription record;
  v_new_start_date timestamptz;
BEGIN
  -- Ottieni il tier di sottoscrizione dell'utente
  SELECT subscription_tier INTO v_user_tier
  FROM users
  WHERE id = user_id;
  
  -- Se non esiste l'utente, esci
  IF v_user_tier IS NULL THEN
    RAISE WARNING 'User with ID % not found', user_id;
    RETURN NULL;
  END IF;

  -- Ottieni l'ID del piano in base al tier dell'utente
  SELECT id INTO v_plan_id
  FROM subscription_plans
  WHERE name = v_user_tier
  LIMIT 1;

  -- Se nessun piano corrisponde, usa il piano Free
  IF v_plan_id IS NULL THEN
    SELECT id INTO v_plan_id
    FROM subscription_plans
    WHERE name = 'free'
    LIMIT 1;
    
    -- Crea il piano Free se non esiste
    IF v_plan_id IS NULL THEN
      INSERT INTO subscription_plans (name, monthly_minutes, price_monthly)
      VALUES ('free', 30, 0)
      RETURNING id INTO v_plan_id;
    END IF;
  END IF;

  -- Cerca una sottoscrizione attiva (periodo corrente include la data attuale)
  SELECT * INTO v_latest_subscription
  FROM user_subscriptions
  WHERE user_id = user_id
  AND current_period_start <= v_now
  AND current_period_end >= v_now
  ORDER BY current_period_end DESC
  LIMIT 1;

  -- Se esiste una sottoscrizione attiva, ritorna il suo ID
  IF v_latest_subscription.id IS NOT NULL THEN
    RETURN v_latest_subscription.id;
  END IF;
  
  -- Nessuna sottoscrizione attiva trovata, cerca l'ultima sottoscrizione scaduta
  SELECT * INTO v_latest_subscription
  FROM user_subscriptions
  WHERE user_id = user_id
  ORDER BY current_period_end DESC
  LIMIT 1;
  
  -- Calcola la nuova data di inizio
  IF v_latest_subscription.id IS NOT NULL THEN
    -- La nuova data di inizio è la fine del periodo precedente + 1 secondo
    v_new_start_date := v_latest_subscription.current_period_end + interval '1 second';
    
    -- Se la nuova data di inizio è nel futuro, usa la data attuale
    IF v_new_start_date > v_now THEN
      v_new_start_date := v_now;
    END IF;
  ELSE
    -- Prima sottoscrizione dell'utente, usa la data attuale
    v_new_start_date := v_now;
  END IF;
  
  -- Calcola il nuovo periodo (30 giorni dalla data di inizio)
  SELECT * INTO v_period FROM calculate_subscription_period(v_new_start_date);
  
  -- Crea una nuova sottoscrizione per il nuovo periodo
  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    minutes_used,
    current_period_start,
    current_period_end
  ) VALUES (
    user_id,
    v_plan_id,
    0,
    v_period.period_start,
    v_period.period_end
  )
  RETURNING id INTO v_subscription_id;
  
  RAISE LOG 'Created new subscription % for user % (tier %) for period % to %', 
    v_subscription_id, user_id, v_user_tier, v_period.period_start, v_period.period_end;

  RETURN v_subscription_id;
END;
$$;

-- Funzione per verificare e aggiornare la sottoscrizione al login
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

-- Funzione per aggiornare automaticamente tutte le sottoscrizioni scadute
CREATE OR REPLACE FUNCTION renew_expired_subscriptions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user record;
  v_now timestamptz := now();
BEGIN
  -- Per ogni utente con sottoscrizione scaduta, crea una nuova sottoscrizione
  FOR v_user IN 
    SELECT DISTINCT u.id 
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
    PERFORM ensure_valid_subscription(v_user.id);
  END LOOP;
END;
$$;

-- Aggiungi un job per eseguire automaticamente il rinnovo delle sottoscrizioni ogni giorno
-- Questo garantisce che le sottoscrizioni scadute vengano rinnovate
DO $$
BEGIN
  -- Verifica se l'estensione pg_cron è disponibile
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'renew-subscriptions',  -- nome del job
      '0 0 * * *',           -- esegui a mezzanotte ogni giorno
      $$ SELECT renew_expired_subscriptions() $$
    );
    RAISE NOTICE 'Job di rinnovo automatico schedulato con successo';
  ELSE
    RAISE WARNING 'L''estensione pg_cron non è disponibile. Il rinnovo automatico dovrà essere gestito esternamente.';
  END IF;
END $$;

-- Esegui un rinnovo iniziale per tutti gli utenti con sottoscrizioni scadute
SELECT renew_expired_subscriptions();

-- Log della migrazione
DO $$
BEGIN
  RAISE NOTICE 'Migrazione completata: implementazione rinnovo automatico sottoscrizioni basato sulla data di abbonamento';
END $$; 