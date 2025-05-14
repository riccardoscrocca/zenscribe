-- Funzione per ottenere l'auth.uid() corrente
CREATE OR REPLACE FUNCTION get_auth_uid()
RETURNS uuid
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT auth.uid();
$$;

-- Funzione per ottenere lo stato RLS di una tabella
CREATE OR REPLACE FUNCTION get_table_rls_status(table_name text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER 
AS $$
  SELECT relrowsecurity FROM pg_class WHERE relname = table_name;
$$;

-- Funzione per verificare se esiste una funzione
CREATE OR REPLACE FUNCTION function_exists(function_name text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = function_name
  );
$$;

-- Funzione per ottenere le colonne di una tabella
CREATE OR REPLACE FUNCTION get_table_columns(table_name text)
RETURNS TABLE (
  column_name text,
  data_type text,
  is_nullable text,
  column_default text
)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
  FROM 
    information_schema.columns
  WHERE 
    table_schema = 'public' AND table_name = table_name
  ORDER BY 
    ordinal_position;
$$;

-- Funzione per ottenere le policy di una tabella
CREATE OR REPLACE FUNCTION get_table_policies(table_name text)
RETURNS TABLE (
  policyname text,
  permissive text,
  cmd text,
  qual text
)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT 
    policyname,
    CASE WHEN permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END as permissive,
    cmd::text,
    qual::text
  FROM 
    pg_policy
  WHERE 
    schemaname = 'public' AND tablename = table_name;
$$;

-- Funzione per verificare la capacità di inserimento nella tabella users
CREATE OR REPLACE FUNCTION test_insert_user(user_id uuid, user_email text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  success boolean;
BEGIN
  BEGIN
    -- Tenta di inserire l'utente (se non esiste già)
    INSERT INTO public.users (id, email, created_at, full_name)
    VALUES (user_id, user_email, now(), 'Test User')
    ON CONFLICT (id) DO NOTHING;
    success := true;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Errore durante l''inserimento: %', SQLERRM;
    success := false;
  END;
  
  RETURN success;
END;
$$;

-- Funzione per bypassare RLS e inserire direttamente un utente
CREATE OR REPLACE FUNCTION admin_insert_user(user_id uuid, user_email text, user_name text DEFAULT 'User')
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  success boolean;
BEGIN
  BEGIN
    -- Tenta di inserire l'utente con RLS bypassato grazie a SECURITY DEFINER
    INSERT INTO users (id, email, created_at, full_name)
    VALUES (user_id, user_email, now(), user_name)
    ON CONFLICT (id) DO NOTHING;
    success := true;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Errore durante l''inserimento: %', SQLERRM;
    success := false;
  END;
  
  RETURN success;
END;
$$; 