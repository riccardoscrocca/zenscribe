-- Questa è una soluzione diretta al problema "Database error granting user"
-- che implementa due meccanismi di sicurezza:
-- 1. Un trigger per creare profili utente automaticamente alla registrazione
-- 2. Un trigger per assicurarsi che gli utenti abbiano un profilo al login
-- In questo modo, il problema viene risolto indipendentemente dalle policy RLS

-- -------------------------------------------------------------------------
-- Parte 1: Trigger per la creazione del profilo alla registrazione
-- -------------------------------------------------------------------------

-- Rimuovi eventuali trigger esistenti
DROP TRIGGER IF EXISTS handle_new_user_insert ON auth.users CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_insert();

-- Funzione per la gestione della creazione di nuovi utenti
CREATE OR REPLACE FUNCTION public.handle_new_user_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER 
AS $$
BEGIN
  -- Inserisci automaticamente il nuovo utente nella tabella public.users
  INSERT INTO public.users (
    id,
    email,
    full_name,
    role,
    is_active,
    subscription_tier,
    created_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Utente Zenscribe'),
    'doctor',
    TRUE,
    'free',
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  
  -- Crea un abbonamento gratuito di base
  INSERT INTO public.user_subscriptions (
    user_id,
    tier,
    monthly_minutes,
    minutes_used,
    start_date,
    end_date,
    is_active,
    price
  ) VALUES (
    NEW.id,
    'free',
    30,
    0,
    NOW(),
    NOW() + INTERVAL '30 days',
    TRUE,
    0
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Registra l'errore ma permetti comunque la creazione dell'utente in auth.users
  RAISE LOG 'Errore durante la creazione del profilo utente: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Crea il trigger per inserire automaticamente i nuovi utenti
CREATE TRIGGER handle_new_user_insert
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_insert();

-- -------------------------------------------------------------------------
-- Parte 2: Trigger per assicurare il profilo al login
-- -------------------------------------------------------------------------

-- Rimuovi eventuali trigger esistenti
DROP TRIGGER IF EXISTS handle_user_login ON auth.sessions CASCADE;
DROP FUNCTION IF EXISTS public.handle_user_login();

-- Funzione per la gestione del login utente
CREATE OR REPLACE FUNCTION public.handle_user_login()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_exists BOOLEAN;
  user_email TEXT;
  user_name TEXT;
BEGIN
  -- Verifica se l'utente ha già un profilo
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = NEW.user_id
  ) INTO user_exists;
  
  -- Se il profilo non esiste, crealo al volo
  IF NOT user_exists THEN
    -- Ottieni i dati dell'utente
    SELECT email, COALESCE(raw_user_meta_data->>'full_name', 'Utente Zenscribe')
    INTO user_email, user_name
    FROM auth.users
    WHERE id = NEW.user_id;
    
    -- Crea il profilo mancante
    INSERT INTO public.users (
      id,
      email,
      full_name,
      role,
      is_active,
      subscription_tier,
      created_at
    ) VALUES (
      NEW.user_id,
      user_email,
      user_name,
      'doctor',
      TRUE,
      'free',
      NOW()
    )
    ON CONFLICT (id) DO NOTHING;
    
    -- Crea un abbonamento gratuito se non esiste
    INSERT INTO public.user_subscriptions (
      user_id,
      tier,
      monthly_minutes,
      minutes_used,
      start_date,
      end_date,
      is_active,
      price
    ) VALUES (
      NEW.user_id,
      'free',
      30,
      0,
      NOW(),
      NOW() + INTERVAL '30 days',
      TRUE,
      0
    )
    ON CONFLICT (user_id) DO NOTHING;
    
    RAISE LOG 'Profilo utente creato automaticamente durante il login per: %', user_email;
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Registra l'errore ma permetti comunque il login
  RAISE LOG 'Errore durante la verifica/creazione del profilo al login: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Crea il trigger per gestire il login
CREATE TRIGGER handle_user_login
AFTER INSERT ON auth.sessions
FOR EACH ROW
EXECUTE FUNCTION public.handle_user_login();

-- -------------------------------------------------------------------------
-- Parte 3: Concedi i permessi necessari
-- -------------------------------------------------------------------------

-- Assicurati che il ruolo service_role abbia i permessi necessari
GRANT USAGE ON SCHEMA auth TO service_role;
GRANT SELECT ON auth.users TO service_role;
GRANT SELECT, INSERT ON auth.sessions TO service_role;

-- Assicurati che le tabelle users e user_subscriptions siano accessibili
GRANT ALL ON public.users TO service_role;
GRANT ALL ON public.user_subscriptions TO service_role;

-- -------------------------------------------------------------------------
-- Log finale
-- -------------------------------------------------------------------------

DO $$
BEGIN
  RAISE NOTICE 'Installazione completata. Gli utenti verranno creati automaticamente al login.';
END
$$; 