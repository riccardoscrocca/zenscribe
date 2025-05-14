-- Funzione per ottenere le policy di una tabella (versione corretta)
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
    pg_policy.policyname,
    CASE WHEN pg_policy.permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END as permissive,
    pg_policy.cmd::text,
    pg_policy.qual::text
  FROM 
    pg_policy
  WHERE 
    pg_policy.schemaname = 'public' AND pg_policy.tablename = table_name;
$$; 