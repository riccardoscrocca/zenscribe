/*
  # Fix consultations table foreign key constraint

  1. Changes
    - Remove foreign key constraint on doctor_id
    - Keep doctor_id column for reference but without constraint
    - Add index on doctor_id for query performance
    
  2. Security
    - Maintain existing RLS policies
    - Keep patient_id foreign key constraint
*/

-- Drop the foreign key constraint on doctor_id
ALTER TABLE consultations
DROP CONSTRAINT IF EXISTS consultations_doctor_id_fkey;

-- Make sure doctor_id column exists and is not null
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'consultations' 
    AND column_name = 'doctor_id'
  ) THEN
    ALTER TABLE consultations 
    ADD COLUMN doctor_id uuid NOT NULL;
  END IF;
END $$;

-- Create index on doctor_id for better query performance
CREATE INDEX IF NOT EXISTS idx_consultations_doctor_id ON consultations(doctor_id);

-- Add comment for clarity
COMMENT ON COLUMN consultations.doctor_id IS 'Reference to the doctor/user who owns this patient record';