-- Drop existing function
DROP FUNCTION IF EXISTS get_available_minutes(uuid);

-- Create debug version that logs values
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
  v_subscription record;
BEGIN
  -- Log input
  RAISE NOTICE 'Getting minutes for user_id: %', p_user_id;

  -- Get user's subscription tier and plan minutes
  SELECT u.subscription_tier, p.monthly_minutes 
  INTO v_user_tier, v_plan_minutes
  FROM users u
  LEFT JOIN subscription_plans p ON p.name = u.subscription_tier
  WHERE u.id = p_user_id;

  RAISE NOTICE 'User tier: %, Plan minutes: %', v_user_tier, v_plan_minutes;

  -- If no plan found, use Free plan default
  IF v_plan_minutes IS NULL THEN
    v_plan_minutes := 30;
    RAISE NOTICE 'Using default plan minutes: %', v_plan_minutes;
  END IF;

  -- Get subscription details with period info
  SELECT * INTO v_subscription
  FROM user_subscriptions
  WHERE user_id = p_user_id
  AND current_period_start <= now()
  AND current_period_end >= now();

  RAISE NOTICE 'Found subscription: %', v_subscription IS NOT NULL;
  IF v_subscription IS NOT NULL THEN
    RAISE NOTICE 'Subscription details: id=%, minutes_used=%, period=% to %',
      v_subscription.id,
      v_subscription.minutes_used,
      v_subscription.current_period_start,
      v_subscription.current_period_end;
  END IF;

  -- Get minutes used from subscription
  v_used_minutes := COALESCE(v_subscription.minutes_used, 0);
  RAISE NOTICE 'Minutes used: %', v_used_minutes;

  -- For unlimited users (admin/enterprise), return max values
  IF v_user_tier = 'enterprise' OR EXISTS (
    SELECT 1 FROM users 
    WHERE id = p_user_id AND role IN ('admin', 'superadmin')
  ) THEN
    RAISE NOTICE 'User has unlimited minutes';
    RETURN QUERY
    SELECT 
      0::integer as minutes_used,
      2147483647::integer as monthly_minutes,
      2147483647::integer as minutes_remaining;
    RETURN;
  END IF;

  -- Calculate remaining minutes
  RAISE NOTICE 'Returning: used=%, total=%, remaining=%',
    v_used_minutes,
    v_plan_minutes,
    GREATEST(0, v_plan_minutes - v_used_minutes);

  -- Return the actual values from the database
  RETURN QUERY
  SELECT 
    v_used_minutes::integer as minutes_used,
    v_plan_minutes::integer as monthly_minutes,
    GREATEST(0, v_plan_minutes - v_used_minutes)::integer as minutes_remaining;
END;
$$;