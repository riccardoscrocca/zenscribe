/*
  # Complete Medical Practice Schema Setup

  1. Changes
    - Drop existing schema with proper CASCADE
    - Create medical practices table
    - Create profiles table for staff/doctors
    - Create patients table
    - Create consultations table
    - Set up all necessary RLS policies
    
  2. Security
    - Enable RLS on all tables
    - Add appropriate policies for each table
    
  3. Relationships
    - Profiles belong to medical practices
    - Patients belong to medical practices
    - Consultations link patients and doctors
*/

-- Drop everything with CASCADE to handle dependencies
DROP TABLE IF EXISTS consultations CASCADE;
DROP TABLE IF EXISTS patients CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS medical_practices CASCADE;

-- Create medical practices table
CREATE TABLE medical_practices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE medical_practices ENABLE ROW LEVEL SECURITY;

-- Create profiles table (for staff/doctors)
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users,
  medical_practice_id uuid REFERENCES medical_practices(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  role text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create patients table
CREATE TABLE patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medical_practice_id uuid NOT NULL REFERENCES medical_practices(id),
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
  doctor_id uuid NOT NULL REFERENCES profiles(id),
  audio_url text,
  transcription text,
  summary text,
  highlights text[],
  medical_report text,
  gdpr_consent boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;

-- Policies for medical_practices
CREATE POLICY "Users can view their medical practice"
  ON medical_practices
  FOR SELECT
  TO public
  USING (
    id IN (
      SELECT medical_practice_id
      FROM profiles
      WHERE profiles.id = auth.uid()
    )
  );

-- Policies for profiles
CREATE POLICY "Enable insert for own profile"
  ON profiles
  FOR INSERT
  TO public
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Enable read access for own profile"
  ON profiles
  FOR SELECT
  TO public
  USING (auth.uid() = id);

CREATE POLICY "Enable read access for same medical practice"
  ON profiles
  FOR SELECT
  TO public
  USING (
    medical_practice_id = (
      SELECT medical_practice_id 
      FROM profiles 
      WHERE id = auth.uid()
      LIMIT 1
    )
  );

CREATE POLICY "Enable update for own profile"
  ON profiles
  FOR UPDATE
  TO public
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policies for patients
CREATE POLICY "Users can view patients in their medical practice"
  ON patients
  FOR SELECT
  TO public
  USING (
    medical_practice_id IN (
      SELECT medical_practice_id
      FROM profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create patients in their medical practice"
  ON patients
  FOR INSERT
  TO public
  WITH CHECK (
    medical_practice_id IN (
      SELECT medical_practice_id
      FROM profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update patients in their medical practice"
  ON patients
  FOR UPDATE
  TO public
  USING (
    medical_practice_id IN (
      SELECT medical_practice_id
      FROM profiles
      WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    medical_practice_id IN (
      SELECT medical_practice_id
      FROM profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete patients in their medical practice"
  ON patients
  FOR DELETE
  TO public
  USING (
    medical_practice_id IN (
      SELECT medical_practice_id
      FROM profiles
      WHERE id = auth.uid()
    )
  );

-- Policies for consultations
CREATE POLICY "Users can view consultations for their medical practice"
  ON consultations
  FOR SELECT
  TO public
  USING (
    patient_id IN (
      SELECT patients.id
      FROM patients
      JOIN profiles ON profiles.medical_practice_id = patients.medical_practice_id
      WHERE profiles.id = auth.uid()
    )
  );

CREATE POLICY "Users can create consultations for their medical practice"
  ON consultations
  FOR INSERT
  TO public
  WITH CHECK (
    patient_id IN (
      SELECT patients.id
      FROM patients
      JOIN profiles ON profiles.medical_practice_id = patients.medical_practice_id
      WHERE profiles.id = auth.uid()
    )
  );

CREATE POLICY "Users can update consultations for their medical practice"
  ON consultations
  FOR UPDATE
  TO public
  USING (
    patient_id IN (
      SELECT patients.id
      FROM patients
      JOIN profiles ON profiles.medical_practice_id = patients.medical_practice_id
      WHERE profiles.id = auth.uid()
    )
  )
  WITH CHECK (
    patient_id IN (
      SELECT patients.id
      FROM patients
      JOIN profiles ON profiles.medical_practice_id = patients.medical_practice_id
      WHERE profiles.id = auth.uid()
    )
  );

CREATE POLICY "Users can delete consultations for their medical practice"
  ON consultations
  FOR DELETE
  TO public
  USING (
    patient_id IN (
      SELECT patients.id
      FROM patients
      JOIN profiles ON profiles.medical_practice_id = patients.medical_practice_id
      WHERE profiles.id = auth.uid()
    )
  );