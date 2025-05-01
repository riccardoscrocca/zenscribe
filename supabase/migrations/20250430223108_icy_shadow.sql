-- Drop existing function
DROP FUNCTION IF EXISTS get_available_minutes(uuid);

-- Create fixed version that correctly returns plan minutes
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
BEGIN
  -- Get current period
  SELECT 
    date_trunc('month', now()) as period_start,
    (date_trunc('month', now()) + interval '1 month' - interval '1 second') as period_end
  INTO v_period;

  -- Get user's subscription tier and plan minutes
  SELECT u.subscription_tier, p.monthly_minutes 
  INTO v_user_tier, v_plan_minutes
  FROM users u
  JOIN subscription_plans p ON p.name = u.subscription_tier
  WHERE u.id = p_user_id;

  -- Get minutes used from current subscription period
  SELECT minutes_used INTO v_used_minutes
  FROM user_subscriptions us
  WHERE us.user_id = p_user_id
  AND us.current_period_start = v_period.period_start
  AND us.current_period_end = v_period.period_end;

  -- For unlimited users (admin/enterprise), return max values
  IF v_user_tier = 'enterprise' OR EXISTS (
    SELECT 1 FROM users 
    WHERE id = p_user_id AND role IN ('admin', 'superadmin')
  ) THEN
    RETURN QUERY
    SELECT 
      COALESCE(v_used_minutes, 0)::integer as minutes_used,
      10000::integer as monthly_minutes,
      (10000 - COALESCE(v_used_minutes, 0))::integer as minutes_remaining;
    RETURN;
  END IF;

  -- Return the actual values
  RETURN QUERY
  SELECT 
    COALESCE(v_used_minutes, 0)::integer as minutes_used,
    COALESCE(v_plan_minutes, 30)::integer as monthly_minutes,
    GREATEST(0, COALESCE(v_plan_minutes, 30) - COALESCE(v_used_minutes, 0))::integer as minutes_remaining;
END;
$$;