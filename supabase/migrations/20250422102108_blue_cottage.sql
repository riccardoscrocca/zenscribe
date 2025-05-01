/*
  # Update loredana's subscription tier to free
  
  1. Changes
    - Update subscription tier to 'free' for loredana@mediscribe.ai
    - Keep other user data unchanged
*/

DO $$ 
BEGIN
  -- Update subscription tier to free
  UPDATE users 
  SET 
    subscription_tier = 'free',
    updated_at = now()
  WHERE email = 'loredana@mediscribe.ai';
END $$;