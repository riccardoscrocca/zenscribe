/*
  # Fix get_available_minutes function

  1. Changes
    - Simplify function logic
    - Add proper error handling
    - Fix return type handling
    - Add debug logging
    
  2. Security
    - Maintain SECURITY DEFINER
    - Keep RLS compatibility
*/

-- Drop existing function
DROP FUNCTION IF EXISTS get_available_minutes(uuid);

-- Create new version with fixes
CREATE OR REPLACE FUNCTION get_available_minutes(p_user_id uuid)
RETURNS TABLE (
  minutes_used integer,
  monthly_minutes integer,
  minutes_remaining integer
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_tier text;
  v_plan_minutes integer;
  v_used_minutes integer := 0;
BEGIN
  -- Get user's subscription tier
  SELECT subscription_tier INTO v_user_tier
  FROM users
  WHERE id = p_user_id;

  -- Get plan minutes based on tier
  SELECT monthly_minutes INTO v_plan_minutes
  FROM subscription_plans
  WHERE name = COALESCE(v_user_tier, 'Free')
  LIMIT 1;

  -- If no plan found, use Free plan default
  IF v_plan_minutes IS NULL THEN
    v_plan_minutes := 30; -- Free plan default
  END IF;

  -- Get minutes used in current period if any
  SELECT COALESCE(minutes_used, 0) INTO v_used_minutes
  FROM user_subscriptions
  WHERE user_id = p_user_id
  AND current_period_start <= now()
  AND current_period_end >= now()
  LIMIT 1;

  -- Return the results
  RETURN QUERY
  SELECT 
    v_used_minutes::integer as minutes_used,
    v_plan_minutes::integer as monthly_minutes,
    (v_plan_minutes - v_used_minutes)::integer as minutes_remaining;

EXCEPTION WHEN OTHERS THEN
  -- Log error but return default values
  RAISE WARNING 'Error in get_available_minutes: %', SQLERRM;
  
  RETURN QUERY
  SELECT 
    0::integer as minutes_used,
    30::integer as monthly_minutes,
    30::integer as minutes_remaining;
END;
$$;