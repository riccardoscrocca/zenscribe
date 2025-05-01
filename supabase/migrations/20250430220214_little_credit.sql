/*
  # Fix get_available_minutes function to properly fetch minutes used

  1. Changes
    - Improve query to correctly fetch minutes used from user_subscriptions
    - Add better error handling and logging
    - Fix edge cases with NULL values
    
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
  v_period record;
BEGIN
  -- Get current period
  SELECT 
    date_trunc('month', now()) as period_start,
    (date_trunc('month', now()) + interval '1 month' - interval '1 second') as period_end
  INTO v_period;

  -- Get user's subscription tier and plan minutes
  SELECT u.subscription_tier, p.monthly_minutes 
  INTO v_user_tier, v_plan_minutes
  FROM users u
  LEFT JOIN subscription_plans p ON p.name = u.subscription_tier
  WHERE u.id = p_user_id;

  -- If no plan found, use Free plan default
  IF v_plan_minutes IS NULL THEN
    SELECT monthly_minutes INTO v_plan_minutes
    FROM subscription_plans
    WHERE name = 'Free';
    
    IF v_plan_minutes IS NULL THEN
      v_plan_minutes := 30; -- Fallback default
    END IF;
  END IF;

  -- Get minutes used in current period
  SELECT COALESCE(minutes_used, 0) INTO v_used_minutes
  FROM user_subscriptions us
  WHERE us.user_id = p_user_id
  AND us.current_period_start = v_period.period_start
  AND us.current_period_end = v_period.period_end;

  -- For unlimited users (admin/enterprise), return max values
  IF v_user_tier IN ('enterprise') OR EXISTS (
    SELECT 1 FROM users 
    WHERE id = p_user_id AND role IN ('admin', 'superadmin')
  ) THEN
    RETURN QUERY
    SELECT 
      0::integer as minutes_used,
      2147483647::integer as monthly_minutes,
      2147483647::integer as minutes_remaining;
    RETURN;
  END IF;

  -- Return the results
  RETURN QUERY
  SELECT 
    COALESCE(v_used_minutes, 0)::integer as minutes_used,
    v_plan_minutes::integer as monthly_minutes,
    GREATEST(0, v_plan_minutes - COALESCE(v_used_minutes, 0))::integer as minutes_remaining;

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