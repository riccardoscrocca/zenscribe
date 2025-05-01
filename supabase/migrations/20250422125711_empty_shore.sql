/*
  # Add get_available_minutes function

  1. New Function
    - `get_available_minutes(p_user_id uuid)`
      Returns:
      - minutes_used: Total minutes used in current period
      - monthly_minutes: Total minutes allowed per month
      - minutes_remaining: Remaining minutes available
      
  2. Description
    - Calculates available minutes for a user based on their subscription
    - Takes into account current subscription period
    - Returns default values for free tier if no subscription found
*/

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
  v_subscription RECORD;
  v_free_plan RECORD;
BEGIN
  -- Get current active subscription
  SELECT 
    us.minutes_used,
    sp.monthly_minutes
  INTO v_subscription
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id
  AND us.current_period_end >= NOW()
  ORDER BY us.current_period_end DESC
  LIMIT 1;

  -- If no subscription found, get free plan details
  IF v_subscription IS NULL THEN
    SELECT monthly_minutes INTO v_free_plan
    FROM subscription_plans
    WHERE name = 'Free'
    LIMIT 1;

    RETURN QUERY
    SELECT 
      0::integer as minutes_used,
      COALESCE(v_free_plan.monthly_minutes, 30)::integer as monthly_minutes,
      COALESCE(v_free_plan.monthly_minutes, 30)::integer as minutes_remaining;
  ELSE
    RETURN QUERY
    SELECT 
      COALESCE(v_subscription.minutes_used, 0)::integer as minutes_used,
      v_subscription.monthly_minutes::integer as monthly_minutes,
      (v_subscription.monthly_minutes - COALESCE(v_subscription.minutes_used, 0))::integer as minutes_remaining;
  END IF;
END;
$$;