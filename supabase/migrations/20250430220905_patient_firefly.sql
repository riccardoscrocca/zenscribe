-- Drop existing function
DROP FUNCTION IF EXISTS get_available_minutes(uuid);

-- Create simplified version that just reads the actual minutes used
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
BEGIN
  -- Get user's subscription tier and plan minutes
  SELECT u.subscription_tier, p.monthly_minutes 
  INTO v_user_tier, v_plan_minutes
  FROM users u
  LEFT JOIN subscription_plans p ON p.name = u.subscription_tier
  WHERE u.id = p_user_id;

  -- If no plan found, use Free plan default
  IF v_plan_minutes IS NULL THEN
    v_plan_minutes := 30;
  END IF;

  -- Simply get the minutes_used from user_subscriptions
  SELECT minutes_used INTO v_used_minutes
  FROM user_subscriptions
  WHERE user_id = p_user_id
  AND current_period_start <= now()
  AND current_period_end >= now();

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

  -- Return the actual values from the database
  RETURN QUERY
  SELECT 
    COALESCE(v_used_minutes, 0)::integer as minutes_used,
    v_plan_minutes::integer as monthly_minutes,
    GREATEST(0, v_plan_minutes - COALESCE(v_used_minutes, 0))::integer as minutes_remaining;
END;
$$;