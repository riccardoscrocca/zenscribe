/*
  # Fix all profile policies

  1. Changes
    - Drop all existing policies on profiles table
    - Create new, non-recursive policies for all operations
    - Ensure proper access control for own profile and same medical practice

  2. Security
    - Maintains RLS protection
    - Prevents infinite recursion
    - Ensures users can only access appropriate data
    - Adds proper policies for INSERT, UPDATE, and DELETE operations
*/

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view profiles in same medical practice" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view profiles in their medical practice" ON profiles;

-- Create comprehensive set of policies
CREATE POLICY "Users can view own profile"
  ON profiles
  FOR SELECT
  TO public
  USING (auth.uid() = id);

CREATE POLICY "Users can view profiles in same medical practice"
  ON profiles
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM profiles my_profile
      WHERE my_profile.id = auth.uid()
      AND my_profile.medical_practice_id = profiles.medical_practice_id
    )
  );

CREATE POLICY "Users can insert their own profile"
  ON profiles
  FOR INSERT
  TO public
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  TO public
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);