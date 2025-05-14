-- Migrazione per migliorare il trigger di aggiornamento minuti
-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_minutes_used_trigger ON consultations;
DROP FUNCTION IF EXISTS update_subscription_minutes();

-- Crea un semplice log_activity per tracciare i tentativi di aggiornamento minuti
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

-- Create function to update minutes used with more diagnostics
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
  v_old_minutes_used integer;
  v_actual_update_count integer;
  v_subscription_found boolean := false;
  v_error_message text;
BEGIN
  RAISE LOG 'update_subscription_minutes triggered for consultation id: %', NEW.id;

  -- Controlla se duration_seconds è NULL o 0
  IF NEW.duration_seconds IS NULL OR NEW.duration_seconds = 0 OR NEW.duration_seconds < 0 THEN
    v_error_message := format('Invalid duration_seconds: %', NEW.duration_seconds);
    INSERT INTO minutes_update_log (
      consultation_id, 
      duration_seconds, 
      success, 
      error_message
    ) VALUES (
      NEW.id, 
      NEW.duration_seconds, 
      false, 
      v_error_message
    );
    
    RAISE WARNING 'Skipping minutes update: %', v_error_message;
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

  -- Get user_id from patient
  BEGIN
    SELECT user_id INTO v_user_id
    FROM patients 
    WHERE id = NEW.patient_id;
    
    IF v_user_id IS NULL THEN
      v_error_message := format('User ID not found for patient_id: %', NEW.patient_id);
      INSERT INTO minutes_update_log (
        consultation_id, 
        duration_seconds, 
        minutes_attempted,
        success, 
        error_message
      ) VALUES (
        NEW.id, 
        NEW.duration_seconds, 
        v_minutes,
        false, 
        v_error_message
      );
      
      RAISE WARNING '%', v_error_message;
      RETURN NEW;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      v_error_message := format('Error getting user_id: %', SQLERRM);
      INSERT INTO minutes_update_log (
        consultation_id, 
        duration_seconds, 
        minutes_attempted,
        success, 
        error_message
      ) VALUES (
        NEW.id, 
        NEW.duration_seconds, 
        v_minutes,
        false, 
        v_error_message
      );
      
      RAISE WARNING '%', v_error_message;
      RETURN NEW;
  END;
  
  RAISE LOG 'Found user_id: % for patient_id: %', v_user_id, NEW.patient_id;

  -- Get user's plan ID
  BEGIN
    SELECT p.id INTO v_plan_id
    FROM users u
    JOIN subscription_plans p ON p.name = u.subscription_tier
    WHERE u.id = v_user_id;
    
    IF v_plan_id IS NULL THEN
      v_error_message := format('Plan ID not found for user_id: %', v_user_id);
      INSERT INTO minutes_update_log (
        consultation_id, 
        user_id,
        duration_seconds, 
        minutes_attempted,
        success, 
        error_message
      ) VALUES (
        NEW.id, 
        v_user_id,
        NEW.duration_seconds, 
        v_minutes,
        false, 
        v_error_message
      );
      
      RAISE WARNING '%', v_error_message;
      RETURN NEW;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      v_error_message := format('Error getting plan_id: %', SQLERRM);
      INSERT INTO minutes_update_log (
        consultation_id, 
        user_id,
        duration_seconds, 
        minutes_attempted,
        success, 
        error_message
      ) VALUES (
        NEW.id, 
        v_user_id,
        NEW.duration_seconds, 
        v_minutes,
        false, 
        v_error_message
      );
      
      RAISE WARNING '%', v_error_message;
      RETURN NEW;
  END;

  -- Get or create subscription for current period
  BEGIN
    -- First try to get existing subscription
    SELECT id, minutes_used INTO v_subscription_id, v_old_minutes_used
    FROM user_subscriptions
    WHERE user_id = v_user_id
    AND current_period_start = v_period.period_start
    AND current_period_end = v_period.period_end;
    
    v_subscription_found := v_subscription_id IS NOT NULL;
    
    -- Create new subscription if needed
    IF NOT v_subscription_found THEN
      INSERT INTO user_subscriptions (
        user_id, 
        plan_id, 
        minutes_used, 
        current_period_start, 
        current_period_end
      ) VALUES (
        v_user_id, 
        v_plan_id, 
        v_minutes, 
        v_period.period_start, 
        v_period.period_end
      ) RETURNING id INTO v_subscription_id;
      
      v_actual_update_count := 1;
      v_old_minutes_used := 0;
      
      RAISE LOG 'Created new subscription % for user % with initial minutes %', 
        v_subscription_id, v_user_id, v_minutes;
        
      INSERT INTO minutes_update_log (
        consultation_id, 
        user_id,
        duration_seconds, 
        minutes_attempted,
        success,
        subscription_id,
        old_minutes_used,
        new_minutes_used
      ) VALUES (
        NEW.id, 
        v_user_id,
        NEW.duration_seconds, 
        v_minutes,
        true,
        v_subscription_id,
        0,
        v_minutes
      );
    ELSE
      -- Update existing subscription
      UPDATE user_subscriptions
      SET minutes_used = COALESCE(minutes_used, 0) + v_minutes
      WHERE id = v_subscription_id
      RETURNING 1 INTO v_actual_update_count;
      
      RAISE LOG 'Updated subscription % for user %. Old minutes: %, added: %, new total: %', 
        v_subscription_id, v_user_id, v_old_minutes_used, v_minutes, (v_old_minutes_used + v_minutes);
        
      INSERT INTO minutes_update_log (
        consultation_id, 
        user_id,
        duration_seconds, 
        minutes_attempted,
        success,
        subscription_id,
        old_minutes_used,
        new_minutes_used
      ) VALUES (
        NEW.id, 
        v_user_id,
        NEW.duration_seconds, 
        v_minutes,
        true,
        v_subscription_id,
        v_old_minutes_used,
        v_old_minutes_used + v_minutes
      );
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      v_error_message := format('Error updating subscription: %', SQLERRM);
      INSERT INTO minutes_update_log (
        consultation_id, 
        user_id,
        duration_seconds, 
        minutes_attempted,
        success, 
        error_message
      ) VALUES (
        NEW.id, 
        v_user_id,
        NEW.duration_seconds, 
        v_minutes,
        false, 
        v_error_message
      );
      
      RAISE WARNING '%', v_error_message;
      RETURN NEW;
  END;

  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER update_minutes_used_trigger
  AFTER INSERT OR UPDATE OF duration_seconds ON consultations
  FOR EACH ROW
  WHEN (NEW.duration_seconds IS NOT NULL AND NEW.duration_seconds > 0)
  EXECUTE FUNCTION update_subscription_minutes();

-- Log trigger creation
DO $$
BEGIN
  RAISE LOG 'Created update_minutes_used_trigger on consultations table';
END$$; 