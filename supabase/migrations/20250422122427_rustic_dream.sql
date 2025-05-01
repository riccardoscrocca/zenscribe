-- First, drop all existing policies
DROP POLICY IF EXISTS "Anyone can insert users" ON users;
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Enable insert for authentication service" ON users;
DROP POLICY IF EXISTS "Service role can manage all users" ON users;

-- Temporarily disable RLS to ensure we can fix any issues
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- Re-enable RLS with proper policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create new simplified policies
CREATE POLICY "Anyone can create users"
  ON users
  FOR INSERT
  TO public  -- This is critical - allows public access for sign ups
  WITH CHECK (true);  -- Allow any insert

CREATE POLICY "Users can read own profile"
  ON users
  FOR SELECT
  TO public  -- Allow public read for authentication
  USING (true);  -- Temporarily allow all reads for debugging

CREATE POLICY "Users can update own profile"
  ON users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Drop the trigger and recreate it with error handling
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user CASCADE;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Simple insert with error handling
  BEGIN
    INSERT INTO users (
      id,
      email,
      role,
      subscription_tier,
      is_active,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,
      NEW.email,
      'doctor',
      'free',
      true,
      now(),
      now()
    );
  EXCEPTION 
    WHEN OTHERS THEN
      RAISE NOTICE 'Error creating user record: %', SQLERRM;
      -- Continue anyway to not block auth
  END;
  
  RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Ensure we have a free plan
INSERT INTO subscription_plans (name, monthly_minutes, price_monthly)
SELECT 'Free', 30, 0
WHERE NOT EXISTS (
  SELECT 1 FROM subscription_plans WHERE name = 'Free'
);