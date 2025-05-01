/*
  # Fix visita column in consultations table

  1. Changes
    - Drop existing constraint if it exists
    - Ensure visita column exists with correct properties
    - Add check constraint with proper handling
    
  2. Security
    - Maintain data integrity
    - Ensure proper column constraints
*/

DO $$ 
BEGIN
  -- Drop existing constraint if it exists
  ALTER TABLE consultations 
  DROP CONSTRAINT IF EXISTS consultations_visita_check;

  -- Ensure column exists with proper default
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'consultations' 
    AND column_name = 'visita'
  ) THEN
    ALTER TABLE consultations 
    ADD COLUMN visita text DEFAULT 'prima_visita';
  END IF;

  -- Update any existing NULL values
  UPDATE consultations 
  SET visita = 'prima_visita' 
  WHERE visita IS NULL;

  -- Make the column not nullable and add the check constraint
  ALTER TABLE consultations 
  ALTER COLUMN visita SET NOT NULL,
  ADD CONSTRAINT consultations_visita_check 
  CHECK (visita IN ('prima_visita', 'visita_controllo'));

  -- Add column comment
  COMMENT ON COLUMN consultations.visita IS 'Tipo di visita (prima visita o visita di controllo)';
END $$;