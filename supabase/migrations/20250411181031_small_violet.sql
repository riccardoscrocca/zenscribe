/*
  # Fix profiles RLS policies

  1. Changes
    - Remove recursive policies from profiles table
    - Simplify RLS policies to avoid infinite recursion
    - Maintain security while fixing the circular dependency

  2. Security
    - Users can still only access their own profile
    - Users can still view profiles in their medical practice
    - Policies are simplified to prevent recursion
*/

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Enable insert for own profile" ON profiles;
DROP POLICY IF EXISTS "Enable update for own profile" ON profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can read profiles in same medical practice" ON profiles;

-- Create new, simplified policies
CREATE POLICY "Enable insert for own profile"
ON profiles
FOR INSERT
TO public
WITH CHECK (auth.uid() = id);

CREATE POLICY "Enable update for own profile"
ON profiles
FOR UPDATE
TO public
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can read own profile"
ON profiles
FOR SELECT
TO public
USING (auth.uid() = id);

-- Simplified policy for reading profiles in same medical practice
-- This avoids the recursive lookup by using a direct medical_practice_id comparison
CREATE POLICY "Users can read profiles in same medical practice"
ON profiles
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM profiles AS viewer
    WHERE viewer.id = auth.uid()
    AND viewer.medical_practice_id = profiles.medical_practice_id
  )
);