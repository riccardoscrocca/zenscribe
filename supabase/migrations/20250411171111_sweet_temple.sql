/*
  # Initial Schema Setup for Medical SaaS

  1. New Tables
    - `medical_practices`
      - `id` (uuid, primary key)
      - `name` (text)
      - `created_at` (timestamp)
      
    - `profiles`
      - `id` (uuid, primary key, references auth.users)
      - `medical_practice_id` (uuid, references medical_practices)
      - `first_name` (text)
      - `last_name` (text)
      - `role` (text)
      
    - `patients`
      - `id` (uuid, primary key)
      - `medical_practice_id` (uuid, references medical_practices)
      - `first_name` (text)
      - `last_name` (text)
      - `birth_date` (date)
      - `gender` (text)
      - `weight` (numeric)
      - `height` (numeric)
      - `email` (text)
      - `phone` (text)
      - `notes` (text)
      - `created_at` (timestamp)
      
    - `consultations`
      - `id` (uuid, primary key)
      - `patient_id` (uuid, references patients)
      - `doctor_id` (uuid, references profiles)
      - `audio_url` (text)
      - `transcription` (text)
      - `summary` (text)
      - `highlights` (text[])
      - `medical_report` (text)
      - `gdpr_consent` (boolean)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for medical practice access
    - Add policies for patient data access
*/

-- Create medical practices table
CREATE TABLE medical_practices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE medical_practices ENABLE ROW LEVEL SECURITY;

-- Create profiles table (extends auth.users)
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users,
  medical_practice_id uuid REFERENCES medical_practices,
  first_name text NOT NULL,
  last_name text NOT NULL,
  role text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create patients table
CREATE TABLE patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medical_practice_id uuid REFERENCES medical_practices NOT NULL,
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
  patient_id uuid REFERENCES patients NOT NULL,
  doctor_id uuid REFERENCES profiles NOT NULL,
  audio_url text,
  transcription text,
  summary text,
  highlights text[],
  medical_report text,
  gdpr_consent boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Medical Practices policies
CREATE POLICY "Users can view their own medical practice"
  ON medical_practices
  FOR SELECT
  USING (
    id IN (
      SELECT medical_practice_id 
      FROM profiles 
      WHERE profiles.id = auth.uid()
    )
  );

-- Profiles policies
CREATE POLICY "Users can view profiles in their medical practice"
  ON profiles
  FOR SELECT
  USING (
    medical_practice_id IN (
      SELECT medical_practice_id 
      FROM profiles 
      WHERE profiles.id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own profile"
  ON profiles
  FOR UPDATE
  USING (id = auth.uid());

-- Patients policies
CREATE POLICY "Users can view patients in their medical practice"
  ON patients
  FOR ALL
  USING (
    medical_practice_id IN (
      SELECT medical_practice_id 
      FROM profiles 
      WHERE profiles.id = auth.uid()
    )
  );

-- Consultations policies
CREATE POLICY "Users can view consultations for their medical practice's patients"
  ON consultations
  FOR ALL
  USING (
    patient_id IN (
      SELECT patients.id 
      FROM patients 
      INNER JOIN profiles ON profiles.medical_practice_id = patients.medical_practice_id 
      WHERE profiles.id = auth.uid()
    )
  );