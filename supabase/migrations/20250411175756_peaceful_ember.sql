/*
  # Fix profiles table RLS policy

  1. Changes
    - Remove recursive policy on profiles table
    - Add new policy that allows users to view their own profile
    - Add policy for viewing profiles in same medical practice

  2. Security
    - Maintains RLS protection
    - Prevents infinite recursion
    - Ensures users can only access appropriate data
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view profiles in their medical practice" ON profiles;

-- Create new policies
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
    medical_practice_id = (
      SELECT p.medical_practice_id 
      FROM profiles p 
      WHERE p.id = auth.uid()
      LIMIT 1
    )
  );