/*
  # Fix admin subscription handling

  1. Changes
    - Add function to check if user is admin
    - Update get_available_minutes function to handle admin users
    - Update update_minutes_used function to handle admin users
    
  2. Security
    - Maintain RLS policies
    - Add proper error handling
*/

-- Create function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role
  FROM users
  WHERE id = user_id;
  
  RETURN v_role IN ('admin', 'superadmin');
END;
$$;

-- Update get_available_minutes function to handle admin users
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
  v_plan RECORD;
BEGIN
  -- Check if user is admin
  IF is_admin(p_user_id) THEN
    RETURN QUERY
    SELECT 
      0::integer as minutes_used,
      2147483647::integer as monthly_minutes, -- Using max int as "infinity"
      2147483647::integer as minutes_remaining;
    RETURN;
  END IF;

  -- Get current subscription
  SELECT * INTO v_subscription
  FROM user_subscriptions
  WHERE user_id = p_user_id
  AND current_period_start <= now()
  AND current_period_end >= now()
  LIMIT 1;

  -- If no subscription, return free plan limits
  IF v_subscription IS NULL THEN
    SELECT * INTO v_plan
    FROM subscription_plans
    WHERE name = 'Free'
    LIMIT 1;

    RETURN QUERY
    SELECT 
      0::integer as minutes_used,
      v_plan.monthly_minutes,
      v_plan.monthly_minutes as minutes_remaining;
    RETURN;
  END IF;

  -- Get plan details
  SELECT * INTO v_plan
  FROM subscription_plans
  WHERE id = v_subscription.plan_id;

  -- Return usage stats
  RETURN QUERY
  SELECT 
    v_subscription.minutes_used,
    v_plan.monthly_minutes,
    (v_plan.monthly_minutes - v_subscription.minutes_used) as minutes_remaining;
END;
$$;

-- Update update_minutes_used function to handle admin users
CREATE OR REPLACE FUNCTION update_minutes_used(
  p_user_id uuid,
  p_minutes integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription RECORD;
  v_plan RECORD;
BEGIN
  -- Check if user is admin
  IF is_admin(p_user_id) THEN
    RETURN TRUE;
  END IF;

  -- Get current subscription
  SELECT * INTO v_subscription
  FROM user_subscriptions
  WHERE user_id = p_user_id
  AND current_period_start <= now()
  AND current_period_end >= now()
  LIMIT 1;

  -- If no subscription, use free plan
  IF v_subscription IS NULL THEN
    SELECT * INTO v_plan
    FROM subscription_plans
    WHERE name = 'Free'
    LIMIT 1;

    -- Create free subscription
    INSERT INTO user_subscriptions (
      user_id,
      plan_id,
      minutes_used,
      current_period_start,
      current_period_end
    ) VALUES (
      p_user_id,
      v_plan.id,
      p_minutes,
      date_trunc('month', now()),
      date_trunc('month', now()) + interval '1 month' - interval '1 second'
    );
    
    RETURN TRUE;
  END IF;

  -- Get plan details
  SELECT * INTO v_plan
  FROM subscription_plans
  WHERE id = v_subscription.plan_id;

  -- Check if update would exceed limit
  IF (v_subscription.minutes_used + p_minutes) > v_plan.monthly_minutes THEN
    RETURN FALSE;
  END IF;

  -- Update minutes used
  UPDATE user_subscriptions
  SET minutes_used = minutes_used + p_minutes
  WHERE id = v_subscription.id;

  RETURN TRUE;
END;
$$;