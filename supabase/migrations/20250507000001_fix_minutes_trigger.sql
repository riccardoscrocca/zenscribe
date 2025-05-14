-- Drop existing trigger
DROP TRIGGER IF EXISTS update_minutes_used_trigger ON consultations;
DROP FUNCTION IF EXISTS update_subscription_minutes();

-- Create debug log table if not exists
CREATE TABLE IF NOT EXISTS minutes_calculation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid,
  duration_seconds integer,
  calculated_minutes integer,
  user_id uuid,
  created_at timestamptz DEFAULT now()
);

-- Create new function with fixed minutes calculation
CREATE OR REPLACE FUNCTION update_subscription_minutes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_minutes integer;
  v_user_id uuid;
  v_subscription_id uuid;
  v_old_minutes integer;
BEGIN
  -- Log input values
  RAISE LOG 'Processing consultation: id=%, duration_seconds=%', NEW.id, NEW.duration_seconds;

  -- Validate duration_seconds
  IF NEW.duration_seconds IS NULL OR NEW.duration_seconds <= 0 THEN
    RAISE WARNING 'Invalid duration_seconds: %', NEW.duration_seconds;
    RETURN NEW;
  END IF;

  -- Calculate minutes (ceiling of seconds/60)
  v_minutes := CEIL(NEW.duration_seconds::float / 60);
  
  -- Get user_id from patient
  SELECT user_id INTO v_user_id
  FROM patients
  WHERE id = NEW.patient_id;

  IF v_user_id IS NULL THEN
    RAISE WARNING 'User not found for patient_id: %', NEW.patient_id;
    RETURN NEW;
  END IF;

  -- Log calculation
  INSERT INTO minutes_calculation_log (
    consultation_id,
    duration_seconds,
    calculated_minutes,
    user_id
  ) VALUES (
    NEW.id,
    NEW.duration_seconds,
    v_minutes,
    v_user_id
  );

  -- Get current subscription
  SELECT id, minutes_used INTO v_subscription_id, v_old_minutes
  FROM user_subscriptions
  WHERE user_id = v_user_id
  AND current_period_start <= now()
  AND current_period_end >= now();

  -- If no subscription exists, create one
  IF v_subscription_id IS NULL THEN
    WITH new_sub AS (
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
        v_minutes,
        date_trunc('month', now()),
        date_trunc('month', now()) + interval '1 month' - interval '1 second'
      FROM users u
      JOIN subscription_plans p ON p.name = u.subscription_tier
      WHERE u.id = v_user_id
      RETURNING id, minutes_used
    )
    SELECT id, minutes_used INTO v_subscription_id, v_old_minutes
    FROM new_sub;
    
    RAISE LOG 'Created new subscription: id=%, initial_minutes=%', v_subscription_id, v_minutes;
  ELSE
    -- Update existing subscription
    UPDATE user_subscriptions
    SET minutes_used = COALESCE(minutes_used, 0) + v_minutes
    WHERE id = v_subscription_id;
    
    RAISE LOG 'Updated subscription: id=%, old_minutes=%, added_minutes=%, new_total=%',
      v_subscription_id, v_old_minutes, v_minutes, (COALESCE(v_old_minutes, 0) + v_minutes);
  END IF;

  RETURN NEW;
END;
$$;

-- Create new trigger
CREATE TRIGGER update_minutes_used_trigger
AFTER INSERT OR UPDATE OF duration_seconds
ON consultations
FOR EACH ROW
EXECUTE FUNCTION update_subscription_minutes();

-- Reset and recalculate all minutes
DO $$
DECLARE
  r record;
BEGIN
  -- Reset all subscriptions
  UPDATE user_subscriptions SET minutes_used = 0;
  
  -- Recalculate minutes for all consultations
  FOR r IN (
    SELECT 
      c.id,
      c.duration_seconds,
      p.user_id,
      CEIL(c.duration_seconds::float / 60) as minutes
    FROM consultations c
    JOIN patients p ON p.id = c.patient_id
    WHERE c.duration_seconds > 0
  ) LOOP
    -- Update subscription
    UPDATE user_subscriptions
    SET minutes_used = COALESCE(minutes_used, 0) + r.minutes
    WHERE user_id = r.user_id
    AND current_period_start <= now()
    AND current_period_end >= now();
    
    -- Log calculation
    INSERT INTO minutes_calculation_log (
      consultation_id,
      duration_seconds,
      calculated_minutes,
      user_id
    ) VALUES (
      r.id,
      r.duration_seconds,
      r.minutes,
      r.user_id
    );
  END LOOP;
END;
$$; 