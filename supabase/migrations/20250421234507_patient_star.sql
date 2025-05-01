/*
  # Add subscription system tables and functions

  1. New Tables
    - `subscription_plans`
      - Pre-defined subscription tiers
      - Monthly minutes and pricing
    - `user_subscriptions`
      - Links users to plans
      - Tracks minutes usage
      - Handles subscription periods

  2. Functions
    - Add function to update minutes used
    - Add function to check minutes availability
    
  3. Security
    - Enable RLS on all tables
    - Add appropriate policies
*/

-- Create subscription plans table if not exists
CREATE TABLE IF NOT EXISTS subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  monthly_minutes integer NOT NULL,
  price_monthly numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create user subscriptions table if not exists
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) NOT NULL,
  plan_id uuid REFERENCES subscription_plans(id) NOT NULL,
  minutes_used integer DEFAULT 0,
  current_period_start timestamptz NOT NULL,
  current_period_end timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, current_period_start, current_period_end)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_period ON user_subscriptions(current_period_start, current_period_end);

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
  v_subscription RECORD;
  v_plan RECORD;
BEGIN
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

-- Function to check available minutes
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

-- Enable RLS
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view plans" ON subscription_plans;
DROP POLICY IF EXISTS "Users can view their subscriptions" ON user_subscriptions;

-- Add RLS policies
CREATE POLICY "Anyone can view plans"
ON subscription_plans FOR SELECT
TO public
USING (true);

CREATE POLICY "Users can view their subscriptions"
ON user_subscriptions FOR SELECT
TO public
USING (user_id = auth.uid());

-- Insert default plans if they don't exist
INSERT INTO subscription_plans (name, monthly_minutes, price_monthly)
SELECT 'Free', 30, 0
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = 'Free');

INSERT INTO subscription_plans (name, monthly_minutes, price_monthly)
SELECT 'Basic', 120, 49
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = 'Basic');

INSERT INTO subscription_plans (name, monthly_minutes, price_monthly)
SELECT 'Pro', 300, 99
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = 'Pro');

INSERT INTO subscription_plans (name, monthly_minutes, price_monthly)
SELECT 'Enterprise', 1000, 499
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = 'Enterprise');