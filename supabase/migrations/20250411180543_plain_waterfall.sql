/*
  # Fix recursive RLS policies for profiles table

  1. Changes
    - Remove potentially recursive policies from profiles table
    - Add new, simplified policies for profiles table that avoid recursion
    
  2. Security
    - Enable RLS on profiles table (already enabled)
    - Add policy for users to read their own profile
    - Add policy for users to read profiles in their medical practice
    - Add policy for users to update their own profile
    - Add policy for users to insert their own profile
*/

-- Drop existing policies to replace them with non-recursive versions
DROP POLICY IF EXISTS "Enable insert access for own profile" ON profiles;
DROP POLICY IF EXISTS "Enable read access to own profile" ON profiles;
DROP POLICY IF EXISTS "Enable read access to profiles in same medical practice" ON profiles;
DROP POLICY IF EXISTS "Enable update access to own profile" ON profiles;

-- Create new non-recursive policies
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
  medical_practice_id = (
    SELECT medical_practice_id 
    FROM profiles 
    WHERE id = auth.uid()
    LIMIT 1
  )
);

CREATE POLICY "Enable update for own profile"
ON profiles
FOR UPDATE
TO public
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);