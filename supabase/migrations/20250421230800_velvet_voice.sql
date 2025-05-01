/*
  # Remove doctor_id from consultations table

  1. Changes
    - Remove doctor_id column from consultations table
    - Update RLS policies to use patient_id only
    
  2. Security
    - Maintain existing RLS policies
    - Keep patient_id foreign key constraint
*/

-- Drop the doctor_id column
ALTER TABLE consultations
DROP COLUMN IF EXISTS doctor_id;

-- Update RLS policies
DROP POLICY IF EXISTS "Users can view consultations for their patients" ON consultations;
CREATE POLICY "Users can view consultations for their patients"
ON consultations
FOR SELECT
TO public
USING (
  patient_id IN (
    SELECT patients.id
    FROM patients
    WHERE patients.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can create consultations for their patients" ON consultations;
CREATE POLICY "Users can create consultations for their patients"
ON consultations
FOR INSERT
TO public
WITH CHECK (
  patient_id IN (
    SELECT patients.id
    FROM patients
    WHERE patients.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update consultations for their patients" ON consultations;
CREATE POLICY "Users can update consultations for their patients"
ON consultations
FOR UPDATE
TO public
USING (
  patient_id IN (
    SELECT patients.id
    FROM patients
    WHERE patients.user_id = auth.uid()
  )
)
WITH CHECK (
  patient_id IN (
    SELECT patients.id
    FROM patients
    WHERE patients.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can delete consultations for their patients" ON consultations;
CREATE POLICY "Users can delete consultations for their patients"
ON consultations
FOR DELETE
TO public
USING (
  patient_id IN (
    SELECT patients.id
    FROM patients
    WHERE patients.user_id = auth.uid()
  )
);