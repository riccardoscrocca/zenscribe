/*
  # Crea una funzione SQL per eseguire query SQL dinamiche
  
  Questa funzione permetterà di eseguire query SQL dinamiche tramite RPC.
  È necessaria per installare il rinnovo automatico delle sottoscrizioni.
*/

-- Crea la funzione per eseguire SQL dinamicamente (solo per gli amministratori)
CREATE OR REPLACE FUNCTION pg_execute(sql_query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Esegue la query SQL dinamica
  EXECUTE sql_query;
  
  -- Ritorna un oggetto JSON vuoto come successo
  RETURN '{}'::jsonb;
EXCEPTION WHEN OTHERS THEN
  -- In caso di errore, ritorna l'errore come JSON
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- Concedi i privilegi solo agli amministratori
REVOKE ALL ON FUNCTION pg_execute(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg_execute(text) TO authenticated;

-- Log
DO $$
BEGIN
  RAISE NOTICE 'Funzione pg_execute creata con successo';
END $$; 