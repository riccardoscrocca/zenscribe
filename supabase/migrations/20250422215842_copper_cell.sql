/*
  # Add foreign key relationship between users and user_subscriptions tables

  1. Changes
    - Add foreign key constraint from user_subscriptions.user_id to users.id
    - Add index on user_subscriptions.user_id for better query performance

  2. Security
    - No changes to RLS policies
*/

-- Add foreign key constraint
ALTER TABLE user_subscriptions 
ADD CONSTRAINT user_subscriptions_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES users(id);

-- Add index for the foreign key
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id 
ON user_subscriptions(user_id);