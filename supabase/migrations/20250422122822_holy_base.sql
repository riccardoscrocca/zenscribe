-- Drop existing function if it exists
DROP FUNCTION IF EXISTS is_unlimited_user(uuid);

-- Create the is_unlimited_user function
CREATE OR REPLACE FUNCTION is_unlimited_user(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_tier text;
BEGIN
  -- Get user's role and subscription tier
  SELECT role, subscription_tier INTO v_role, v_tier
  FROM users
  WHERE id = user_id;
  
  -- Return true if user is admin/superadmin or has enterprise tier
  RETURN v_role IN ('admin', 'superadmin') OR v_tier = 'enterprise';
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but return false to be safe
    RAISE NOTICE 'Error in is_unlimited_user: %', SQLERRM;
    RETURN false;
END;
$$;