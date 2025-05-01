-- Drop existing functions
DROP FUNCTION IF EXISTS get_available_minutes(uuid);
DROP FUNCTION IF EXISTS update_minutes_used(uuid, integer);

-- Create function to get available minutes
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
  v_tier text;
  v_plan_minutes integer;
  v_used_minutes integer := 0;
  v_period record;
BEGIN
  -- Get user's subscription tier
  SELECT subscription_tier INTO v_tier
  FROM users
  WHERE id = p_user_id;

  -- Get plan minutes
  SELECT monthly_minutes INTO v_plan_minutes
  FROM subscription_plans
  WHERE name = v_tier;

  -- Get current period
  SELECT 
    date_trunc('month', now()) as period_start,
    (date_trunc('month', now()) + interval '1 month' - interval '1 second') as period_end
  INTO v_period;

  -- Get minutes used in current period
  SELECT minutes_used INTO v_used_minutes
  FROM user_subscriptions
  WHERE user_id = p_user_id
  AND current_period_start = v_period.period_start
  AND current_period_end = v_period.period_end;

  -- Return results
  RETURN QUERY
  SELECT 
    COALESCE(v_used_minutes, 0)::integer as minutes_used,
    COALESCE(v_plan_minutes, 30)::integer as monthly_minutes,
    (COALESCE(v_plan_minutes, 30) - COALESCE(v_used_minutes, 0))::integer as minutes_remaining;
END;
$$;

-- Create function to update minutes used
CREATE OR REPLACE FUNCTION update_minutes_used(
  p_user_id uuid,
  p_minutes integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tier text;
  v_plan_minutes integer;
  v_period record;
  v_subscription_id uuid;
BEGIN
  -- Get user's subscription tier and plan minutes
  SELECT u.subscription_tier, p.monthly_minutes 
  INTO v_tier, v_plan_minutes
  FROM users u
  JOIN subscription_plans p ON p.name = u.subscription_tier
  WHERE u.id = p_user_id;

  -- Get current period
  SELECT 
    date_trunc('month', now()) as period_start,
    (date_trunc('month', now()) + interval '1 month' - interval '1 second') as period_end
  INTO v_period;

  -- Get or create subscription for current period
  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    minutes_used,
    current_period_start,
    current_period_end
  )
  SELECT 
    p_user_id,
    p.id,
    0,
    v_period.period_start,
    v_period.period_end
  FROM subscription_plans p
  WHERE p.name = v_tier
  ON CONFLICT (user_id, current_period_start, current_period_end)
  DO UPDATE SET
    minutes_used = LEAST(user_subscriptions.minutes_used + p_minutes, v_plan_minutes)
  RETURNING id INTO v_subscription_id;

  RETURN v_subscription_id IS NOT NULL;
END;
$$;