"""Download the PUBLIC DATA used by the case study, once, into data/raw/.

Sources (all public, no key needed):
  1. Open-Meteo Archive API - daily weather for the five metro areas (CC BY 4.0).
  2. US Census Bureau - county population estimates, vintage 2025 (public domain).
  3. disposable-email-domains blocklist (CC0).
  4. UCI SMS Spam Collection (CC BY 4.0) - labelled text to train a small spam classifier.
  5. Google GA4 obfuscated sample (Google Merchandise Store) via the Hugging Face mirror
     gizdevans/ga4-bq-flattened-data (MIT). Streamed with DuckDB; only a slim extract is kept.

    python pipeline/fetch_public.py            # 1-4 (fast)
    python pipeline/fetch_public.py --ga4      # 5 (streams ~1.8 GB, keeps a few MB)
Files already present are not downloaded again (polite collection).
"""
import io
import json
import sys
import time
import zipfile
from datetime import date
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
RAW.mkdir(parents=True, exist_ok=True)
HEADERS = {"User-Agent": "lead-kpi-case-study/1.0"}  # neutral user agent, no contact details

# The five fictional brands: city coordinates, IANA time zone and the county (FIPS) they serve.
BRANDS = {
    "HVAC-PHX": dict(lat=33.45, lon=-112.07, tz="America/Phoenix", fips="04013", county="Maricopa County, AZ"),
    "PLMB-DAL": dict(lat=32.78, lon=-96.80, tz="America/Chicago", fips="48113", county="Dallas County, TX"),
    "ROOF-TPA": dict(lat=27.95, lon=-82.46, tz="America/New_York", fips="12057", county="Hillsborough County, FL"),
    "ELEC-ATL": dict(lat=33.75, lon=-84.39, tz="America/New_York", fips="13121", county="Fulton County, GA"),
    "PEST-BNA": dict(lat=36.16, lon=-86.78, tz="America/Chicago", fips="47037", county="Davidson County, TN"),
}
START, END = "2025-05-01", "2026-10-31"


def get(url: str) -> requests.Response:
    """GET with a neutral user agent and a short pause between calls."""
    r = requests.get(url, headers=HEADERS, timeout=120)
    r.raise_for_status()
    time.sleep(1)
    return r


def log(name: str, url: str, licence: str) -> None:
    """Append one line per source to data/raw/SOURCES.json (url, licence, retrieval date)."""
    path = RAW / "SOURCES.json"
    data = json.loads(path.read_text()) if path.exists() else {}
    data[name] = {"url": url, "licence": licence, "retrieved": date.today().isoformat()}
    path.write_text(json.dumps(data, indent=2))


def weather() -> None:
    for code, b in BRANDS.items():
        out = RAW / "weather" / f"{code}.json"
        if out.exists():
            continue
        out.parent.mkdir(exist_ok=True)
        url = ("https://archive-api.open-meteo.com/v1/archive"
               f"?latitude={b['lat']}&longitude={b['lon']}&start_date={START}&end_date={END}"
               "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum"
               f"&timezone={b['tz'].replace('/', '%2F')}")
        out.write_text(get(url).text)
        log(f"weather_{code}", url, "CC BY 4.0 (Open-Meteo.com)")


def census() -> None:
    out = RAW / "census_counties_2025.csv"
    if out.exists():
        return
    url = "https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/counties/totals/co-est2025-alldata.csv"
    out.write_bytes(get(url).content)
    log("census", url, "Public domain (US Census Bureau)")


def disposable() -> None:
    out = RAW / "disposable_domains.txt"
    if out.exists():
        return
    url = ("https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/"
           "main/disposable_email_blocklist.conf")
    out.write_text(get(url).text, encoding="utf-8")
    log("disposable_domains", url, "CC0 1.0")


def sms_spam() -> None:
    out = RAW / "sms_spam.tsv"
    if out.exists():
        return
    url = "https://archive.ics.uci.edu/static/public/228/sms+spam+collection.zip"
    z = zipfile.ZipFile(io.BytesIO(get(url).content))
    out.write_bytes(z.read("SMSSpamCollection"))
    log("sms_spam", url, "CC BY 4.0 (UCI Machine Learning Repository)")


def ga4() -> None:
    """Stream the flattened GA4 sample and keep the session / page_view / funnel events only."""
    import duckdb
    out = RAW / "ga4" / "ga4_events_slim.parquet"
    if out.exists():
        return
    out.parent.mkdir(exist_ok=True)
    url = "https://huggingface.co/datasets/gizdevans/ga4-bq-flattened-data/resolve/main/full_flatten_data.csv"
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    con.execute(f"""
    COPY (
      SELECT event_date, event_name, CAST(event_timestamp AS BIGINT) AS event_timestamp,
             user_pseudo_id, ga_session_id, TRY_CAST(ga_session_number AS INTEGER) AS ga_session_number,
             ep_source, ep_medium, ep_campaign, traffic_source, traffic_medium, traffic_campaign,
             country, device_category, TRY_CAST(ecom_revenue_usd AS DOUBLE) AS ecom_revenue_usd, ecom_transaction_id
      FROM read_csv('{url}', header = true, all_varchar = true, parallel = false)
      WHERE event_name IN ('session_start', 'first_visit', 'page_view', 'add_to_cart', 'begin_checkout', 'purchase')
    ) TO '{out.as_posix()}' (FORMAT parquet, COMPRESSION zstd)
    """)
    log("ga4_sample", url, "Google public sample data; MIT (Hugging Face mirror)")


if __name__ == "__main__":
    if "--ga4" in sys.argv:
        ga4()
    else:
        weather(); census(); disposable(); sms_spam()
    print("done:", sorted(p.name for p in RAW.rglob("*") if p.is_file()))
