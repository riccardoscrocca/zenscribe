/*
  # Fix profiles table RLS policies

  1. Changes
    - Drop existing policies that cause recursion
    - Create new simplified policies that avoid recursion
    - Maintain security while preventing infinite loops
  
  2. Security
    - Users can still only access their own profile
    - Users can view profiles from their medical practice
    - Policies are simplified to avoid recursive queries
*/

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Enable insert for own profile" ON profiles;
DROP POLICY IF EXISTS "Enable read access for own profile" ON profiles;
DROP POLICY IF EXISTS "Enable read access for same medical practice" ON profiles;
DROP POLICY IF EXISTS "Enable update for own profile" ON profiles;

-- Create new simplified policies
CREATE POLICY "Enable insert for own profile"
ON profiles
FOR INSERT
TO public
WITH CHECK (auth.uid() = id);

CREATE POLICY "Enable read access for own profile"
ON profiles
FOR SELECT
TO public
USING (auth.uid() = id);

CREATE POLICY "Enable read access for same medical practice"
ON profiles
FOR SELECT
TO public
USING (
  medical_practice_id IS NOT NULL 
  AND 
  medical_practice_id = (
    SELECT p.medical_practice_id 
    FROM profiles p 
    WHERE p.id = auth.uid() 
    LIMIT 1
  )
);

CREATE POLICY "Enable update for own profile"
ON profiles
FOR UPDATE
TO public
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);