/*
  # Add GDPR consent column to consultations table

  1. Changes
    - Add `gdpr_consent` boolean column to `consultations` table with default value of false
    - Make the column non-nullable to ensure GDPR consent is always tracked

  2. Security
    - No changes to RLS policies needed as this column follows existing table permissions
*/

ALTER TABLE consultations 
ADD COLUMN IF NOT EXISTS gdpr_consent boolean NOT NULL DEFAULT false;