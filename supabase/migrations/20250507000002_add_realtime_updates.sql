-- Abilita il supporto realtime per la tabella user_subscriptions
ALTER TABLE user_subscriptions REPLICA IDENTITY FULL;

-- Funzione per notificare gli aggiornamenti dei minuti
CREATE OR REPLACE FUNCTION notify_subscription_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Pubblica l'aggiornamento sul canale subscription_updates
    PERFORM pg_notify(
        'subscription_updates',
        json_build_object(
            'user_id', NEW.user_id,
            'minutes_used', NEW.minutes_used,
            'subscription_id', NEW.id,
            'current_period_start', NEW.current_period_start,
            'current_period_end', NEW.current_period_end
        )::text
    );
    RETURN NEW;
END;
$$;

-- Crea il trigger per le notifiche
DROP TRIGGER IF EXISTS subscription_update_trigger ON user_subscriptions;
CREATE TRIGGER subscription_update_trigger
    AFTER UPDATE OF minutes_used ON user_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION notify_subscription_update();

-- Abilita la pubblicazione delle modifiche
DROP PUBLICATION IF EXISTS subscription_changes;
CREATE PUBLICATION subscription_changes FOR TABLE user_subscriptions; 