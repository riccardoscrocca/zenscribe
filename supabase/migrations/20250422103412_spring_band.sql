/*
  # Fix Riccardo's subscription and add unique constraint

  1. Changes
    - Add unique constraint for subscription periods
    - Update subscription tier to basic
    - Ensure Basic plan exists
    - Create/update subscription for current period
    
  2. Security
    - No changes to RLS policies
*/

-- Add unique constraint for subscription periods if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'user_subscriptions_period_key'
  ) THEN
    ALTER TABLE user_subscriptions
    ADD CONSTRAINT user_subscriptions_period_key 
    UNIQUE (user_id, current_period_start, current_period_end);
  END IF;
END $$;

DO $$ 
BEGIN
  -- Update Riccardo's subscription tier to basic
  UPDATE users 
  SET 
    subscription_tier = 'basic',
    updated_at = now()
  WHERE email = 'riccardo.scrocca@gmail.com';

  -- Ensure basic plan exists with correct limits
  INSERT INTO subscription_plans (name, monthly_minutes, price_monthly)
  SELECT 'Basic', 300, 49
  WHERE NOT EXISTS (
    SELECT 1 FROM subscription_plans WHERE name = 'Basic'
  );

  -- Delete any existing subscription for this period to avoid conflicts
  DELETE FROM user_subscriptions
  WHERE user_id = (SELECT id FROM users WHERE email = 'riccardo.scrocca@gmail.com')
  AND current_period_start = date_trunc('month', now())
  AND current_period_end = date_trunc('month', now()) + interval '1 month' - interval '1 second';

  -- Create new subscription for current period
  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    minutes_used,
    current_period_start,
    current_period_end
  )
  SELECT 
    u.id,
    p.id,
    0,
    date_trunc('month', now()),
    date_trunc('month', now()) + interval '1 month' - interval '1 second'
  FROM users u
  CROSS JOIN subscription_plans p
  WHERE u.email = 'riccardo.scrocca@gmail.com'
  AND p.name = 'Basic';

END $$;