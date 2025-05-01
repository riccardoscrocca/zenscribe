/*
  # Add subscription tier and create test user

  1. Changes
    - Add subscription_tier column to users table
    - Set default tier to 'free'
    - Create test user with superadmin role using auth admin API
    
  2. Security
    - Maintain existing RLS policies
    - Use proper auth functions for user creation
*/

-- Add subscription_tier column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS subscription_tier text NOT NULL DEFAULT 'free';

-- Add comment for clarity
COMMENT ON COLUMN users.subscription_tier IS 'User subscription tier (free, basic, pro, enterprise)';

-- Create test user with superadmin role
DO $$ 
DECLARE
  v_user_id uuid;
BEGIN
  -- Create auth user using admin API
  SELECT id INTO v_user_id 
  FROM auth.users
  WHERE email = 'ric@g.com';

  IF v_user_id IS NULL THEN
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      'ric@g.com',
      crypt('test', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"name":"ric"}',
      now(),
      now(),
      encode(gen_random_bytes(32), 'base64'),
      null,
      null,
      null
    ) RETURNING id INTO v_user_id;

    -- Create user record
    INSERT INTO users (
      id,
      email,
      role,
      subscription_tier
    ) VALUES (
      v_user_id,
      'ric@g.com',
      'superadmin',
      'enterprise'
    );
  END IF;
END $$;