-- 006_rls_example.sql
-- Row Level Security example: each brand manager sees only their brand's leads.
-- On Supabase, auth.uid() returns the signed-in user's id and the role "authenticated" exists.
-- Locally (PGlite) db/support/supabase_stub.sql creates the same role and function so this file runs unchanged.

CREATE TABLE IF NOT EXISTS core.brand_access (
  user_id uuid NOT NULL,
  brand text NOT NULL REFERENCES core.brands,
  PRIMARY KEY (user_id, brand)
);

ALTER TABLE core.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leads_by_brand ON core.leads;
CREATE POLICY leads_by_brand ON core.leads
  FOR SELECT TO authenticated
  USING (brand IN (SELECT a.brand FROM core.brand_access a WHERE a.user_id = auth.uid()));

GRANT USAGE ON SCHEMA core TO authenticated;
GRANT SELECT ON core.leads, core.brand_access TO authenticated;
