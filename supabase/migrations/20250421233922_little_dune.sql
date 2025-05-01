/*
  # Add subscription plans and usage tracking

  1. New Tables
    - `subscription_plans`
      - Basic plan details and limits
    - `user_subscriptions`
      - Links users to plans and tracks usage

  2. Changes
    - Add duration tracking to consultations
    - Add usage tracking
*/

-- Create subscription plans table
CREATE TABLE subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  monthly_minutes int NOT NULL,
  price_monthly numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create user subscriptions table
CREATE TABLE user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) NOT NULL,
  plan_id uuid REFERENCES subscription_plans(id) NOT NULL,
  minutes_used int DEFAULT 0,
  current_period_start timestamptz NOT NULL,
  current_period_end timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Add duration tracking to consultations
ALTER TABLE consultations 
ADD COLUMN duration_seconds int;

-- Add indexes
CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_period ON user_subscriptions(current_period_start, current_period_end);

-- Insert default plans
INSERT INTO subscription_plans (name, monthly_minutes, price_monthly) VALUES
('Free', 30, 0),
('Basic', 120, 29),
('Pro', 300, 49),
('Enterprise', 1000, 99);

-- Enable RLS
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Add RLS policies
CREATE POLICY "Anyone can view plans"
ON subscription_plans FOR SELECT
TO public
USING (true);

CREATE POLICY "Users can view their subscriptions"
ON user_subscriptions FOR SELECT
TO public
USING (user_id = auth.uid());