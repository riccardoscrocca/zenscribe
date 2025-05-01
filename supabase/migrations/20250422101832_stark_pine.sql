/*
  # Add public.users record for existing auth user
  
  1. Changes
    - Create public.users record for loredana@mediscribe.ai
    - Use existing auth.users ID
    - Update user data if needed
    
  2. Security
    - Maintain foreign key constraints by using existing auth.users ID
*/

DO $$ 
DECLARE
  v_auth_user_id uuid;
BEGIN
  -- Get the existing auth user ID
  SELECT id INTO v_auth_user_id
  FROM auth.users
  WHERE email = 'loredana@mediscribe.ai';

  -- Create public.users record if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'loredana@mediscribe.ai') THEN
    INSERT INTO users (
      id,
      email,
      role,
      full_name,
      is_active,
      subscription_tier,
      created_at,
      updated_at
    ) VALUES (
      v_auth_user_id, -- Use existing auth user ID
      'loredana@mediscribe.ai',
      'doctor',
      'Loredana',
      true,
      'basic',
      now(),
      now()
    );
  END IF;

  -- Update existing user data if needed
  UPDATE users 
  SET 
    role = 'doctor',
    subscription_tier = 'basic',
    updated_at = now()
  WHERE email = 'loredana@mediscribe.ai';

END $$;