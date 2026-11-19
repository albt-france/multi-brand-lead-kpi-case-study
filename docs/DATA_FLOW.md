# Data flow

```mermaid
flowchart TB
  subgraph PUBLIC[PUBLIC DATA]
    OM[Open-Meteo weather]; CEN[US Census population]; DD[Disposable domains]; SMS[UCI SMS Spam]; GA4S[Google GA4 sample]
  end
  subgraph SIM[SIMULATED exports - pipeline/simulate.py]
    CRM[CRM contacts]; GADS[Google Ads daily]; LSA[LSA leads]; META[Meta Ads daily]; GA4E[GA4 events]; SHEET[Call sheet]; WH[Form webhooks]
  end
  OM --> SIM; CEN --> SIM
  SMS --> CLF[spam_classifier.py] --> RAW
  SIM --> RAW[raw schema<br/>as exported]
  DD --> RAW
  RAW --> STG[staging.phone_norm<br/>libphonenumber]
  RAW --> CORE[core: leads, contacts, touches,<br/>spend_daily, channel_map_scd2]
  STG --> CORE
  CORE --> AUD[audit: lead_flags, lead_status,<br/>check_results, kpi_snapshots, incidents]
  CORE --> MART[marts: kpi_daily_brand, reconciliation_daily,<br/>recon_cascade, attribution_health, history_check]
  AUD --> MART
  MART --> EXP[export_marts.ts] --> WEB[Next.js dashboard]
  EXP --> LOOK[Looker Studio CSV]
  MART --> DOCS[write_docs.ts: AUDIT_REPORT, DATA_DICTIONARY]
  GA4S --> GP[ga4_public.py] --> WEB
```

| Step | Command | Code |
|---|---|---|
| Public data | `python pipeline/fetch_public.py` | pipeline/fetch_public.py |
| Simulation | `python pipeline/simulate.py` | pipeline/simulate.py |
| Classifier | `python pipeline/spam_classifier.py` | pipeline/spam_classifier.py |
| Database | `npm run db:build` | db/migrations, scripts/db_build.ts, db/transforms/10_core.sql |
| Audit | `npm run audit` | db/audit/*.sql, db/transforms/60-80_*.sql, scripts/evaluate.ts |
| Export | `npm run export` | scripts/export_marts.ts, scripts/write_docs.ts |
| Backup | `npm run backup` | scripts/backup.ts → backups/YYYY-MM-DD/ |
