/*
  # Fix user creation and subscription setup

  1. Changes
    - Add trigger to handle new user creation
    - Ensure proper subscription setup on signup
    - Fix RLS policies for new users
    
  2. Security
    - Maintain RLS policies
    - Handle edge cases safely
*/

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period record;
  v_plan_id uuid;
BEGIN
  -- Get current period
  SELECT * INTO v_period FROM get_subscription_period();

  -- Get Free plan ID
  SELECT id INTO v_plan_id
  FROM subscription_plans
  WHERE name = 'Free'
  LIMIT 1;

  -- If no Free plan exists, create it
  IF v_plan_id IS NULL THEN
    INSERT INTO subscription_plans (name, monthly_minutes, price_monthly)
    VALUES ('Free', 30, 0)
    RETURNING id INTO v_plan_id;
  END IF;

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

  -- Create initial subscription
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

  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger for new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Update RLS policies for users table
DROP POLICY IF EXISTS "Enable insert for authentication service" ON users;
CREATE POLICY "Enable insert for authentication service"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id OR auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile"
  ON users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile"
  ON users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR auth.jwt()->>'role' = 'service_role')
  WITH CHECK (id = auth.uid() OR auth.jwt()->>'role' = 'service_role');

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
  v_period record;
  v_plan_id uuid;
BEGIN
  -- Get current period
  SELECT * INTO v_period FROM get_subscription_period();
  
  -- Get Free plan ID
  SELECT id INTO v_plan_id 
  FROM subscription_plans 
  WHERE name = 'Free';

  -- Find users without subscriptions
  FOR v_user IN 
    SELECT u.* 
    FROM users u
    LEFT JOIN user_subscriptions s ON 
      s.user_id = u.id AND 
      s.current_period_start = v_period.period_start
    WHERE s.id IS NULL
  LOOP
    -- Create subscription for user
    INSERT INTO user_subscriptions (
      user_id,
      plan_id,
      minutes_used,
      current_period_start,
      current_period_end
    ) VALUES (
      v_user.id,
      v_plan_id,
      0,
      v_period.period_start,
      v_period.period_end
    );
  END LOOP;
END $$;