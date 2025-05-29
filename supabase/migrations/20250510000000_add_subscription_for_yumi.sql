-- Migrazione per aggiungere una sottoscrizione per l'utente yumi.aibot@gmail.com

-- Verifica se l'utente esiste
DO $$
DECLARE
  v_user_id uuid;
  v_plan_id uuid;
  v_existing_sub_id uuid;
  v_start_date timestamp with time zone;
  v_end_date timestamp with time zone;
BEGIN
  -- Ottieni l'ID dell'utente
  SELECT id INTO v_user_id 
  FROM auth.users 
  WHERE email = 'yumi.aibot@gmail.com';
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utente yumi.aibot@gmail.com non trovato';
  END IF;
  
  RAISE NOTICE 'Utente trovato con ID: %', v_user_id;
  
  -- Ottieni l'ID del piano basic
  SELECT id INTO v_plan_id 
  FROM subscription_plans 
  WHERE name = 'basic';
  
  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Piano "basic" non trovato';
  END IF;
  
  RAISE NOTICE 'Piano basic trovato con ID: %', v_plan_id;
  
  -- Verifica se esistono già sottoscrizioni per questo utente
  SELECT id INTO v_existing_sub_id 
  FROM user_subscriptions 
  WHERE user_id = v_user_id;
  
  IF v_existing_sub_id IS NOT NULL THEN
    RAISE NOTICE 'Eliminazione sottoscrizione esistente con ID: %', v_existing_sub_id;
    
    -- Elimina la sottoscrizione esistente
    DELETE FROM user_subscriptions 
    WHERE id = v_existing_sub_id;
  END IF;
  
  -- Calcola le date di inizio e fine per il periodo corrente
  v_start_date := date_trunc('month', now());
  v_end_date := (date_trunc('month', now()) + interval '1 month' - interval '1 second');
  
  RAISE NOTICE 'Creazione sottoscrizione per il periodo: % - %', v_start_date, v_end_date;
  
  -- Crea una nuova sottoscrizione
  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    current_period_start,
    current_period_end,
    minutes_used
  ) VALUES (
    v_user_id,
    v_plan_id,
    v_start_date,
    v_end_date,
    0
  );
  
  RAISE NOTICE 'Sottoscrizione creata con successo';
  
  -- Aggiorna la tabella utenti se necessario
  UPDATE auth.users 
  SET raw_app_meta_data = jsonb_set(
    raw_app_meta_data, 
    '{subscription_tier}', 
    '"basic"'
  )
  WHERE id = v_user_id;
  
  UPDATE users
  SET subscription_tier = 'basic'
  WHERE id = v_user_id;
  
  RAISE NOTICE 'Informazioni utente aggiornate con tier: basic';
  
  -- Aggiungi un log per diagnostica
  INSERT INTO minutes_update_log (
    user_id,
    subscription_id,
    old_minutes_used,
    new_minutes_used,
    success,
    error_message
  )
  SELECT 
    v_user_id, 
    id,
    0,
    0,
    true,
    'Sottoscrizione creata manualmente'
  FROM user_subscriptions
  WHERE user_id = v_user_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  RAISE NOTICE 'Log di aggiornamento minuti creato';
  
  -- Ricalcola i minuti usati
  PERFORM recalculate_subscription_minutes(id)
  FROM user_subscriptions
  WHERE user_id = v_user_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  RAISE NOTICE 'Minuti ricalcolati';
END $$; 