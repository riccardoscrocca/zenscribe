/*
  # Update consultations table for medical reports

  1. Changes
    - Add new columns for structured medical report data
    - Update medical_report column to JSONB for better JSON handling
    - Add columns for specific medical consultation data
    - Rename existing columns to match Italian terminology
    
  2. Security
    - Maintain existing RLS policies
    - Keep foreign key constraints
*/

-- Rename existing columns to match Italian terminology
ALTER TABLE consultations RENAME COLUMN summary TO sommario;
ALTER TABLE consultations RENAME COLUMN highlights TO punti_chiave;

-- Update medical_report to JSONB for better JSON handling
ALTER TABLE consultations 
ALTER COLUMN medical_report TYPE JSONB USING medical_report::JSONB;

-- Add new columns for structured medical report data
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS motivo_visita text;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS storia_medica text;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS storia_ponderale text;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS abitudini_alimentari text;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS attivita_fisica text;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS fattori_psi text;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS esami_parametri text;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS punti_critici text;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS note_specialista text;

-- Add indexes for commonly queried columns
CREATE INDEX IF NOT EXISTS idx_consultations_created_at ON consultations(created_at);
CREATE INDEX IF NOT EXISTS idx_consultations_patient_doctor ON consultations(patient_id, doctor_id);

-- Comment on columns
COMMENT ON COLUMN consultations.motivo_visita IS 'Motivo principale della visita';
COMMENT ON COLUMN consultations.storia_medica IS 'Storia medica e familiare del paziente';
COMMENT ON COLUMN consultations.storia_ponderale IS 'Storia del peso e tentativi di dimagrimento';
COMMENT ON COLUMN consultations.abitudini_alimentari IS 'Abitudini alimentari attuali';
COMMENT ON COLUMN consultations.attivita_fisica IS 'Livello e tipo di attività fisica';
COMMENT ON COLUMN consultations.fattori_psi IS 'Fattori psicologici e motivazionali';
COMMENT ON COLUMN consultations.esami_parametri IS 'Esami clinici e parametri rilevanti';
COMMENT ON COLUMN consultations.punti_critici IS 'Punti critici e rischi identificati';
COMMENT ON COLUMN consultations.note_specialista IS 'Note aggiuntive dello specialista';