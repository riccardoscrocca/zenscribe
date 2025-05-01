/*
  # Add doctor_id to consultations table

  1. Changes
    - Add `doctor_id` column to `consultations` table
    - Add foreign key constraint referencing users table
    - Add index for better query performance
    - Update RLS policies to include doctor_id checks

  2. Security
    - Maintain existing RLS policies
    - Add doctor_id to policy conditions
*/

-- Add doctor_id column
ALTER TABLE consultations 
ADD COLUMN doctor_id uuid NOT NULL REFERENCES users(id);

-- Add index for better query performance
CREATE INDEX idx_consultations_doctor_id ON consultations(doctor_id);

-- Update RLS policies to include doctor_id checks
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
  AND doctor_id = auth.uid()
);

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
  OR doctor_id = auth.uid()
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
  AND doctor_id = auth.uid()
)
WITH CHECK (
  patient_id IN (
    SELECT patients.id
    FROM patients
    WHERE patients.user_id = auth.uid()
  )
  AND doctor_id = auth.uid()
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
  AND doctor_id = auth.uid()
);