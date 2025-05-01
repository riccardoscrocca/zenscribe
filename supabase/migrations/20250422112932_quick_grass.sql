-- First, let's check and log existing triggers
DO $$
DECLARE
    trigger_record RECORD;
BEGIN
    FOR trigger_record IN
        SELECT 
            event_object_table,
            trigger_name,
            event_manipulation,
            action_statement
        FROM information_schema.triggers
        WHERE event_object_schema = 'public'
    LOOP
        RAISE NOTICE 'Found trigger: % on table % for % event',
            trigger_record.trigger_name,
            trigger_record.event_object_table,
            trigger_record.event_manipulation;
    END LOOP;
END $$;

-- Drop ALL existing triggers that might interfere
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS subscription_period_change ON user_subscriptions;
DROP TRIGGER IF EXISTS on_subscription_tier_change ON users;

-- Drop ALL functions to start fresh
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS ensure_current_subscription(uuid) CASCADE;
DROP FUNCTION IF EXISTS handle_subscription_period_change() CASCADE;
DROP FUNCTION IF EXISTS handle_plan_change() CASCADE;
DROP FUNCTION IF EXISTS get_subscription_period() CASCADE;
DROP FUNCTION IF EXISTS is_unlimited_user(uuid) CASCADE;

-- Create absolute minimum required function
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Just create the user record, nothing else
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
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but allow user creation
    RAISE NOTICE 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Verify RLS policies
DO $$
BEGIN
    -- Enable RLS
    ALTER TABLE users ENABLE ROW LEVEL SECURITY;

    -- Recreate basic policies
    DROP POLICY IF EXISTS "Enable insert for authentication service" ON users;
    DROP POLICY IF EXISTS "Users can view own profile" ON users;
    DROP POLICY IF EXISTS "Users can update own profile" ON users;
    DROP POLICY IF EXISTS "Service role can manage all users" ON users;

    CREATE POLICY "Enable insert for authentication service"
        ON users FOR INSERT TO authenticated
        WITH CHECK (auth.uid() = id OR auth.jwt()->>'role' = 'service_role');

    CREATE POLICY "Users can view own profile"
        ON users FOR SELECT TO authenticated
        USING (id = auth.uid() OR auth.jwt()->>'role' = 'service_role');

    CREATE POLICY "Users can update own profile"
        ON users FOR UPDATE TO authenticated
        USING (id = auth.uid() OR auth.jwt()->>'role' = 'service_role')
        WITH CHECK (id = auth.uid() OR auth.jwt()->>'role' = 'service_role');

    CREATE POLICY "Service role can manage all users"
        ON users FOR ALL TO authenticated
        USING (auth.jwt()->>'role' = 'service_role')
        WITH CHECK (auth.jwt()->>'role' = 'service_role');
END $$;