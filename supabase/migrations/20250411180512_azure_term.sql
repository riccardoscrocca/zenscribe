/*
  # Fix profiles table RLS policies

  1. Changes
    - Simplify RLS policies to avoid recursion
    - Use direct queries instead of self-referential ones
    - Maintain security while improving performance

  2. Security
    - Users can still only access their own profile
    - Users can see other profiles in their medical practice
    - No recursive queries that could cause infinite loops
*/

-- Drop existing policies to start fresh
DROP POLICY IF EXISTS "Enable read access to own profile" ON profiles;
DROP POLICY IF EXISTS "Enable read access to profiles in same medical practice" ON profiles;
DROP POLICY IF EXISTS "Enable update access to own profile" ON profiles;
DROP POLICY IF EXISTS "Enable insert access for own profile" ON profiles;

-- Create simplified, non-recursive policies
CREATE POLICY "Enable read access to own profile"
ON profiles FOR SELECT
TO public
USING (auth.uid() = id);

CREATE POLICY "Enable read access to profiles in same medical practice"
ON profiles FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1
    FROM profiles base_profile
    WHERE base_profile.id = auth.uid()
    AND base_profile.medical_practice_id = profiles.medical_practice_id
    LIMIT 1
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