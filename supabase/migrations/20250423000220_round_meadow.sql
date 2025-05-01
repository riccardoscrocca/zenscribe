/*
  # Add Stripe price ID to subscription plans

  1. Changes
    - Add stripe_price_id column as nullable first
    - Set default Stripe price IDs for existing plans
    - Make the column NOT NULL after setting values
    - Add unique constraint
*/

-- Add the column as nullable first
ALTER TABLE subscription_plans 
ADD COLUMN stripe_price_id text;

-- Update existing plans with their Stripe price IDs
UPDATE subscription_plans 
SET stripe_price_id = CASE 
  WHEN name = 'Free' THEN 'price_free'
  WHEN name = 'Basic' THEN 'price_1RGUb2B9FcmmWrIESocQ8V0O'
  WHEN name = 'Advanced' THEN 'price_1RGUcNB9FcmmWrIEBTjmkETi'
  WHEN name = 'Enterprise' THEN 'price_enterprise'
END;

-- Now make the column NOT NULL
ALTER TABLE subscription_plans 
ALTER COLUMN stripe_price_id SET NOT NULL;

-- Add unique constraint
ALTER TABLE subscription_plans
ADD CONSTRAINT subscription_plans_stripe_price_id_key UNIQUE (stripe_price_id);