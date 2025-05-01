-- Function to get current subscription period
CREATE OR REPLACE FUNCTION get_subscription_period()
RETURNS TABLE (
  period_start timestamptz,
  period_end timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    date_trunc('month', now()) as period_start,
    (date_trunc('month', now()) + interval '1 month' - interval '1 second') as period_end;
$$;

-- Minimal ensure_current_subscription function to unblock login
CREATE OR REPLACE FUNCTION ensure_current_subscription(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Empty stub to unblock login
  -- Will be enhanced later with full subscription logic
END;
$$;