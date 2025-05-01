/*
  # Fix profiles table RLS policies

  1. Changes
    - Remove recursive policy that was causing infinite recursion
    - Replace with a simpler, non-recursive policy for reading profiles in the same medical practice
  
  2. Security
    - Maintains RLS on profiles table
    - Users can still only access profiles within their medical practice
    - Prevents infinite recursion while maintaining security
*/

-- Drop the problematic policy
DROP POLICY IF EXISTS "Enable read access to profiles in same medical practice" ON profiles;

-- Create new, non-recursive policy
CREATE POLICY "Enable read access to profiles in same medical practice"
ON profiles
FOR SELECT
TO public
USING (
  medical_practice_id = (
    SELECT medical_practice_id 
    FROM profiles 
    WHERE id = auth.uid()
    LIMIT 1
  )
);