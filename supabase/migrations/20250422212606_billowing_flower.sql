-- Drop existing policies
DROP POLICY IF EXISTS "Users can read their own subscriptions" ON user_subscriptions;
DROP POLICY IF EXISTS "Users can update their own subscription minutes" ON user_subscriptions;
DROP POLICY IF EXISTS "Users can insert their own subscriptions" ON user_subscriptions;
DROP POLICY IF EXISTS "Service role can manage subscriptions" ON user_subscriptions;

-- Enable RLS
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Create new policies with proper checks
CREATE POLICY "Users can read their own subscriptions"
ON user_subscriptions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can update their own subscriptions"
ON user_subscriptions
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can insert their own subscriptions"
ON user_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Add unique constraint for period if not exists
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

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_period 
ON user_subscriptions(user_id, current_period_start, current_period_end);