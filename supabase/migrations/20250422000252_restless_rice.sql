/*
  # Fix users table schema and policies

  1. Changes
    - Drop and recreate users table with correct schema
    - Enable RLS
    - Add proper policies for authentication
    - Add required columns for user management
    
  2. Security
    - Enable RLS on users table
    - Add policies for user creation and management
    - Ensure proper access control
*/

-- Drop existing table and policies
DROP TABLE IF EXISTS users CASCADE;

-- Create users table with correct schema
CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users,
  email text NOT NULL UNIQUE,
  full_name text,
  role text DEFAULT 'doctor',
  is_active boolean DEFAULT true,
  subscription_tier text DEFAULT 'free',
  account_id uuid DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Enable insert for authentication service"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view own profile"
  ON users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Service role can manage all users"
  ON users
  FOR ALL
  TO authenticated
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- Add indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_account_id ON users(account_id);

-- Add comments
COMMENT ON TABLE users IS 'User profiles and settings';
COMMENT ON COLUMN users.subscription_tier IS 'User subscription tier (free, basic, pro, enterprise)';
COMMENT ON COLUMN users.account_id IS 'Unique identifier for linking related records';