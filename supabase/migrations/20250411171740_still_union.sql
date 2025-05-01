/*
  # Add profiles insert policy

  1. Security Changes
    - Add RLS policy to allow users to insert their own profile
    - This allows new users to create their initial profile during registration
*/

CREATE POLICY "Users can insert their own profile"
  ON profiles
  FOR INSERT
  TO public
  WITH CHECK (auth.uid() = id);