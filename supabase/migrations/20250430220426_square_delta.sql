-- Drop existing function
DROP FUNCTION IF EXISTS get_available_minutes(uuid);

-- Create new version with fixes
CREATE OR REPLACE FUNCTION get_available_minutes(p_user_id uuid)
RETURNS TABLE (
  minutes_used integer,
  monthly_minutes integer,
  minutes_remaining integer
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_tier text;
  v_plan_minutes integer;
  v_used_minutes integer := 0;
  v_period record;
  v_plan_id uuid;
BEGIN
  -- Get current period
  SELECT 
    date_trunc('month', now()) as period_start,
    (date_trunc('month', now()) + interval '1 month' - interval '1 second') as period_end
  INTO v_period;

  -- Get user's subscription tier
  SELECT subscription_tier INTO v_user_tier
  FROM users
  WHERE id = p_user_id;

  -- Get plan details
  SELECT id, monthly_minutes INTO v_plan_id, v_plan_minutes
  FROM subscription_plans
  WHERE name = v_user_tier;

  -- If no plan found, use Free plan
  IF v_plan_id IS NULL THEN
    SELECT id, monthly_minutes INTO v_plan_id, v_plan_minutes
    FROM subscription_plans
    WHERE name = 'Free';
  END IF;

  -- Ensure subscription exists for current period
  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    minutes_used,
    current_period_start,
    current_period_end
  )
  VALUES (
    p_user_id,
    v_plan_id,
    0,
    v_period.period_start,
    v_period.period_end
  )
  ON CONFLICT (user_id, current_period_start, current_period_end)
  DO NOTHING;

  -- Get minutes used in current period
  SELECT COALESCE(minutes_used, 0) INTO v_used_minutes
  FROM user_subscriptions
  WHERE user_id = p_user_id
  AND current_period_start = v_period.period_start
  AND current_period_end = v_period.period_end;

  -- For unlimited users (admin/enterprise), return max values
  IF v_user_tier = 'enterprise' OR EXISTS (
    SELECT 1 FROM users 
    WHERE id = p_user_id AND role IN ('admin', 'superadmin')
  ) THEN
    RETURN QUERY
    SELECT 
      0::integer as minutes_used,
      2147483647::integer as monthly_minutes,
      2147483647::integer as minutes_remaining;
    RETURN;
  END IF;

  -- Return the results
  RETURN QUERY
  SELECT 
    COALESCE(v_used_minutes, 0)::integer as minutes_used,
    COALESCE(v_plan_minutes, 30)::integer as monthly_minutes,
    GREATEST(0, COALESCE(v_plan_minutes, 30) - COALESCE(v_used_minutes, 0))::integer as minutes_remaining;

EXCEPTION WHEN OTHERS THEN
  -- Log error but return default values
  RAISE WARNING 'Error in get_available_minutes: %', SQLERRM;
  
  RETURN QUERY
  SELECT 
    0::integer as minutes_used,
    30::integer as monthly_minutes,
    30::integer as minutes_remaining;
END;
$$;

-- Ensure all users have current subscriptions
DO $$
DECLARE
  v_user record;
  v_period record;
  v_plan_id uuid;
BEGIN
  -- Get current period
  SELECT 
    date_trunc('month', now()) as period_start,
    (date_trunc('month', now()) + interval '1 month' - interval '1 second') as period_end
  INTO v_period;

  -- Process each user
  FOR v_user IN SELECT * FROM users LOOP
    -- Get plan ID based on user's tier
    SELECT id INTO v_plan_id
    FROM subscription_plans
    WHERE name = v_user.subscription_tier;

    -- If no matching plan, use Free plan
    IF v_plan_id IS NULL THEN
      SELECT id INTO v_plan_id
      FROM subscription_plans
      WHERE name = 'Free';
    END IF;

    -- Ensure subscription exists for current period
    INSERT INTO user_subscriptions (
      user_id,
      plan_id,
      minutes_used,
      current_period_start,
      current_period_end
    )
    VALUES (
      v_user.id,
      v_plan_id,
      0,
      v_period.period_start,
      v_period.period_end
    )
    ON CONFLICT (user_id, current_period_start, current_period_end)
    DO NOTHING;
  END LOOP;
END $$;