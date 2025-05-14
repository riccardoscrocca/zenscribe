-- Migrazione per correggere il calcolo dei minuti
-- Prima resetta i minuti usati a 0
UPDATE user_subscriptions
SET minutes_used = 0;

-- Poi ricalcola i minuti per ogni consultazione
WITH consultation_minutes AS (
  SELECT 
    p.user_id,
    CEIL(c.duration_seconds::float / 60) as minutes
  FROM consultations c
  JOIN patients p ON p.id = c.patient_id
  WHERE c.duration_seconds > 0
),
user_minutes AS (
  SELECT 
    user_id,
    SUM(minutes) as total_minutes
  FROM consultation_minutes
  GROUP BY user_id
)
UPDATE user_subscriptions us
SET minutes_used = um.total_minutes
FROM user_minutes um
WHERE us.user_id = um.user_id
AND us.current_period_start <= now()
AND us.current_period_end >= now();

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'Minutes calculation fixed';
END$$; 