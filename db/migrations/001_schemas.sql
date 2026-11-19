-- 001_schemas.sql
-- Five layers, one schema each (works as-is on Supabase / any PostgreSQL 15+):
--   raw      exactly what each system exported, all text, never edited
--   staging  typed and normalized copies (phones in E.164, e-mails lower-case)
--   core     the business model: leads, contacts, touches, spend, versioned channel map
--   audit    rules, flags on leads, automated checks, monthly KPI snapshots, incident log
--   marts    views the dashboard reads (KPIs, reconciliation, attribution health)
CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS staging;
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS marts;
