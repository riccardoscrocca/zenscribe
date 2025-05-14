-- Migrazione per risolvere il problema delle sottoscrizioni duplicate
-- e migliorare la gestione delle sottoscrizioni

-- Funzione per pulire le sottoscrizioni duplicate
CREATE OR REPLACE FUNCTION clean_duplicate_subscriptions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user record;
    v_latest_sub record;
BEGIN
    -- Per ogni utente con sottoscrizioni multiple nello stesso periodo
    FOR v_user IN
        SELECT DISTINCT user_id
        FROM user_subscriptions us1
        WHERE EXISTS (
            SELECT 1
            FROM user_subscriptions us2
            WHERE us2.user_id = us1.user_id
            AND us2.id != us1.id
            AND us2.current_period_start = us1.current_period_start
            AND us2.current_period_end = us1.current_period_end
        )
    LOOP
        -- Trova la sottoscrizione più recente per il periodo corrente
        SELECT us.*
        INTO v_latest_sub
        FROM user_subscriptions us
        WHERE us.user_id = v_user.user_id
        AND us.current_period_start <= now()
        AND us.current_period_end >= now()
        ORDER BY created_at DESC
        LIMIT 1;

        -- Elimina tutte le altre sottoscrizioni per lo stesso periodo
        IF v_latest_sub.id IS NOT NULL THEN
            DELETE FROM user_subscriptions
            WHERE user_id = v_user.user_id
            AND current_period_start = v_latest_sub.current_period_start
            AND current_period_end = v_latest_sub.current_period_end
            AND id != v_latest_sub.id;
        END IF;
    END LOOP;
END;
$$;

-- Aggiungi un vincolo UNIQUE più forte per prevenire future duplicazioni
ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_user_id_period_key;
ALTER TABLE user_subscriptions ADD CONSTRAINT user_subscriptions_user_id_period_key 
    UNIQUE (user_id, current_period_start, current_period_end);

-- Migliora la funzione di aggiornamento minuti per gestire meglio i periodi
CREATE OR REPLACE FUNCTION update_subscription_minutes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_period record;
    v_subscription record;
    v_minutes integer;
    v_user_id uuid;
    v_plan_id uuid;
BEGIN
    -- Calcola i minuti
    v_minutes := CEIL(NEW.duration_seconds::float / 60);
    
    -- Ottieni il periodo corrente
    SELECT 
        date_trunc('month', now()) as period_start,
        (date_trunc('month', now()) + interval '1 month' - interval '1 second') as period_end
    INTO v_period;

    -- Ottieni user_id dal paziente
    SELECT user_id INTO v_user_id
    FROM patients 
    WHERE id = NEW.patient_id;
    
    IF v_user_id IS NULL THEN
        RAISE WARNING 'User ID non trovato per patient_id: %', NEW.patient_id;
        RETURN NEW;
    END IF;

    -- Ottieni il piano dell'utente
    SELECT p.id INTO v_plan_id
    FROM users u
    JOIN subscription_plans p ON p.name = u.subscription_tier
    WHERE u.id = v_user_id;

    -- Se non trova un piano, usa quello gratuito
    IF v_plan_id IS NULL THEN
        SELECT id INTO v_plan_id 
        FROM subscription_plans 
        WHERE name = 'free' 
        LIMIT 1;
    END IF;

    -- Pulisci eventuali sottoscrizioni duplicate prima di procedere
    PERFORM clean_duplicate_subscriptions();

    -- Inserisci o aggiorna la sottoscrizione
    INSERT INTO user_subscriptions (
        user_id,
        plan_id,
        minutes_used,
        current_period_start,
        current_period_end
    )
    VALUES (
        v_user_id,
        v_plan_id,
        v_minutes,
        v_period.period_start,
        v_period.period_end
    )
    ON CONFLICT (user_id, current_period_start, current_period_end)
    DO UPDATE SET
        minutes_used = COALESCE(user_subscriptions.minutes_used, 0) + v_minutes;

    -- Registra l'aggiornamento nel log
    INSERT INTO minutes_update_log (
        user_id,
        consultation_id,
        duration_seconds,
        minutes_attempted,
        success,
        subscription_id,
        old_minutes_used,
        new_minutes_used
    )
    SELECT
        v_user_id,
        NEW.id,
        NEW.duration_seconds,
        v_minutes,
        true,
        us.id,
        us.minutes_used - v_minutes,
        us.minutes_used
    FROM user_subscriptions us
    WHERE us.user_id = v_user_id
    AND us.current_period_start = v_period.period_start
    AND us.current_period_end = v_period.period_end;

    RETURN NEW;
END;
$$;

-- Ricrea il trigger con la nuova funzione
DROP TRIGGER IF EXISTS update_minutes_used_trigger ON consultations;
CREATE TRIGGER update_minutes_used_trigger
    AFTER INSERT OR UPDATE OF duration_seconds ON consultations
    FOR EACH ROW
    WHEN (NEW.duration_seconds IS NOT NULL AND NEW.duration_seconds > 0)
    EXECUTE FUNCTION update_subscription_minutes();

-- Esegui la pulizia iniziale delle sottoscrizioni duplicate
SELECT clean_duplicate_subscriptions(); 