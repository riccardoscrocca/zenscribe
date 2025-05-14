-- Questa soluzione crea una funzione e un trigger che si attivano quando un utente fa login
-- e crea automaticamente un profilo nella tabella users se non esiste ancora.
-- Questo risolve il problema "Database error granting user" bypassando le policy RLS.

-- 1. Rimuovi il trigger esistente se presente
DROP TRIGGER IF EXISTS ensure_user_profile_on_login ON auth.sessions;
DROP FUNCTION IF EXISTS public.ensure_user_profile();

-- 2. Crea la funzione che verificherà e creerà il profilo se necessario
CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER -- Importante: esegue con i privilegi del creatore
AS $$
DECLARE
  user_exists BOOLEAN;
  user_email TEXT;
  user_name TEXT;
  new_user_id UUID;
BEGIN
  -- Ottieni l'ID dell'utente dalla sessione
  new_user_id := NEW.user_id;
  
  -- Verifica se esiste già un profilo per questo utente
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = new_user_id
  ) INTO user_exists;
  
  -- Se il profilo non esiste, crealo
  IF NOT user_exists THEN
    -- Ottieni i dati dell'utente dalla tabella auth.users
    SELECT email, COALESCE(raw_user_meta_data->>'full_name', 'Utente Zenscribe')
    INTO user_email, user_name
    FROM auth.users
    WHERE id = new_user_id;
    
    -- Log di debug
    RAISE LOG 'Tentativo di creazione profilo per utente % (%) durante il login', user_email, new_user_id;
    
    -- Inserisci il nuovo profilo
    BEGIN
      INSERT INTO public.users (
        id, 
        email, 
        full_name, 
        role,
        is_active,
        subscription_tier,
        created_at
      ) VALUES (
        new_user_id,
        user_email,
        user_name,
        'doctor',
        TRUE,
        'free',
        NOW()
      )
      ON CONFLICT (id) DO NOTHING;
      
      RAISE LOG 'Profilo creato con successo per utente % durante il login', user_email;
    EXCEPTION WHEN OTHERS THEN
      -- Log dettagliato dell'errore
      RAISE LOG 'Errore durante la creazione del profilo utente al login: %', SQLERRM;
    END;
    
    -- Prova a creare un abbonamento gratuito
    BEGIN
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
        new_user_id,
        'free',
        30, -- 30 minuti gratuiti al mese
        0,  -- nessun minuto utilizzato inizialmente
        NOW(),
        NOW() + INTERVAL '30 days',
        TRUE,
        0
      )
      ON CONFLICT (user_id) DO NOTHING;
      
      RAISE LOG 'Abbonamento gratuito creato per l''utente % durante il login', user_email;
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG 'Errore durante la creazione dell''abbonamento al login: %', SQLERRM;
      -- Non facciamo fallire il trigger per errori nell'abbonamento
    END;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 3. Crea il trigger che si attiva su INSERT nella tabella auth.sessions (quando un utente fa login)
CREATE TRIGGER ensure_user_profile_on_login
AFTER INSERT ON auth.sessions
FOR EACH ROW
EXECUTE FUNCTION public.ensure_user_profile();

-- 4. Concedi i privilegi necessari
GRANT USAGE ON SCHEMA auth TO service_role;
GRANT SELECT ON auth.users TO service_role;
GRANT SELECT, INSERT ON auth.sessions TO service_role;

-- 5. Log di completamento
DO $$
BEGIN
  RAISE NOTICE 'Trigger di verifica profilo utente al login configurato con successo';
END
$$; 