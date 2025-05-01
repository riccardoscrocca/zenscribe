/*
  # Add visit type to consultations table

  1. Changes
    - Add `visita` column to consultations table
    - Set default value to 'prima_visita'
    - Add check constraint to ensure valid values
    
  2. Notes
    - Column is non-nullable
    - Only allows 'prima_visita' or 'visita_controllo' as values
*/

ALTER TABLE consultations 
ADD COLUMN visita text NOT NULL DEFAULT 'prima_visita'
CHECK (visita IN ('prima_visita', 'visita_controllo'));

COMMENT ON COLUMN consultations.visita IS 'Tipo di visita (prima visita o visita di controllo)';