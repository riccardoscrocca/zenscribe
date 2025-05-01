/*
  # Implement subscription tracking logic

  1. Changes
    - Add function to ensure subscription exists for current period
    - Add function to handle subscription period changes
    - Add function to handle subscription plan changes
    - Add trigger for automatic period rollover
    
  2. Security
    - Maintain RLS policies
    - Use security definer functions
    - Handle race conditions with proper locking
*/

-- Function to get current subscription period
CREATE OR REPLACE FUNCTION get_subscription_period()
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

-- Function to ensure subscription exists for current period
CREATE OR REPLACE FUNCTION ensure_current_subscription(
  p_user_id uuid,
  p_plan_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period record;
  v_plan_id uuid;
  v_subscription_id uuid;
  v_user_tier text;
BEGIN
  -- Get current period
  SELECT * INTO v_period FROM get_subscription_period();
  
  -- Get user's subscription tier if plan not specified
  IF p_plan_name IS NULL THEN
    SELECT subscription_tier INTO v_user_tier
    FROM users
    WHERE id = p_user_id;
    
    p_plan_name := v_user_tier;
  END IF;

  -- Get plan ID
  SELECT id INTO v_plan_id
  FROM subscription_plans
  WHERE name = p_plan_name
  LIMIT 1;

  -- If plan doesn't exist, use Free plan
  IF v_plan_id IS NULL THEN
    SELECT id INTO v_plan_id
    FROM subscription_plans
    WHERE name = 'Free'
    LIMIT 1;
  END IF;

  -- Try to get existing subscription for current period
  SELECT id INTO v_subscription_id
  FROM user_subscriptions
  WHERE user_id = p_user_id
  AND current_period_start = v_period.period_start
  AND current_period_end = v_period.period_end
  FOR UPDATE;

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
  ELSE
    -- Update plan if different
    UPDATE user_subscriptions
    SET plan_id = v_plan_id
    WHERE id = v_subscription_id
    AND plan_id != v_plan_id;
  END IF;

  RETURN v_subscription_id;
END;
$$;

-- Function to handle subscription plan changes
CREATE OR REPLACE FUNCTION handle_plan_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_period record;
  v_plan_id uuid;
BEGIN
  -- Only proceed if subscription_tier changed
  IF NEW.subscription_tier = OLD.subscription_tier THEN
    RETURN NEW;
  END IF;

  -- Get current period
  SELECT * INTO v_period FROM get_subscription_period();

  -- Get plan ID for new tier
  SELECT id INTO v_plan_id
  FROM subscription_plans
  WHERE name = NEW.subscription_tier;

  -- Update or create subscription for current period
  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    minutes_used,
    current_period_start,
    current_period_end
  ) VALUES (
    NEW.id,
    v_plan_id,
    0,
    v_period.period_start,
    v_period.period_end
  )
  ON CONFLICT (user_id, current_period_start, current_period_end)
  DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    minutes_used = 0;

  RETURN NEW;
END;
$$;

-- Add trigger for plan changes
DROP TRIGGER IF EXISTS on_subscription_tier_change ON users;
CREATE TRIGGER on_subscription_tier_change
  AFTER UPDATE OF subscription_tier ON users
  FOR EACH ROW
  EXECUTE FUNCTION handle_plan_change();

-- Function to handle login subscription check
CREATE OR REPLACE FUNCTION handle_login_subscription_check()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Ensure subscription exists for current period
  PERFORM ensure_current_subscription(NEW.id);
  RETURN NEW;
END;
$$;

-- Add trigger for login subscription check
DROP TRIGGER IF EXISTS on_user_login ON auth.users;
CREATE TRIGGER on_user_login
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_login_subscription_check();

-- Ensure all existing users have current subscriptions
DO $$
DECLARE
  v_user record;
BEGIN
  FOR v_user IN SELECT id FROM users LOOP
    PERFORM ensure_current_subscription(v_user.id);
  END LOOP;
END $$;