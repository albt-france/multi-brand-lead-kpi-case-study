"""PUBLIC DATA panel: attribution health of Google's real GA4 sample (Google Merchandise Store).

E-commerce sample, NOT lead-gen: it shows how real tracking data looks (unset sources, self-referrals,
first-touch vs session source), not the fictional brands' numbers.
Input: page_view / session_start events (slim extract of the public sample, see fetch_public.py).
Output: data/derived/ga4_public.json
"""
import json
import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "derived" / "ga4_public.json"
OUT.parent.mkdir(parents=True, exist_ok=True)
# page_view events carry the event-level source/medium; the slim file is reused from an earlier study if present
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "raw" / "ga4" / "ga4_events_slim.parquet"

con = duckdb.connect()
con.execute(f"CREATE VIEW ev AS SELECT * FROM '{SRC.as_posix()}'")
# One row per session: first event-level source/medium seen in the session, and the user's first-touch source.
con.execute("""
CREATE TABLE s AS
SELECT user_pseudo_id, ga_session_id,
       min(event_date) AS d,
       arg_min(ep_source, event_timestamp) FILTER (WHERE ep_source IS NOT NULL) AS src,
       arg_min(ep_medium, event_timestamp) FILTER (WHERE ep_medium IS NOT NULL) AS med,
       any_value(traffic_source) AS first_src, any_value(traffic_medium) AS first_med,
       max(device_category) AS device
FROM ev WHERE event_name IN ('page_view', 'session_start')
GROUP BY 1, 2
""")
total = con.sql("SELECT count(*) FROM s").fetchone()[0]

def share(where: str) -> float:
    return round(con.sql(f"SELECT count(*) FROM s WHERE {where}").fetchone()[0] / total, 4)

buckets = {
    "No source on any page_view": share("src IS NULL"),
    "Self-referral (own domain)": share("src ILIKE '%googlemerchandisestore.com%'"),
    "(direct)": share("src = '(direct)'"),
    "<Other> (obfuscated)": share("src = '<Other>'"),
    "(data deleted)": share("src = '(data deleted)'"),
    "Attributed source": share("src IS NOT NULL AND src NOT ILIKE '%googlemerchandisestore.com%' "
                               "AND src NOT IN ('(direct)', '<Other>', '(data deleted)')"),
}
known = "src IS NOT NULL AND first_src IS NOT NULL"
mismatch = con.sql(f"SELECT avg((src <> first_src)::int) FROM s WHERE {known} AND src <> '(direct)'").fetchone()[0]
weekly = con.sql("""
SELECT strftime(date_trunc('week', strptime(d, '%Y%m%d')), '%Y-%m-%d') AS week,
       count(*) AS sessions,
       round(avg((src IS NULL)::int), 4) AS no_source,
       round(avg((src ILIKE '%googlemerchandisestore.com%')::int), 4) AS self_referral,
       round(avg((src = '(direct)')::int), 4) AS direct
FROM s GROUP BY 1 ORDER BY 1
""").fetchall()
first = con.sql("SELECT first_src, count(*) FROM s GROUP BY 1 ORDER BY 2 DESC LIMIT 6").fetchall()
res = {
    "label": "PUBLIC DATA - Google GA4 obfuscated sample (Google Merchandise Store), e-commerce, not lead-gen",
    "period": [con.sql("SELECT min(d) FROM s").fetchone()[0], con.sql("SELECT max(d) FROM s").fetchone()[0]],
    "sessions": total,
    "session_source_buckets": buckets,
    "first_touch_vs_session_source_mismatch": round(mismatch, 4),
    "first_touch_sources": [[k or "(null)", v] for k, v in first],
    "weekly": [dict(zip(["week", "sessions", "no_source", "self_referral", "direct"], r)) for r in weekly],
    "utm_in_page_location": 0,
    "note": "page_location in the obfuscated sample carries no UTM / gclid parameters, so URL-level checks are shown on simulated data only.",
}
OUT.write_text(json.dumps(res, indent=1))
print(total, buckets, round(mismatch, 3))
