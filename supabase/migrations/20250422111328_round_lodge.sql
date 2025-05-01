-- Drop existing trigger first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop functions with CASCADE to handle dependencies
DROP FUNCTION IF EXISTS get_subscription_period() CASCADE;
DROP FUNCTION IF EXISTS ensure_current_subscription(uuid) CASCADE;
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;

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
CREATE OR REPLACE FUNCTION ensure_current_subscription(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period record;
  v_plan_id uuid;
  v_user_tier text;
BEGIN
  -- Get current period
  SELECT * INTO v_period FROM get_subscription_period();

  -- Get user's subscription tier
  SELECT subscription_tier INTO v_user_tier
  FROM users
  WHERE id = p_user_id;

  -- Get plan ID based on user's tier
  SELECT id INTO v_plan_id
  FROM subscription_plans
  WHERE name = COALESCE(v_user_tier, 'Free')
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

  -- Create or update subscription for current period
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
  ON CONFLICT (user_id, current_period_start, current_period_end)
  DO UPDATE SET
    plan_id = EXCLUDED.plan_id;

EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't block login
    RAISE NOTICE 'Error in ensure_current_subscription: %', SQLERRM;
END;
$$;

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Create user record with safe defaults
  INSERT INTO users (
    id,
    email,
    role,
    subscription_tier,
    is_active,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    'doctor',
    'free',
    true,
    now(),
    now()
  );

  -- Ensure subscription exists
  PERFORM ensure_current_subscription(NEW.id);

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't block user creation
    RAISE NOTICE 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Create trigger for new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Ensure Free plan exists
INSERT INTO subscription_plans (name, monthly_minutes, price_monthly)
SELECT 'Free', 30, 0
WHERE NOT EXISTS (
  SELECT 1 FROM subscription_plans WHERE name = 'Free'
);

-- Fix any existing users without subscriptions
DO $$
DECLARE
  v_user record;
BEGIN
  FOR v_user IN SELECT id FROM users LOOP
    PERFORM ensure_current_subscription(v_user.id);
  END LOOP;
END $$;