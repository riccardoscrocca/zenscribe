/*
  # Abilita l'estensione pg_cron per la schedulazione dei job

  1. Funzionalità
    - Abilita l'estensione pg_cron nel database per supportare job schedulati
    - Crea uno schema dedicato per le funzioni cron
    
  2. Note
    - Questa è una prerequisito per la migrazione di rinnovo automatico delle sottoscrizioni
*/

-- Abilita l'estensione pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA cron;

-- Crea uno schema dedicato se non esiste già
CREATE SCHEMA IF NOT EXISTS cron;

-- Assicurati che l'estensione sia installata correttamente
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'L''estensione pg_cron non è stata installata correttamente';
  END IF;
  
  RAISE NOTICE 'L''estensione pg_cron è stata installata correttamente';
END $$; 