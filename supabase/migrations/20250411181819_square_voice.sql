/*
  # Restructure Database Schema

  1. Changes
    - Simplify schema to three main tables: users, patients, consultations
    - Users table stores medical practice credentials
    - Patients table linked to users (medical practices)
    - Consultations table linked to patients
    
  2. Security
    - Enable RLS on all tables
    - Add appropriate policies for data access
*/

-- Drop existing tables
DROP TABLE IF EXISTS consultations CASCADE;
DROP TABLE IF EXISTS patients CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS medical_practices CASCADE;

-- Create users table (for medical practices)
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  email text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create patients table
CREATE TABLE patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  birth_date date NOT NULL,
  gender text NOT NULL,
  weight numeric,
  height numeric,
  email text,
  phone text,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

-- Create consultations table
CREATE TABLE consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id),
  audio_url text,
  transcription text,
  summary text,
  highlights text[],
  medical_report text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;

-- Policies for users table
CREATE POLICY "Users can view own record"
  ON users
  FOR SELECT
  TO public
  USING (auth.uid() = id);

CREATE POLICY "Users can update own record"
  ON users
  FOR UPDATE
  TO public
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policies for patients table
CREATE POLICY "Users can view their patients"
  ON patients
  FOR SELECT
  TO public
  USING (user_id = auth.uid());

CREATE POLICY "Users can create patients"
  ON patients
  FOR INSERT
  TO public
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their patients"
  ON patients
  FOR UPDATE
  TO public
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their patients"
  ON patients
  FOR DELETE
  TO public
  USING (user_id = auth.uid());

-- Policies for consultations table
CREATE POLICY "Users can view consultations for their patients"
  ON consultations
  FOR SELECT
  TO public
  USING (
    patient_id IN (
      SELECT id
      FROM patients
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create consultations for their patients"
  ON consultations
  FOR INSERT
  TO public
  WITH CHECK (
    patient_id IN (
      SELECT id
      FROM patients
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update consultations for their patients"
  ON consultations
  FOR UPDATE
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

CREATE POLICY "Users can delete consultations for their patients"
  ON consultations
  FOR DELETE
  TO public
  USING (
    patient_id IN (
      SELECT id
      FROM patients
      WHERE user_id = auth.uid()
    )
  );