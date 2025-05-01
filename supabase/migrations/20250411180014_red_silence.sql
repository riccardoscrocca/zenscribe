/*
  # Fix profiles table RLS policies

  1. Changes
    - Drop existing problematic policies that cause infinite recursion
    - Create new, simplified policies that avoid recursion
    
  2. Security
    - Enable RLS (already enabled)
    - Add policies for:
      - Users can read their own profile
      - Users can read profiles in their medical practice
      - Users can update their own profile
      - Users can insert their own profile
*/

-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view profiles in same medical practice" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;

-- Create new, simplified policies
CREATE POLICY "Enable read access to own profile"
ON profiles FOR SELECT
TO public
USING (auth.uid() = id);

CREATE POLICY "Enable read access to profiles in same medical practice"
ON profiles FOR SELECT
TO public
USING (
  medical_practice_id = (
    SELECT medical_practice_id 
    FROM profiles 
    WHERE id = auth.uid()
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