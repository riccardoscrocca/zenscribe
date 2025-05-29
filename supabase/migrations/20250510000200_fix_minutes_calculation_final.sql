-- Drop existing trigger and function
DROP TRIGGER IF EXISTS update_minutes_used_trigger ON consultations;
DROP FUNCTION IF EXISTS update_subscription_minutes();

-- Create or update debug log table
CREATE TABLE IF NOT EXISTS minutes_calculation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid,
  duration_seconds integer,
  calculated_minutes integer,
  user_id uuid,
  subscription_id uuid,
  old_minutes_used integer,
  new_minutes_used integer,
  plan_id uuid,
  monthly_limit integer,
  created_at timestamptz DEFAULT now()
);

-- Create new function with enhanced validation and logging
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
  v_plan_id uuid;
  v_monthly_limit integer;
  v_period_start timestamptz;
  v_period_end timestamptz;
BEGIN
  -- Get current period
  v_period_start := date_trunc('month', now());
  v_period_end := v_period_start + interval '1 month' - interval '1 second';

  -- Validate duration_seconds
  IF NEW.duration_seconds IS NULL OR NEW.duration_seconds <= 0 THEN
    RAISE WARNING 'Invalid duration_seconds value: %', NEW.duration_seconds;
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

  -- Get user's plan details
  SELECT p.id, p.monthly_minutes 
  INTO v_plan_id, v_monthly_limit
  FROM users u
  JOIN subscription_plans p ON p.name = u.subscription_tier
  WHERE u.id = v_user_id;

  IF v_plan_id IS NULL THEN
    -- Fallback to free plan if no plan found
    SELECT id, monthly_minutes 
    INTO v_plan_id, v_monthly_limit
    FROM subscription_plans 
    WHERE name = 'free'
    LIMIT 1;
  END IF;

  -- Get or create current subscription
  WITH current_sub AS (
    SELECT id, minutes_used
    FROM user_subscriptions
    WHERE user_id = v_user_id
    AND current_period_start = v_period_start
    AND current_period_end = v_period_end
  ), new_sub AS (
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
      v_period_start,
      v_period_end
    WHERE NOT EXISTS (SELECT 1 FROM current_sub)
    RETURNING id, minutes_used
  )
  SELECT 
    COALESCE(cs.id, ns.id),
    COALESCE(cs.minutes_used, ns.minutes_used)
  INTO v_subscription_id, v_old_minutes
  FROM current_sub cs
  FULL OUTER JOIN new_sub ns ON true;

  -- Update subscription with new minutes
  UPDATE user_subscriptions
  SET minutes_used = COALESCE(minutes_used, 0) + v_minutes
  WHERE id = v_subscription_id;

  -- Log the calculation
  INSERT INTO minutes_calculation_log (
    consultation_id,
    duration_seconds,
    calculated_minutes,
    user_id,
    subscription_id,
    old_minutes_used,
    new_minutes_used,
    plan_id,
    monthly_limit
  ) VALUES (
    NEW.id,
    NEW.duration_seconds,
    v_minutes,
    v_user_id,
    v_subscription_id,
    v_old_minutes,
    COALESCE(v_old_minutes, 0) + v_minutes,
    v_plan_id,
    v_monthly_limit
  );

  -- Log detailed information
  RAISE LOG 'Minutes calculation: consultation=%, seconds=%, minutes=%, user=%, subscription=%, old_total=%, new_total=%',
    NEW.id,
    NEW.duration_seconds,
    v_minutes,
    v_user_id,
    v_subscription_id,
    v_old_minutes,
    (COALESCE(v_old_minutes, 0) + v_minutes);

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
  v_plan_id uuid;
  v_monthly_limit integer;
BEGIN
  -- Reset all subscriptions for current period
  UPDATE user_subscriptions
  SET minutes_used = 0
  WHERE current_period_start = date_trunc('month', now())
  AND current_period_end = date_trunc('month', now()) + interval '1 month' - interval '1 second';
  
  -- Recalculate minutes for all consultations in current period
  FOR r IN (
    SELECT 
      c.id,
      c.duration_seconds,
      p.user_id,
      CEIL(c.duration_seconds::float / 60) as minutes
    FROM consultations c
    JOIN patients p ON p.id = c.patient_id
    WHERE c.duration_seconds > 0
    AND c.created_at >= date_trunc('month', now())
    AND c.created_at < date_trunc('month', now()) + interval '1 month'
  ) LOOP
    -- Get plan details
    SELECT p.id, p.monthly_minutes 
    INTO v_plan_id, v_monthly_limit
    FROM users u
    JOIN subscription_plans p ON p.name = u.subscription_tier
    WHERE u.id = r.user_id;

    -- Update subscription
    UPDATE user_subscriptions us
    SET minutes_used = COALESCE(minutes_used, 0) + r.minutes
    WHERE us.user_id = r.user_id
    AND us.current_period_start = date_trunc('month', now())
    AND us.current_period_end = date_trunc('month', now()) + interval '1 month' - interval '1 second'
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = r.user_id
    );
    
    -- Log calculation
    INSERT INTO minutes_calculation_log (
      consultation_id,
      duration_seconds,
      calculated_minutes,
      user_id,
      plan_id,
      monthly_limit
    ) VALUES (
      r.id,
      r.duration_seconds,
      r.minutes,
      r.user_id,
      v_plan_id,
      v_monthly_limit
    );
  END LOOP;
END;
$$; 