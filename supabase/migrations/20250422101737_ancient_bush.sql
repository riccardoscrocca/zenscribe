/*
  # Add test users to auth and public schemas
  
  1. Changes
    - Create users in auth.users first
    - Then create corresponding records in public.users
    - Maintain existing user data
    
  2. Security
    - Use proper password hashing
    - Maintain foreign key constraints
*/

DO $$ 
BEGIN
  -- First ensure auth.users records exist
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'loredana@mediscribe.ai') THEN
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
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      '11111111-1111-1111-1111-111111111111',
      'authenticated',
      'authenticated',
      'loredana@mediscribe.ai',
      crypt('Mediga', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"name":"Loredana"}',
      now(),
      now(),
      encode(gen_random_bytes(32), 'base64'),
      encode(gen_random_bytes(32), 'base64')
    );
  END IF;

  -- Now we can safely create the public.users record
  -- First check if the auth user exists and get their ID
  INSERT INTO users (
    id,
    email,
    role,
    full_name,
    is_active,
    subscription_tier,
    created_at,
    updated_at
  )
  SELECT
    a.id,
    'loredana@mediscribe.ai',
    'doctor',
    'Loredana',
    true,
    'basic',
    now(),
    now()
  FROM auth.users a
  WHERE a.email = 'loredana@mediscribe.ai'
  AND NOT EXISTS (
    SELECT 1 FROM users u WHERE u.email = 'loredana@mediscribe.ai'
  );

  -- Update existing user data if needed
  UPDATE users 
  SET 
    role = 'doctor',
    subscription_tier = 'basic',
    updated_at = now()
  WHERE email = 'loredana@mediscribe.ai';

END $$;