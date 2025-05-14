-- Migrazione per correggere il calcolo dei minuti utilizzati

-- Funzione per ricalcolare i minuti utilizzati per una sottoscrizione
CREATE OR REPLACE FUNCTION recalculate_subscription_minutes(p_subscription_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_minutes integer := 0;
    v_subscription record;
BEGIN
    -- Ottieni i dettagli della sottoscrizione
    SELECT * INTO v_subscription
    FROM user_subscriptions
    WHERE id = p_subscription_id;

    IF v_subscription IS NULL THEN
        RAISE EXCEPTION 'Sottoscrizione non trovata: %', p_subscription_id;
    END IF;

    -- Calcola il totale dei minuti dalle consultazioni
    SELECT COALESCE(SUM(CEIL(duration_seconds::float / 60)), 0)::integer
    INTO v_total_minutes
    FROM consultations c
    JOIN patients p ON p.id = c.patient_id
    WHERE p.user_id = v_subscription.user_id
    AND c.created_at >= v_subscription.current_period_start
    AND c.created_at <= v_subscription.current_period_end
    AND c.duration_seconds IS NOT NULL
    AND c.duration_seconds > 0;

    -- Aggiorna i minuti utilizzati
    UPDATE user_subscriptions
    SET minutes_used = v_total_minutes
    WHERE id = p_subscription_id;

    -- Registra la correzione nel log
    INSERT INTO minutes_update_log (
        user_id,
        subscription_id,
        old_minutes_used,
        new_minutes_used,
        success,
        error_message
    ) VALUES (
        v_subscription.user_id,
        p_subscription_id,
        v_subscription.minutes_used,
        v_total_minutes,
        true,
        'Correzione automatica dei minuti'
    );

    RETURN v_total_minutes;
END;
$$;

-- Funzione per correggere tutte le sottoscrizioni attive
CREATE OR REPLACE FUNCTION fix_all_active_subscriptions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_subscription record;
BEGIN
    FOR v_subscription IN
        SELECT *
        FROM user_subscriptions
        WHERE current_period_end >= now()
    LOOP
        PERFORM recalculate_subscription_minutes(v_subscription.id);
    END LOOP;
END;
$$;

-- Esegui la correzione per tutte le sottoscrizioni attive
SELECT fix_all_active_subscriptions(); 