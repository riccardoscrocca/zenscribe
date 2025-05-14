-- Funzione per consentire la creazione di sottoscrizioni da parte degli amministratori
-- Questa funzione è necessaria per aggirare le policy RLS

-- Droppiamo la funzione se esiste già
DROP FUNCTION IF EXISTS admin_create_subscription(p_email text, p_tier text);

-- Creiamo la funzione per creare sottoscrizioni
CREATE OR REPLACE FUNCTION admin_create_subscription(p_email text, p_tier text DEFAULT 'basic')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER -- Esegue con i privilegi del creatore
AS $$
DECLARE
    v_user_id uuid;
    v_plan_id uuid;
    v_subscription_id uuid;
    v_period_start timestamptz := now();
    v_period_end timestamptz := (now() + interval '30 days');
BEGIN
    -- Ottieni l'id utente dalla email
    SELECT id INTO v_user_id
    FROM users
    WHERE email = p_email;
    
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Utente con email %s non trovato', p_email)
        );
    END IF;
    
    -- Ottieni il piano corrispondente al tier
    SELECT id INTO v_plan_id
    FROM subscription_plans
    WHERE name = p_tier;
    
    IF v_plan_id IS NULL THEN
        -- Fallback al piano basic se il tier richiesto non esiste
        SELECT id INTO v_plan_id
        FROM subscription_plans
        WHERE name = 'basic';
        
        IF v_plan_id IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Piano di sottoscrizione non trovato'
            );
        END IF;
    END IF;
    
    -- Crea una nuova sottoscrizione
    INSERT INTO user_subscriptions (
        user_id,
        plan_id,
        minutes_used,
        current_period_start,
        current_period_end
    ) VALUES (
        v_user_id,
        v_plan_id,
        0,
        v_period_start,
        v_period_end
    )
    RETURNING id INTO v_subscription_id;
    
    -- Aggiorna il tier utente in base alla sottoscrizione
    UPDATE users
    SET subscription_tier = p_tier
    WHERE id = v_user_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_user_id,
        'plan_id', v_plan_id,
        'subscription_id', v_subscription_id,
        'period_start', v_period_start,
        'period_end', v_period_end
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- Concedi i privilegi di esecuzione alla funzione
REVOKE ALL ON FUNCTION admin_create_subscription(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_create_subscription(text, text) TO authenticated;

-- Log della migrazione
DO $$
BEGIN
    RAISE NOTICE 'Migrazione completata: funzione admin_create_subscription creata con successo';
END
$$; 