/*
  # Update subscription plan prices

  1. Changes
    - Update Basic plan price to €99
    - Update Advanced plan price to €199
    - Keep monthly minutes unchanged
*/

UPDATE subscription_plans 
SET price_monthly = 99
WHERE name = 'Basic';

UPDATE subscription_plans 
SET price_monthly = 199
WHERE name = 'Advanced';