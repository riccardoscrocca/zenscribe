-- Drop existing functions to recreate them
DROP FUNCTION IF EXISTS get_available_minutes(uuid);
DROP FUNCTION IF EXISTS update_minutes_used(uuid, integer);

-- Function to get available minutes
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
  v_is_unlimited boolean;
  v_subscription record;
  v_plan record;
BEGIN
  -- Check if user has unlimited minutes
  SELECT is_unlimited_user(p_user_id) INTO v_is_unlimited;
  
  IF v_is_unlimited THEN
    RETURN QUERY
    SELECT 
      0::integer as minutes_used,
      2147483647::integer as monthly_minutes,
      2147483647::integer as minutes_remaining;
    RETURN;
  END IF;

  -- Get current subscription and plan details
  SELECT 
    s.minutes_used,
    p.monthly_minutes,
    p.name as plan_name
  INTO v_subscription
  FROM user_subscriptions s
  JOIN subscription_plans p ON p.id = s.plan_id
  WHERE s.user_id = p_user_id
  AND s.current_period_start <= now()
  AND s.current_period_end >= now()
  LIMIT 1;

  -- If no subscription found, get user's tier and create one
  IF v_subscription IS NULL THEN
    SELECT p.* INTO v_plan
    FROM users u
    JOIN subscription_plans p ON p.name = u.subscription_tier
    WHERE u.id = p_user_id;

    -- Insert new subscription
    INSERT INTO user_subscriptions (
      user_id,
      plan_id,
      minutes_used,
      current_period_start,
      current_period_end
    ) VALUES (
      p_user_id,
      v_plan.id,
      0,
      date_trunc('month', now()),
      date_trunc('month', now()) + interval '1 month' - interval '1 second'
    );

    -- Return fresh subscription data
    RETURN QUERY
    SELECT 
      0::integer as minutes_used,
      v_plan.monthly_minutes,
      v_plan.monthly_minutes as minutes_remaining;
    RETURN;
  END IF;

  -- Return subscription stats
  RETURN QUERY
  SELECT 
    COALESCE(v_subscription.minutes_used, 0),
    v_subscription.monthly_minutes,
    (v_subscription.monthly_minutes - COALESCE(v_subscription.minutes_used, 0));
END;
$$;

-- Function to update minutes used
CREATE OR REPLACE FUNCTION update_minutes_used(
  p_user_id uuid,
  p_minutes integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_unlimited boolean;
  v_subscription record;
  v_plan record;
BEGIN
  -- Check if user has unlimited minutes
  SELECT is_unlimited_user(p_user_id) INTO v_is_unlimited;
  
  IF v_is_unlimited THEN
    RETURN TRUE;
  END IF;

  -- Get or create subscription
  WITH subscription_data AS (
    SELECT 
      s.id as subscription_id,
      s.minutes_used,
      p.monthly_minutes,
      p.name as plan_name
    FROM user_subscriptions s
    JOIN subscription_plans p ON p.id = s.plan_id
    WHERE s.user_id = p_user_id
    AND s.current_period_start <= now()
    AND s.current_period_end >= now()
  ), new_subscription AS (
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
      date_trunc('month', now()),
      date_trunc('month', now()) + interval '1 month' - interval '1 second'
    FROM users u
    JOIN subscription_plans p ON p.name = u.subscription_tier
    WHERE u.id = p_user_id
    AND NOT EXISTS (SELECT 1 FROM subscription_data)
    RETURNING id, 0 as minutes_used, (
      SELECT monthly_minutes 
      FROM subscription_plans 
      WHERE id = plan_id
    ) as monthly_minutes
  )
  SELECT 
    COALESCE(s.subscription_id, ns.id) as subscription_id,
    COALESCE(s.minutes_used, ns.minutes_used) as minutes_used,
    COALESCE(s.monthly_minutes, ns.monthly_minutes) as monthly_minutes
  INTO v_subscription
  FROM subscription_data s
  FULL OUTER JOIN new_subscription ns ON true;

  -- Check if update would exceed limit
  IF (v_subscription.minutes_used + p_minutes) > v_subscription.monthly_minutes THEN
    RETURN FALSE;
  END IF;

  -- Update minutes used
  UPDATE user_subscriptions
  SET minutes_used = COALESCE(minutes_used, 0) + p_minutes
  WHERE id = v_subscription.subscription_id;

  RETURN TRUE;
END;
$$;

-- Reset minutes used for all current subscriptions
UPDATE user_subscriptions
SET minutes_used = 0
WHERE current_period_start <= now()
AND current_period_end >= now();