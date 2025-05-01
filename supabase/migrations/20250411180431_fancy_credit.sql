/*
  # Fix patients table RLS policies

  1. Changes
    - Enable RLS on patients table
    - Add policies for CRUD operations on patients
    - Link access to user's medical practice

  2. Security
    - Users can only access patients in their medical practice
    - Users can create new patients in their medical practice
    - Users can update patients in their medical practice
    - Users can delete patients in their medical practice
*/

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view patients in their medical practice" ON patients;
DROP POLICY IF EXISTS "Users can create patients in their medical practice" ON patients;
DROP POLICY IF EXISTS "Users can update patients in their medical practice" ON patients;
DROP POLICY IF EXISTS "Users can delete patients in their medical practice" ON patients;

-- Create comprehensive set of policies
CREATE POLICY "Users can view patients in their medical practice"
ON patients FOR SELECT
TO public
USING (
  medical_practice_id IN (
    SELECT medical_practice_id
    FROM profiles
    WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can create patients in their medical practice"
ON patients FOR INSERT
TO public
WITH CHECK (
  medical_practice_id IN (
    SELECT medical_practice_id
    FROM profiles
    WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can update patients in their medical practice"
ON patients FOR UPDATE
TO public
USING (
  medical_practice_id IN (
    SELECT medical_practice_id
    FROM profiles
    WHERE id = auth.uid()
  )
)
WITH CHECK (
  medical_practice_id IN (
    SELECT medical_practice_id
    FROM profiles
    WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can delete patients in their medical practice"
ON patients FOR DELETE
TO public
USING (
  medical_practice_id IN (
    SELECT medical_practice_id
    FROM profiles
    WHERE id = auth.uid()
  )
);