"""pytest: checks on the Python pipeline outputs (run after fetch_public.py and simulate.py).

Privacy rules are tested, not assumed: no names, fictional phone range only, reserved e-mail domains only.
"""
import json
import re
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
SIM = ROOT / "data" / "sim"
pytestmark = pytest.mark.skipif(not (SIM / "crm_contacts.csv").exists(), reason="run pipeline/simulate.py first")


@pytest.fixture(scope="module")
def crm():
    return pd.read_csv(SIM / "crm_contacts.csv", dtype=str)


def test_volume_and_period(crm):
    assert 20_000 <= len(crm) <= 30_000
    d = pd.to_datetime(crm.created_at_utc)
    assert d.min() >= pd.Timestamp("2025-05-01", tz="UTC") and d.max() <= pd.Timestamp("2026-11-01 08:00", tz="UTC")
    assert set(crm.brand) == {"HVAC-PHX", "PLMB-DAL", "ROOF-TPA", "ELEC-ATL", "PEST-BNA"}


def test_ids_only_no_names(crm):
    assert crm.lead_id.str.fullmatch(r"lead_\d{6}").all()
    assert crm.lead_id.is_unique
    assert not any("name" in c.lower() for c in crm.columns)


def test_phones_are_fictional(crm):
    """US numbers use the reserved 555-0100..0199 lines; foreign spam numbers use reserved drama ranges."""
    raw = crm.phone.dropna()
    is_foreign = raw.str.startswith(("+44", "+61"))
    digits = raw.str.replace(r"\D", "", regex=True)
    assert digits[~is_foreign].str.contains(r"55501\d\d$").all()
    foreign = digits[is_foreign]
    assert foreign.str.match(r"^(447700900\d{3}|61491570\d{3})$").all()


def test_emails_on_reserved_or_disposable_domains(crm):
    disposable = set((ROOT / "data" / "raw" / "disposable_domains.txt").read_text(encoding="utf-8").split())
    domains = crm.email.dropna().str.split("@").str[1].str.lower()
    allowed = domains.isin({"example.com", "example.net"}) | domains.isin(disposable)
    assert allowed.all()


def test_platform_exports_cover_every_day():
    for f in ["google_ads_daily.csv", "meta_ads_daily.csv", "ga4_events_daily.csv"]:
        df = pd.read_csv(SIM / f)
        assert len(df) == 5 * 549, f


def test_weather_is_real_public_data():
    src = json.loads((ROOT / "data" / "raw" / "SOURCES.json").read_text())
    assert all(k in src for k in ["weather_HVAC-PHX", "census", "disposable_domains", "sms_spam"])
    w = pd.read_csv(SIM / "weather_daily.csv")
    assert w.tmax.between(-30, 55).all()


def test_spam_model_evaluated_on_held_out_set():
    ev = json.loads((ROOT / "data" / "derived" / "spam_model_eval.json").read_text())
    assert ev["n_test"] == 1115 and ev["precision"] > 0.9 and ev["recall"] > 0.85
