/*
  # Enable RLS on users table and adjust policies

  1. Security Changes
    - Enable RLS on users table
    - Update policies to use proper auth.uid() function
    - Add policy for user creation during sign up
    - Consolidate and clarify policy names in English

  2. Changes
    - Enable row level security on users table
    - Update existing policies to use auth.uid()
    - Add policy for new user creation
*/

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them with proper auth.uid() function
DROP POLICY IF EXISTS "Gli admin possono vedere tutti gli utenti" ON users;
DROP POLICY IF EXISTS "Gli utenti possono aggiornare il proprio profilo" ON users;
DROP POLICY IF EXISTS "Gli utenti possono vedere il proprio profilo" ON users;
DROP POLICY IF EXISTS "Il ruolo service può gestire tutti gli utenti" ON users;

-- Create new policies with proper auth functions
CREATE POLICY "Admins can view all users"
  ON users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role = 'admin'
    )
  );

CREATE POLICY "Users can update own profile"
  ON users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can view own profile"
  ON users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Enable insert for authentication service"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Service role can manage all users"
  ON users
  FOR ALL
  TO authenticated
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');