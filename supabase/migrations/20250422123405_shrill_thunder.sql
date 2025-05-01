-- Drop existing functions to recreate them
DROP FUNCTION IF EXISTS handle_login_subscription_check() CASCADE;
DROP FUNCTION IF EXISTS get_subscription_period() CASCADE;

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

-- Function to handle subscription check on login
CREATE OR REPLACE FUNCTION handle_login_subscription_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period record;
  v_user record;
  v_plan_id uuid;
  v_subscription_id uuid;
BEGIN
  -- Get current period
  SELECT * INTO v_period FROM get_subscription_period();
  
  -- Get user details including subscription tier
  SELECT * INTO v_user
  FROM users
  WHERE id = NEW.id;

  -- If user doesn't exist in users table yet, they're probably signing up
  -- Let the handle_new_user trigger handle that case
  IF v_user IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get plan ID based on user's tier
  SELECT id INTO v_plan_id
  FROM subscription_plans
  WHERE name = v_user.subscription_tier
  LIMIT 1;

  -- If no matching plan found, use Free plan
  IF v_plan_id IS NULL THEN
    SELECT id INTO v_plan_id
    FROM subscription_plans
    WHERE name = 'Free'
    LIMIT 1;

    -- Create Free plan if it doesn't exist
    IF v_plan_id IS NULL THEN
      INSERT INTO subscription_plans (name, monthly_minutes, price_monthly)
      VALUES ('Free', 30, 0)
      RETURNING id INTO v_plan_id;
    END IF;
  END IF;

  -- Check for existing subscription in current period
  SELECT id INTO v_subscription_id
  FROM user_subscriptions
  WHERE user_id = NEW.id
  AND current_period_start = v_period.period_start
  AND current_period_end = v_period.period_end;

  -- Create new subscription if none exists for current period
  IF v_subscription_id IS NULL THEN
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
    );
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't block login
    RAISE NOTICE 'Error in handle_login_subscription_check: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Create trigger for login subscription check
DROP TRIGGER IF EXISTS on_user_login ON auth.users;
CREATE TRIGGER on_user_login
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_login_subscription_check();

-- Ensure all existing users have current subscriptions
DO $$
DECLARE
  v_period record;
  v_user record;
  v_plan_id uuid;
BEGIN
  -- Get current period
  SELECT * INTO v_period FROM get_subscription_period();

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

    -- Create subscription if none exists for current period
    INSERT INTO user_subscriptions (
      user_id,
      plan_id,
      minutes_used,
      current_period_start,
      current_period_end
    )
    SELECT
      v_user.id,
      v_plan_id,
      0,
      v_period.period_start,
      v_period.period_end
    WHERE NOT EXISTS (
      SELECT 1
      FROM user_subscriptions
      WHERE user_id = v_user.id
      AND current_period_start = v_period.period_start
      AND current_period_end = v_period.period_end
    );
  END LOOP;
END $$;