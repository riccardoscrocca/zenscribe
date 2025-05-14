-- Script di debug per il trigger update_minutes_used_trigger

-- 1. Riepilogo del trigger esistente
SELECT 
  pg_trigger.tgname, 
  pg_class.relname AS table_name, 
  pg_proc.proname AS function_name,
  pg_proc.prosrc AS function_source
FROM pg_trigger
JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid
JOIN pg_proc ON pg_trigger.tgfoid = pg_proc.oid
WHERE pg_class.relname = 'consultations'
  AND pg_trigger.tgname = 'update_minutes_used_trigger';

-- 2. Verifica del trigger per le consultazioni con durata > 0
SELECT 
  c.id AS consultation_id,
  c.patient_id,
  p.user_id,
  c.duration_seconds,
  CEIL(c.duration_seconds::float / 60) AS minutes,
  u.subscription_tier,
  sub.id AS subscription_id,
  sub.minutes_used
FROM consultations c
JOIN patients p ON p.id = c.patient_id
JOIN users u ON u.id = p.user_id
LEFT JOIN user_subscriptions sub ON 
  sub.user_id = p.user_id AND 
  sub.current_period_start <= NOW() AND 
  sub.current_period_end >= NOW()
WHERE c.duration_seconds IS NOT NULL AND c.duration_seconds > 0
ORDER BY c.created_at DESC
LIMIT 10;

-- 3. Verifica delle sottoscrizioni attive
SELECT 
  s.id, 
  s.user_id, 
  u.email, 
  u.subscription_tier,
  s.plan_id, 
  p.name AS plan_name,
  p.monthly_minutes,
  s.minutes_used,
  s.current_period_start,
  s.current_period_end,
  p.monthly_minutes - COALESCE(s.minutes_used, 0) AS minutes_remaining,
  NOW() BETWEEN s.current_period_start AND s.current_period_end AS is_active
FROM user_subscriptions s
JOIN users u ON u.id = s.user_id
JOIN subscription_plans p ON p.id = s.plan_id
ORDER BY s.created_at DESC
LIMIT 20;

-- 4. Esecuzione manuale per test
DO $$
DECLARE
  v_patient_id uuid;
  v_user_id uuid;
  v_minutes integer := 0;
  v_minutes_before integer := 0;
  v_minutes_after integer := 0;
  v_ins_id uuid;
BEGIN
  -- Prendi un paziente/utente esistente per test
  SELECT p.id, p.user_id INTO v_patient_id, v_user_id 
  FROM patients p 
  LIMIT 1;
  
  -- Controlla i minuti prima
  SELECT minutes_used INTO v_minutes_before
  FROM user_subscriptions
  WHERE user_id = v_user_id
  AND current_period_start <= NOW()
  AND current_period_end >= NOW();
  
  RAISE NOTICE 'Test update minuti per user_id: %, patient_id: %, minuti prima: %', 
    v_user_id, v_patient_id, v_minutes_before;
  
  -- Inserisci una nuova consultazione di test
  INSERT INTO consultations (
    patient_id, 
    duration_seconds, 
    transcription, 
    medical_report, 
    gdpr_consent,
    visita
  ) VALUES (
    v_patient_id, 
    120, -- 2 minuti
    'Test diagnosi trigger SQL',
    '{"note": "Test diagnostica SQL"}'::jsonb,
    true,
    'prima_visita'
  ) RETURNING id INTO v_ins_id;
  
  RAISE NOTICE 'Consultazione di test inserita: %', v_ins_id;
  
  -- Leggi i minuti dopo
  SELECT minutes_used INTO v_minutes_after
  FROM user_subscriptions
  WHERE user_id = v_user_id
  AND current_period_start <= NOW()
  AND current_period_end >= NOW();
  
  v_minutes := COALESCE(v_minutes_after, 0) - COALESCE(v_minutes_before, 0);
  
  RAISE NOTICE 'Minuti dopo: %, differenza: %', v_minutes_after, v_minutes;
  
  IF v_minutes = 2 THEN
    RAISE NOTICE 'Test superato! Il trigger ha aggiornato correttamente i minuti.';
  ELSE
    RAISE WARNING 'Test fallito! Il trigger non ha aggiornato correttamente i minuti. Attesi 2 minuti di differenza, trovati: %', v_minutes;
  END IF;
END$$; 