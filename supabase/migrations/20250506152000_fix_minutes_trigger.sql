-- Nuova migrazione per correggere il trigger di aggiornamento minuti
-- Questa versione è più semplice e robusta

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_minutes_used_trigger ON consultations;
DROP FUNCTION IF EXISTS update_subscription_minutes();

-- Create the log table if it doesn't exist
CREATE TABLE IF NOT EXISTS minutes_update_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  consultation_id uuid,
  duration_seconds integer,
  minutes_attempted integer,
  success boolean,
  error_message text,
  subscription_id uuid,
  old_minutes_used integer,
  new_minutes_used integer,
  created_at timestamptz DEFAULT now()
);

-- Create function to update minutes used with fixes
CREATE OR REPLACE FUNCTION update_subscription_minutes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period record;
  v_subscription_id uuid;
  v_minutes integer;
  v_user_id uuid;
  v_plan_id uuid;
  v_actual_update_count integer;
BEGIN
  -- Controlla se duration_seconds è NULL o 0
  IF NEW.duration_seconds IS NULL OR NEW.duration_seconds = 0 THEN
    RAISE WARNING 'Skipping minutes update: duration_seconds is NULL or 0 (value: %)', NEW.duration_seconds;
    RETURN NEW;
  END IF;

  -- Calculate minutes from duration_seconds
  v_minutes := CEIL(NEW.duration_seconds::float / 60);
  
  RAISE LOG 'Updating minutes used: consultation_id=%, duration_seconds=%, minutes=%', 
    NEW.id, NEW.duration_seconds, v_minutes;

  -- Get current period
  SELECT 
    date_trunc('month', now()) as period_start,
    (date_trunc('month', now()) + interval '1 month' - interval '1 second') as period_end
  INTO v_period;
  
  RAISE LOG 'Current period: start=%, end=%', v_period.period_start, v_period.period_end;

  -- Get user_id from patient - FIXED ACCESS
  SELECT user_id INTO v_user_id
  FROM patients 
  WHERE id = NEW.patient_id;
  
  IF v_user_id IS NULL THEN
    RAISE WARNING 'User ID not found for patient_id: %', NEW.patient_id;
    RETURN NEW;
  END IF;
  
  RAISE LOG 'Found user_id: % for patient_id: %', v_user_id, NEW.patient_id;

  -- Get user's plan ID
  SELECT p.id INTO v_plan_id
  FROM users u
  JOIN subscription_plans p ON p.name = u.subscription_tier
  WHERE u.id = v_user_id;
  
  IF v_plan_id IS NULL THEN
    RAISE WARNING 'Plan ID not found for user_id: %', v_user_id;
    -- Usa il piano free come fallback
    SELECT id INTO v_plan_id FROM subscription_plans WHERE name = 'free' LIMIT 1;
    IF v_plan_id IS NULL THEN
      RAISE WARNING 'Failed to find even free plan, creating subscription might fail';
    END IF;
  END IF;

  -- Ensure subscription exists
  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    minutes_used,
    current_period_start,
    current_period_end
  )
  SELECT 
    v_user_id,
    v_plan_id,
    0,
    v_period.period_start,
    v_period.period_end
  WHERE v_user_id IS NOT NULL AND v_plan_id IS NOT NULL
  ON CONFLICT (user_id, current_period_start, current_period_end) 
  DO NOTHING;
  
  -- Verifica se l'inserimento è avvenuto
  GET DIAGNOSTICS v_actual_update_count = ROW_COUNT;
  
  IF v_actual_update_count > 0 THEN
    RAISE LOG 'Created new subscription for user_id: % with plan_id: %', v_user_id, v_plan_id;
  END IF;

  -- Update minutes used in current subscription period
  UPDATE user_subscriptions
  SET minutes_used = COALESCE(minutes_used, 0) + v_minutes
  WHERE user_id = v_user_id
  AND current_period_start = v_period.period_start
  AND current_period_end = v_period.period_end;
  
  -- Verifica se l'aggiornamento è avvenuto
  GET DIAGNOSTICS v_actual_update_count = ROW_COUNT;
  
  IF v_actual_update_count > 0 THEN
    RAISE LOG 'Successfully updated minutes_used for user % by adding % minutes', v_user_id, v_minutes;
  ELSE
    RAISE WARNING 'Failed to update minutes_used for user %. No subscription found for period % to %', 
      v_user_id, v_period.period_start, v_period.period_end;
      
    -- Prova a recuperare informazioni sulla sottoscrizione esistente per debug
    DECLARE
      v_sub_count integer;
    BEGIN
      SELECT COUNT(*) INTO v_sub_count FROM user_subscriptions WHERE user_id = v_user_id;
      RAISE LOG 'Found % total subscriptions for user_id: %', v_sub_count, v_user_id;
      
      -- Solo per debug: mostra le sottoscrizioni esistenti
      RAISE LOG 'Existing subscriptions for user_id %: %', v_user_id, 
        (SELECT json_agg(row_to_json(s)) FROM (
          SELECT id, user_id, plan_id, minutes_used, current_period_start, current_period_end 
          FROM user_subscriptions WHERE user_id = v_user_id
        ) s);
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER update_minutes_used_trigger
  AFTER INSERT OR UPDATE OF duration_seconds ON consultations
  FOR EACH ROW
  WHEN (NEW.duration_seconds IS NOT NULL AND NEW.duration_seconds > 0)
  EXECUTE FUNCTION update_subscription_minutes();

-- Correzione per la processazione delle consultazioni esistenti
DO $$
DECLARE
  v_consultation record;
  v_period record;
  v_minutes integer;
  v_user_id uuid;
BEGIN
  -- Get current period
  SELECT 
    date_trunc('month', now()) as period_start,
    (date_trunc('month', now()) + interval '1 month' - interval '1 second') as period_end
  INTO v_period;

  -- Process each consultation - FIXED: separate user_id from consultation record
  FOR v_consultation IN 
    SELECT c.*
    FROM consultations c
    WHERE c.duration_seconds IS NOT NULL
  LOOP
    -- Get user_id for this consultation from patients table
    SELECT user_id INTO v_user_id
    FROM patients
    WHERE id = v_consultation.patient_id;
    
    IF v_user_id IS NULL THEN
      RAISE WARNING 'Skipping consultation %: user_id not found for patient_id %', 
        v_consultation.id, v_consultation.patient_id;
      CONTINUE;
    END IF;
    
    -- Calculate minutes
    v_minutes := CEIL(v_consultation.duration_seconds::float / 60);

    -- Update subscription with correct user_id reference
    UPDATE user_subscriptions
    SET minutes_used = COALESCE(minutes_used, 0) + v_minutes
    WHERE user_id = v_user_id
    AND current_period_start = v_period.period_start
    AND current_period_end = v_period.period_end;
  END LOOP;
END $$;

-- Log completion
DO $$
BEGIN
  RAISE LOG 'Fixed update_minutes_used_trigger on consultations table';
END$$;

-- Notify about the update
DO $$
BEGIN
  RAISE NOTICE 'Successfully updated minutes trigger with simpler version';
END$$; 