/*
  # Add account relationships between users, patients and consultations

  1. Changes
    - Add account_id to users table
    - Add user_id to patients table
    - Update foreign key relationships
    - Update RLS policies
    
  2. Security
    - Maintain RLS on all tables
    - Update policies to reflect new relationships
    - Ensure proper data access control
*/

-- Add account_id to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS account_id uuid DEFAULT gen_random_uuid(),
ADD CONSTRAINT users_account_id_key UNIQUE (account_id);

-- Add user_id to patients table if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'patients' 
    AND column_name = 'user_id'
  ) THEN
    ALTER TABLE patients 
    ADD COLUMN user_id uuid REFERENCES users(id);
  END IF;
END $$;

-- Make user_id not nullable after adding it
ALTER TABLE patients 
ALTER COLUMN user_id SET NOT NULL;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_users_account_id ON users(account_id);
CREATE INDEX IF NOT EXISTS idx_patients_user_id ON patients(user_id);

-- Update RLS policies for patients table
DROP POLICY IF EXISTS "Users can view their patients" ON patients;
CREATE POLICY "Users can view their patients"
ON patients FOR SELECT
TO public
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can create patients" ON patients;
CREATE POLICY "Users can create patients"
ON patients FOR INSERT
TO public
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their patients" ON patients;
CREATE POLICY "Users can update their patients"
ON patients FOR UPDATE
TO public
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their patients" ON patients;
CREATE POLICY "Users can delete their patients"
ON patients FOR DELETE
TO public
USING (user_id = auth.uid());

-- Update RLS policies for consultations table
DROP POLICY IF EXISTS "Users can view consultations for their patients" ON consultations;
CREATE POLICY "Users can view consultations for their patients"
ON consultations FOR SELECT
TO public
USING (
  patient_id IN (
    SELECT id 
    FROM patients 
    WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can create consultations for their patients" ON consultations;
CREATE POLICY "Users can create consultations for their patients"
ON consultations FOR INSERT
TO public
WITH CHECK (
  patient_id IN (
    SELECT id 
    FROM patients 
    WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update consultations for their patients" ON consultations;
CREATE POLICY "Users can update consultations for their patients"
ON consultations FOR UPDATE
TO public
USING (
  patient_id IN (
    SELECT id 
    FROM patients 
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  patient_id IN (
    SELECT id 
    FROM patients 
    WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can delete consultations for their patients" ON consultations;
CREATE POLICY "Users can delete consultations for their patients"
ON consultations FOR DELETE
TO public
USING (
  patient_id IN (
    SELECT id 
    FROM patients 
    WHERE user_id = auth.uid()
  )
);

-- Add comments for clarity
COMMENT ON COLUMN users.account_id IS 'Unique identifier for linking related records';
COMMENT ON COLUMN patients.user_id IS 'Reference to the doctor/user who owns this patient record';