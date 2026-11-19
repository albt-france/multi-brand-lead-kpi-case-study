-- integrity.sql : assertions on the built database. Each block raises an error if the rule is broken.

DO $$ BEGIN  -- nothing lost between raw and core
  IF (SELECT count(*) FROM raw.crm_contacts) <> (SELECT count(*) FROM core.leads) THEN
    RAISE EXCEPTION 'core.leads row count differs from raw.crm_contacts'; END IF;
END $$;

DO $$ BEGIN  -- every lead has exactly one verdict and one attribution
  IF EXISTS (SELECT 1 FROM core.leads l LEFT JOIN audit.lead_status s USING (lead_id) LEFT JOIN core.touches t USING (lead_id)
             WHERE s.lead_id IS NULL OR t.lead_id IS NULL OR t.corrected_channel IS NULL) THEN
    RAISE EXCEPTION 'lead without status or attribution'; END IF;
END $$;

DO $$ BEGIN  -- statuses are from the allowed list
  IF EXISTS (SELECT 1 FROM audit.lead_status WHERE status NOT IN ('valid', 'duplicate', 'spam', 'invalid')) THEN
    RAISE EXCEPTION 'unknown status'; END IF;
END $$;

DO $$ BEGIN  -- a duplicate points to an EARLIER lead of the SAME brand
  IF EXISTS (SELECT 1 FROM audit.lead_status s JOIN core.leads l USING (lead_id) JOIN core.leads p ON p.lead_id = s.duplicate_of
             WHERE s.status = 'duplicate' AND (p.brand <> l.brand OR p.created_at >= l.created_at)) THEN
    RAISE EXCEPTION 'duplicate linked to a later lead or another brand'; END IF;
END $$;

DO $$ BEGIN  -- every flag has a readable reason
  IF EXISTS (SELECT 1 FROM audit.lead_flags WHERE coalesce(reason, '') = '') THEN
    RAISE EXCEPTION 'flag without reason'; END IF;
END $$;

DO $$ BEGIN  -- funnel order: qualified <= leads <= submissions, every day/brand/channel
  IF EXISTS (SELECT 1 FROM marts.kpi_daily_brand WHERE NOT (qualified <= leads AND leads <= submissions)) THEN
    RAISE EXCEPTION 'funnel order broken'; END IF;
END $$;

DO $$ BEGIN  -- spend: net = gross - credits, never negative
  IF EXISTS (SELECT 1 FROM core.spend_daily WHERE net_cost <> gross_cost - credits OR net_cost < 0) THEN
    RAISE EXCEPTION 'spend arithmetic broken'; END IF;
END $$;

DO $$ BEGIN  -- marts reconcile to source: total platform spend equals the raw exports
  IF abs((SELECT sum(spend_gross) FROM marts.kpi_daily_brand)
       - ((SELECT sum(cost::numeric) FROM raw.google_ads_daily) + (SELECT sum(amount_spent::numeric) FROM raw.meta_ads_daily)
          + (SELECT sum(charge_usd::numeric) FROM raw.lsa_leads))) > 0.01 THEN
    RAISE EXCEPTION 'mart spend does not reconcile to raw exports'; END IF;
END $$;

DO $$ BEGIN  -- local day is never more than one day away from the UTC day
  IF EXISTS (SELECT 1 FROM core.leads WHERE abs(local_date - utc_date) > 1) THEN
    RAISE EXCEPTION 'time-zone conversion out of range'; END IF;
END $$;

DO $$ BEGIN  -- SCD2: versions of the same label never overlap in time
  IF EXISTS (SELECT 1 FROM core.channel_map_scd2 a JOIN core.channel_map_scd2 b
             ON a.source_label = b.source_label AND a.match_type = b.match_type AND a.map_id < b.map_id
             AND daterange(a.valid_from, coalesce(a.valid_to, 'infinity'), '[]') && daterange(b.valid_from, coalesce(b.valid_to, 'infinity'), '[]')) THEN
    RAISE EXCEPTION 'overlapping channel-map versions'; END IF;
END $$;

DO $$ BEGIN  -- closed months unchanged (CHK11)
  IF EXISTS (SELECT 1 FROM audit.check_results WHERE check_id = 'CHK11' AND status <> 'pass') THEN
    RAISE EXCEPTION 'a closed month changed'; END IF;
END $$;

DO $$ BEGIN  -- the false signal must stay "explained", never become a data fix
  IF NOT EXISTS (SELECT 1 FROM audit.incidents WHERE incident_no = 11 AND kind = 'false_signal')
     OR NOT EXISTS (SELECT 1 FROM audit.check_results WHERE check_id = 'CHK10' AND brand = 'HVAC-PHX' AND status = 'explained') THEN
    RAISE EXCEPTION 'heat wave not handled as a false signal'; END IF;
END $$;
