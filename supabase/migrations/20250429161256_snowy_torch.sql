-- Enable pgcrypto if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add password column if it doesn't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS password_hash text;

-- Drop existing functions and triggers first
DROP TRIGGER IF EXISTS hash_password_trigger ON users;
DROP FUNCTION IF EXISTS hash_password();
DROP FUNCTION IF EXISTS verify_password(text, text);

-- Function to hash passwords
CREATE OR REPLACE FUNCTION hash_password()
RETURNS trigger AS $$
BEGIN
  IF NEW.password_hash IS NOT NULL THEN
    NEW.password_hash := crypt(NEW.password_hash, gen_salt('bf'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically hash passwords
CREATE TRIGGER hash_password_trigger
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION hash_password();

-- Function to verify passwords
CREATE OR REPLACE FUNCTION verify_password(
  user_email text,
  password_attempt text
) RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM users
    WHERE email = user_email 
    AND password_hash = crypt(password_attempt, password_hash)
  );
END;
$$ LANGUAGE plpgsql;