-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_minutes_used_trigger ON consultations;
DROP FUNCTION IF EXISTS update_subscription_minutes();

-- Create function to update minutes used
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
BEGIN
  -- Calculate minutes from duration_seconds
  v_minutes := CEIL(NEW.duration_seconds::float / 60);
  
  RAISE NOTICE 'Updating minutes used: duration_seconds=%, minutes=%', NEW.duration_seconds, v_minutes;

  -- Get current period
  SELECT 
    date_trunc('month', now()) as period_start,
    (date_trunc('month', now()) + interval '1 month' - interval '1 second') as period_end
  INTO v_period;
  
  RAISE NOTICE 'Current period: start=%, end=%', v_period.period_start, v_period.period_end;

  -- Get user_id from patient
  SELECT user_id INTO v_user_id
  FROM patients 
  WHERE id = NEW.patient_id;
  
  RAISE NOTICE 'Found user_id: % for patient_id: %', v_user_id, NEW.patient_id;

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
    p.id,
    0,
    v_period.period_start,
    v_period.period_end
  FROM users u
  JOIN subscription_plans p ON p.name = u.subscription_tier
  WHERE u.id = v_user_id
  ON CONFLICT (user_id, current_period_start, current_period_end) 
  DO NOTHING;

  -- Update minutes used in current subscription period
  UPDATE user_subscriptions
  SET minutes_used = COALESCE(minutes_used, 0) + v_minutes
  WHERE user_id = v_user_id
  AND current_period_start = v_period.period_start
  AND current_period_end = v_period.period_end;
  
  RAISE NOTICE 'Updated minutes used for user % in period % to %', 
    v_user_id, v_period.period_start, v_period.period_end;

  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER update_minutes_used_trigger
  AFTER INSERT OR UPDATE OF duration_seconds ON consultations
  FOR EACH ROW
  WHEN (NEW.duration_seconds IS NOT NULL)
  EXECUTE FUNCTION update_subscription_minutes();

-- Update existing consultations
DO $$
DECLARE
  v_consultation record;
  v_period record;
  v_minutes integer;
BEGIN
  -- Get current period
  SELECT 
    date_trunc('month', now()) as period_start,
    (date_trunc('month', now()) + interval '1 month' - interval '1 second') as period_end
  INTO v_period;

  -- Process each consultation
  FOR v_consultation IN 
    SELECT c.*, p.user_id
    FROM consultations c
    JOIN patients p ON p.id = c.patient_id
    WHERE c.duration_seconds IS NOT NULL
  LOOP
    -- Calculate minutes
    v_minutes := CEIL(v_consultation.duration_seconds::float / 60);

    -- Update subscription
    UPDATE user_subscriptions
    SET minutes_used = COALESCE(minutes_used, 0) + v_minutes
    WHERE user_id = v_consultation.user_id
    AND current_period_start = v_period.period_start
    AND current_period_end = v_period.period_end;
  END LOOP;
END $$;