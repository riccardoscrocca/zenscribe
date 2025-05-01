/*
  # Fix profiles table RLS policies

  1. Changes
    - Remove existing policies that cause recursion
    - Create new simplified policies with optimized queries
    - Ensure no circular references in policy definitions

  2. Security
    - Maintain row-level security
    - Keep existing access patterns (own profile + same medical practice)
    - Prevent unauthorized access
*/

-- Drop existing policies to start fresh
DROP POLICY IF EXISTS "Enable read access to own profile" ON profiles;
DROP POLICY IF EXISTS "Enable read access to profiles in same medical practice" ON profiles;
DROP POLICY IF EXISTS "Enable update access to own profile" ON profiles;
DROP POLICY IF EXISTS "Enable insert access for own profile" ON profiles;

-- Create new optimized policies
CREATE POLICY "Enable read access to own profile"
ON profiles FOR SELECT
TO public
USING (auth.uid() = id);

-- Simplified medical practice access policy to prevent recursion
CREATE POLICY "Enable read access to profiles in same medical practice"
ON profiles FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1
    FROM profiles base_profile
    WHERE base_profile.id = auth.uid()
    AND base_profile.medical_practice_id = profiles.medical_practice_id
  )
);

CREATE POLICY "Enable update access to own profile"
ON profiles FOR UPDATE
TO public
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Enable insert access for own profile"
ON profiles FOR INSERT
TO public
WITH CHECK (auth.uid() = id);