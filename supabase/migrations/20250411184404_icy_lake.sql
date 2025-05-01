/*
  # Set up authentication schema

  1. Changes
    - Add password_hash column to users table
    - Add functions for password hashing and verification
    - Set up RLS policies for user authentication
*/

-- Enable pgcrypto extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add auth-related columns to users table if they don't exist
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'password_hash'
  ) THEN
    ALTER TABLE users ADD COLUMN password_hash text;
  END IF;
END $$;

-- Create a function to hash passwords using pgcrypto
CREATE OR REPLACE FUNCTION hash_password(input_password text)
RETURNS text AS $$
BEGIN
  RETURN crypt(input_password, gen_salt('bf'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to verify passwords
CREATE OR REPLACE FUNCTION verify_password(input_email text, password_attempt text)
RETURNS TABLE (
  id uuid,
  email text,
  username text
) AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.email, u.username
  FROM users u
  WHERE u.email = input_email
  AND u.password_hash = crypt(password_attempt, u.password_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the users table security policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read own record" ON users;
DROP POLICY IF EXISTS "Users can update own record" ON users;

-- Create new policies
CREATE POLICY "Users can read own record"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own record"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Add a policy to allow inserting new users
CREATE POLICY "Anyone can insert users"
  ON users
  FOR INSERT
  TO public
  WITH CHECK (true);