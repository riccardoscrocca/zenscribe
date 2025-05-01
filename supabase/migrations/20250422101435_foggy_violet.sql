/*
  # Create auth users and profiles
  
  1. Changes
    - Create users in auth.users first
    - Then create corresponding profiles in public.users
    - Handle existing users properly
    
  2. Security
    - Maintain proper auth flow
    - Keep existing user data
*/

DO $$ 
DECLARE
  v_auth_uid uuid;
BEGIN
  -- Create auth users first if they don't exist
  -- superadmin@mediscribe.ai
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'superadmin@mediscribe.ai') THEN
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
      updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      'fab8a46f-d4ff-4222-bbab-ba4c9f3e7d33',
      'authenticated',
      'authenticated',
      'superadmin@mediscribe.ai',
      crypt('admin123', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"name":"Super Admin"}',
      now(),
      now()
    );
  END IF;

  -- riccardo.scrocca@gmail.com
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'riccardo.scrocca@gmail.com') THEN
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
      updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      '1e4f9cb2-f4b7-428e-9e3a-e7ae32d4e329',
      'authenticated',
      'authenticated',
      'riccardo.scrocca@gmail.com',
      crypt('doctor123', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"name":"Riccardo Scrocca"}',
      now(),
      now()
    );
  END IF;

  -- Now create or update profiles in public.users
  -- superadmin
  IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'superadmin@mediscribe.ai') THEN
    INSERT INTO users (id, email, role, full_name, is_active, subscription_tier, created_at, updated_at)
    VALUES ('fab8a46f-d4ff-4222-bbab-ba4c9f3e7d33', 'superadmin@mediscribe.ai', 'admin', 'Super Admin', true, 'enterprise', '2025-04-22 00:43:54.779952+00', '2025-04-22 00:43:54.779952+00');
  END IF;

  -- riccardo
  IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'riccardo.scrocca@gmail.com') THEN
    INSERT INTO users (id, email, role, full_name, is_active, subscription_tier, created_at, updated_at)
    VALUES ('1e4f9cb2-f4b7-428e-9e3a-e7ae32d4e329', 'riccardo.scrocca@gmail.com', 'doctor', 'Riccardo Scrocca', true, 'enterprise', '2025-04-22 00:04:28.801136+00', '2025-04-22 00:04:28.801136+00');
  END IF;

  -- Update existing users with latest data
  UPDATE users 
  SET 
    role = CASE 
      WHEN email = 'superadmin@mediscribe.ai' THEN 'admin'
      WHEN email = 'riccardo.scrocca@gmail.com' THEN 'doctor'
      ELSE role
    END,
    subscription_tier = CASE 
      WHEN email IN ('superadmin@mediscribe.ai', 'riccardo.scrocca@gmail.com') THEN 'enterprise'
      ELSE subscription_tier
    END,
    updated_at = now()
  WHERE email IN (
    'superadmin@mediscribe.ai',
    'riccardo.scrocca@gmail.com'
  );
END $$;