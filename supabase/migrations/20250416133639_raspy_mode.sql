/*
  # Add visita column to consultations table

  1. Changes
    - Add 'visita' column if it doesn't exist
    - Set default value to 'prima_visita'
    - Add check constraint if it doesn't exist
    - Make column not nullable
    
  2. Security
    - No changes to RLS policies needed
    - Maintains existing data integrity
*/

DO $$ 
BEGIN
  -- Add the column if it doesn't exist
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

  -- Make the column not nullable
  ALTER TABLE consultations 
  ALTER COLUMN visita SET NOT NULL;

  -- Add the check constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.constraint_column_usage
    WHERE table_name = 'consultations'
    AND constraint_name = 'consultations_visita_check'
  ) THEN
    ALTER TABLE consultations 
    ADD CONSTRAINT consultations_visita_check 
    CHECK (visita IN ('prima_visita', 'visita_controllo'));
  END IF;

  -- Add column comment
  COMMENT ON COLUMN consultations.visita IS 'Tipo di visita (prima visita o visita di controllo)';
END $$;