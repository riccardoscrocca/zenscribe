/*
  # Add RLS policies for user subscriptions

  1. Changes
    - Enable RLS on user_subscriptions table
    - Add policies for:
      - Users can read their own subscriptions
      - Users can update their own subscription minutes
      - Users can insert their own subscriptions
      - Service role can manage all subscriptions

  2. Security
    - Ensures users can only access and modify their own subscription data
    - Maintains data isolation between users
    - Allows service role (used by webhooks) to manage all subscriptions
*/

-- Enable RLS
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscriptions
CREATE POLICY "Users can read their own subscriptions"
ON user_subscriptions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Users can update their own subscription minutes
CREATE POLICY "Users can update their own subscription minutes"
ON user_subscriptions
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Users can insert their own subscriptions
CREATE POLICY "Users can insert their own subscriptions"
ON user_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Service role can manage all subscriptions (needed for webhook)
CREATE POLICY "Service role can manage subscriptions"
ON user_subscriptions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);