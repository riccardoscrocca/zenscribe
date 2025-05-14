-- Questa soluzione crea un trigger sulla tabella auth.users che
-- inserisce automaticamente un record nella tabella public.users
-- quando un nuovo utente si registra, bypassando completamente le policy RLS.

-- 1. Rimuovi il trigger esistente se presente
DROP TRIGGER IF EXISTS create_profile_for_user ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- 2. Crea la funzione che gestirà l'inserimento automatico del profilo
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER -- Importante: esegue con i privilegi del creatore
AS $$
DECLARE
  insert_success BOOLEAN;
BEGIN
  -- Prova ad inserire un nuovo record nella tabella users, ignorando i conflitti
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
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'Utente Zenscribe'),
      'doctor',
      TRUE,
      'free',
      NOW()
    )
    ON CONFLICT (id) DO NOTHING;
    
    -- Se arriviamo qui, l'inserimento è riuscito o c'era già un record
    insert_success := TRUE;
  EXCEPTION WHEN OTHERS THEN
    -- Log dettagliato dell'errore
    RAISE LOG 'Errore durante la creazione del profilo utente: %', SQLERRM;
    insert_success := FALSE;
  END;
  
  -- Se l'inserimento dell'utente è fallito, non preoccuparti
  -- il trigger deve comunque restituire NEW per permettere la creazione
  -- dell'utente in auth.users
  
  -- Prova anche a creare un abbonamento gratuito per il nuovo utente
  IF insert_success THEN
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
        NEW.id,
        'free',
        30, -- 30 minuti gratuiti al mese
        0,  -- nessun minuto utilizzato inizialmente
        NOW(),
        NOW() + INTERVAL '30 days',
        TRUE,
        0
      )
      ON CONFLICT (user_id) DO NOTHING;
      
      RAISE LOG 'Abbonamento gratuito creato con successo per l''utente %', NEW.email;
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG 'Errore durante la creazione dell''abbonamento: %', SQLERRM;
      -- Non facciamo fallire il trigger per errori nell'abbonamento
    END;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 3. Crea il trigger che si attiva su INSERT nella tabella auth.users
CREATE TRIGGER create_profile_for_user
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- 4. Concedi i privilegi necessari
GRANT USAGE ON SCHEMA auth TO service_role;
GRANT SELECT ON auth.users TO service_role;

-- 5. Log di completamento
DO $$
BEGIN
  RAISE NOTICE 'Trigger di creazione profilo utente configurato con successo';
END
$$; 