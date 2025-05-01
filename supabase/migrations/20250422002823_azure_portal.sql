/*
  # Update subscription plans pricing

  1. Changes
    - Update pricing for Basic plan to €49
    - Update pricing for Pro plan to €99
    - Add Enterprise plan (price on request)
    
  2. Security
    - Maintain existing RLS policies
*/

-- Update existing plans
UPDATE subscription_plans 
SET price_monthly = 49,
    monthly_minutes = 300
WHERE name = 'Basic';

UPDATE subscription_plans 
SET price_monthly = 99,
    monthly_minutes = 600,
    name = 'Advanced'
WHERE name = 'Pro';

-- Add Enterprise plan if it doesn't exist
INSERT INTO subscription_plans (name, monthly_minutes, price_monthly)
SELECT 'Enterprise', 1000, 0
WHERE NOT EXISTS (
  SELECT 1 FROM subscription_plans WHERE name = 'Enterprise'
);

-- Remove any old plans that aren't part of the new structure
DELETE FROM subscription_plans 
WHERE name NOT IN ('Free', 'Basic', 'Advanced', 'Enterprise');