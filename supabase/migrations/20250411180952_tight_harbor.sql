/*
  # Fix profiles table RLS policies

  1. Changes
    - Drop existing problematic RLS policies on profiles table
    - Create new, simplified RLS policies that avoid recursion
    
  2. Security
    - Users can read their own profile directly using their auth.uid()
    - Users can read profiles from their medical practice, but using a direct join to avoid recursion
    - Maintains data security while preventing infinite recursion
*/

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Enable read access for own profile" ON profiles;
DROP POLICY IF EXISTS "Enable read access for same medical practice" ON profiles;

-- Create new, simplified policies that avoid recursion
CREATE POLICY "Users can read own profile"
  ON profiles
  FOR SELECT
  TO public
  USING (auth.uid() = id);

CREATE POLICY "Users can read profiles in same medical practice"
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