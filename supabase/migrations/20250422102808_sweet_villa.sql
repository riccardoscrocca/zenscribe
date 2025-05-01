-- Drop existing functions
DROP FUNCTION IF EXISTS is_unlimited_user(uuid);
DROP FUNCTION IF EXISTS get_available_minutes(uuid);
DROP FUNCTION IF EXISTS update_minutes_used(uuid, integer);

-- Create function to check if user has unlimited minutes
CREATE OR REPLACE FUNCTION is_unlimited_user(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_tier text;
BEGIN
  SELECT role, subscription_tier INTO v_role, v_tier
  FROM users
  WHERE id = user_id;
  
  RETURN v_role IN ('admin', 'superadmin') OR v_tier = 'enterprise';
END;
$$;

-- Function to get current subscription period
CREATE OR REPLACE FUNCTION get_current_subscription_period()
RETURNS TABLE (
  period_start timestamptz,
  period_end timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    date_trunc('month', now()) as period_start,
    (date_trunc('month', now()) + interval '1 month' - interval '1 second') as period_end;
$$;

-- Function to ensure user has a subscription record
CREATE OR REPLACE FUNCTION ensure_user_subscription(
  p_user_id uuid,
  p_plan_name text DEFAULT 'Free'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription_id uuid;
  v_plan_id uuid;
  v_period record;
BEGIN
  -- Get current period
  SELECT * INTO v_period FROM get_current_subscription_period();
  
  -- Get plan ID
  SELECT id INTO v_plan_id
  FROM subscription_plans
  WHERE name = p_plan_name
  LIMIT 1;

  -- Check for existing active subscription
  SELECT id INTO v_subscription_id
  FROM user_subscriptions
  WHERE user_id = p_user_id
  AND current_period_start = v_period.period_start
  AND current_period_end = v_period.period_end
  LIMIT 1;

  -- Create new subscription if none exists
  IF v_subscription_id IS NULL THEN
    INSERT INTO user_subscriptions (
      user_id,
      plan_id,
      minutes_used,
      current_period_start,
      current_period_end
    ) VALUES (
      p_user_id,
      v_plan_id,
      0,
      v_period.period_start,
      v_period.period_end
    )
    RETURNING id INTO v_subscription_id;
  END IF;

  RETURN v_subscription_id;
END;
$$;

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
  v_subscription_id uuid;
  v_subscription record;
  v_plan record;
  v_is_unlimited boolean;
  v_period record;
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

  -- Get current period
  SELECT * INTO v_period FROM get_current_subscription_period();

  -- Ensure user has a subscription and get its ID
  SELECT ensure_user_subscription(p_user_id) INTO v_subscription_id;

  -- Get subscription details
  SELECT s.*, p.* INTO v_subscription
  FROM user_subscriptions s
  JOIN subscription_plans p ON p.id = s.plan_id
  WHERE s.id = v_subscription_id;

  -- Return usage stats
  RETURN QUERY
  SELECT 
    COALESCE(v_subscription.minutes_used, 0),
    v_subscription.monthly_minutes,
    GREATEST(0, v_subscription.monthly_minutes - COALESCE(v_subscription.minutes_used, 0));
END;
$$;

-- Function to update minutes used with proper locking
CREATE OR REPLACE FUNCTION update_minutes_used(
  p_user_id uuid,
  p_minutes integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription_id uuid;
  v_subscription record;
  v_is_unlimited boolean;
  v_period record;
BEGIN
  -- Check if user has unlimited minutes
  SELECT is_unlimited_user(p_user_id) INTO v_is_unlimited;
  IF v_is_unlimited THEN
    RETURN TRUE;
  END IF;

  -- Get current period
  SELECT * INTO v_period FROM get_current_subscription_period();

  -- Ensure user has a subscription and get its ID
  SELECT ensure_user_subscription(p_user_id) INTO v_subscription_id;

  -- Lock the subscription row for update
  SELECT s.* INTO v_subscription
  FROM user_subscriptions s
  WHERE s.id = v_subscription_id
  FOR UPDATE;

  -- Check if update would exceed limit and update atomically
  UPDATE user_subscriptions
  SET minutes_used = COALESCE(minutes_used, 0) + p_minutes
  WHERE id = v_subscription_id
  AND (COALESCE(minutes_used, 0) + p_minutes) <= (
    SELECT monthly_minutes 
    FROM subscription_plans 
    WHERE id = plan_id
  );

  -- Return true if row was updated, false if limit would be exceeded
  RETURN FOUND;
END;
$$;

-- Create a trigger to handle monthly reset
CREATE OR REPLACE FUNCTION handle_subscription_period_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_period record;
BEGIN
  -- Get current period
  SELECT * INTO v_period FROM get_current_subscription_period();

  -- If subscription is for a different period, create a new one
  IF NEW.current_period_start != v_period.period_start OR 
     NEW.current_period_end != v_period.period_end THEN
    
    -- Create new subscription for current period
    INSERT INTO user_subscriptions (
      user_id,
      plan_id,
      minutes_used,
      current_period_start,
      current_period_end
    ) VALUES (
      NEW.user_id,
      NEW.plan_id,
      0,
      v_period.period_start,
      v_period.period_end
    );
    
    RETURN NULL; -- Prevent the original update
  END IF;

  RETURN NEW;
END;
$$;

-- Add trigger to handle period changes
DROP TRIGGER IF EXISTS subscription_period_change ON user_subscriptions;
CREATE TRIGGER subscription_period_change
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW
  WHEN (
    NEW.current_period_start != OLD.current_period_start OR
    NEW.current_period_end != OLD.current_period_end
  )
  EXECUTE FUNCTION handle_subscription_period_change();

-- Ensure Free plan exists
INSERT INTO subscription_plans (name, monthly_minutes, price_monthly)
SELECT 'Free', 30, 0
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = 'Free');