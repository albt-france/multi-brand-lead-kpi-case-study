"""Simulate 18 months of lead data for five FICTIONAL local-service brands (seed 42).

Everything written here is SIMULATED. Two inputs are real PUBLIC DATA:
  - daily weather per city (Open-Meteo archive) drives demand,
  - county population (US Census 2025) sizes each market.

Outputs (data/sim/), one file per source system, each in its own realistic format:
  crm_contacts.csv        GoHighLevel-style CRM export (UTC timestamps)
  google_ads_daily.csv    Google Ads campaign report (account time zone, click date)
  lsa_leads.csv           Local Services Ads lead report (charged / disputed / credited)
  meta_ads_daily.csv      Meta Ads report (leads as Meta counts them)
  ga4_events_daily.csv    GA4 generate_lead events (property time zone)
  manual_calls_sheet.csv  call log typed by office staff
  webhooks.jsonl          raw form webhook payloads (last 60 days)
  brands.csv              brand reference (city, county, population, time zone)
Hidden answer key (never published): data/_hidden_truth.csv (12 incidents) and
data/_hidden_truth_leads.csv (true channel / duplicate / spam / invalid per record).

People have no names: ids only, phones from the reserved fictional 555-0100..0199 range,
e-mails on example.com / example.net (spam uses public disposable domains).
"""
import json
import string
from datetime import timedelta
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW, SIM = ROOT / "data" / "raw", ROOT / "data" / "sim"
SIM.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(42)

START, END = pd.Timestamp("2025-05-01"), pd.Timestamp("2026-10-31")
DAYS = pd.date_range(START, END, freq="D")

# ---------------------------------------------------------------- brands
BRANDS = pd.DataFrame([
    # code, trade, city, tz, county fips, genuine leads/day, Google Ads budget, Meta budget, LSA price/lead, avg job $
    ("HVAC-PHX", "HVAC", "Phoenix, AZ", "America/Phoenix", "04013", 10.0, 330, 95, 62, 640),
    ("PLMB-DAL", "Plumbing", "Dallas, TX", "America/Chicago", "48113", 9.0, 270, 60, 52, 410),
    ("ROOF-TPA", "Roofing", "Tampa, FL", "America/New_York", "12057", 6.0, 240, 115, 84, 2300),
    ("ELEC-ATL", "Electrical", "Atlanta, GA", "America/New_York", "13121", 7.0, 190, 60, 44, 380),
    ("PEST-BNA", "Pest control", "Nashville, TN", "America/Chicago", "47037", 6.5, 150, 70, 34, 260),
], columns=["brand", "trade", "city", "tz", "fips", "base", "gads_budget", "meta_budget", "lsa_price", "job_value"])

census = pd.read_csv(RAW / "census_counties_2025.csv", encoding="latin-1", dtype={"STATE": str, "COUNTY": str})
census["fips"] = census.STATE.str.zfill(2) + census.COUNTY.str.zfill(3)
pop = census[census.SUMLEV == 50].set_index("fips")
BRANDS["county"] = BRANDS.fips.map(pop.CTYNAME + ", " + pop.STNAME)
BRANDS["population_2025"] = BRANDS.fips.map(pop.POPESTIMATE2025).astype(int)

# ---------------------------------------------------------------- weather -> demand
def load_weather(code: str) -> pd.DataFrame:
    d = json.loads((RAW / "weather" / f"{code}.json").read_text(encoding="latin-1"))["daily"]
    w = pd.DataFrame(d).rename(columns={"temperature_2m_max": "tmax", "temperature_2m_min": "tmin", "precipitation_sum": "precip"})
    w["date"] = pd.to_datetime(w.time)
    return w.drop(columns="time").set_index("date").reindex(DAYS).ffill()

WEATHER = {b: load_weather(b) for b in BRANDS.brand}

def demand_multiplier(code: str, w: pd.DataFrame) -> pd.Series:
    """How weather moves demand for each trade (simple, explainable formulas)."""
    if code == "HVAC-PHX":   # AC breakdowns rise steeply with heat
        m = np.exp(0.085 * (w.tmax - 35)).clip(0.45, 3.2)
    elif code == "PLMB-DAL":  # frozen / burst pipes the day of and after a hard freeze
        freeze = (w.tmin < -2).astype(float)
        m = 1 + 2.5 * freeze + 1.5 * freeze.shift(1, fill_value=0)
    elif code == "ROOF-TPA":  # storm damage: 3-day rain total
        m = 1 + (w.precip.rolling(3, min_periods=1).sum() * 0.035).clip(0, 2.2)
    elif code == "ELEC-ATL":  # storms cause outages and panel issues
        m = 1 + (w.precip * 0.02).clip(0, 0.8)
    else:                     # pests follow warm weather
        m = 0.55 + (w.tmax.clip(lower=8) - 8) * 0.035
    weekday = np.where(w.index.dayofweek >= 5, 0.72, 1.0)
    return pd.Series(np.asarray(m) * weekday, index=w.index)

# Incident 11 (false signal): the hottest 7-day stretch of summer 2026 in Phoenix, from real data.
phx = WEATHER["HVAC-PHX"].tmax
summer = phx["2026-06-01":"2026-09-15"].rolling(7).mean()
HEAT_END = summer.idxmax()
HEAT_START = HEAT_END - timedelta(days=6)

# ---------------------------------------------------------------- incident calendar
INC = {
    "spam_wave": ("ELEC-ATL", pd.Timestamp("2026-03-10"), pd.Timestamp("2026-03-18")),
    "utm_redirect": ("PLMB-DAL", pd.Timestamp("2026-02-09"), pd.Timestamp("2026-03-22")),
    "gclid_field": ("ALL", pd.Timestamp("2026-06-02"), pd.Timestamp("2026-07-14")),
    "meta_no_event_id": ("HVAC-PHX", START, pd.Timestamp("2026-06-30")),
    "channel_map_rewrite": ("ALL", pd.Timestamp("2026-04-01"), pd.Timestamp("2026-04-01")),
    "lsa_credits": ("ALL", START, END),
    "sheet_labels": ("ALL", START, END),
    "ga4_reload": ("ROOF-TPA", pd.Timestamp("2025-09-15"), pd.Timestamp("2026-01-31")),
    "heat_wave": ("HVAC-PHX", HEAT_START, HEAT_END),
    "meta_fixed": ("HVAC-PHX", pd.Timestamp("2026-07-01"), END),
}

CHANNEL_MIX = {  # genuine lead share by channel
    "HVAC-PHX": dict(google_ads=.31, lsa=.20, meta=.12, gbp=.12, seo=.12, direct=.07, referral=.06),
    "PLMB-DAL": dict(google_ads=.33, lsa=.22, meta=.06, gbp=.13, seo=.12, direct=.08, referral=.06),
    "ROOF-TPA": dict(google_ads=.27, lsa=.15, meta=.22, gbp=.10, seo=.10, direct=.06, referral=.10),
    "ELEC-ATL": dict(google_ads=.29, lsa=.21, meta=.08, gbp=.14, seo=.13, direct=.08, referral=.07),
    "PEST-BNA": dict(google_ads=.26, lsa=.18, meta=.12, gbp=.12, seo=.18, direct=.08, referral=.06),
}
SERVICE = {"HVAC-PHX": "ac-repair", "PLMB-DAL": "emergency-plumber", "ROOF-TPA": "roof-repair",
           "ELEC-ATL": "electrician", "PEST-BNA": "pest-control"}
MESSAGES = {
    "HVAC-PHX": ["AC not cooling", "AC blowing warm air", "Unit making loud noise", "Need a tune-up before summer",
                 "Thermostat not responding", "Water leaking from the indoor unit", "Quote for a new system"],
    "PLMB-DAL": ["Water heater leaking", "Kitchen sink clogged", "Burst pipe in garage", "Low water pressure",
                 "Toilet keeps running", "Need a quote for repiping", "Sewer smell in basement"],
    "ROOF-TPA": ["Leak after the storm", "Missing shingles", "Need a roof inspection", "Quote for a full replacement",
                 "Water stain on ceiling", "Insurance claim inspection", "Gutters pulling away"],
    "ELEC-ATL": ["Breaker keeps tripping", "Outlet not working", "Panel upgrade quote", "EV charger install",
                 "Lights flickering", "Need a generator hookup", "Burning smell from outlet"],
    "PEST-BNA": ["Ants in the kitchen", "Termite inspection", "Mice in the attic", "Quarterly service quote",
                 "Wasps nest near the door", "Roaches in the bathroom", "Mosquito treatment"],
}
SUFFIX = ["", " asap", ". Can someone come today?", ". Please call me.", ". Available after 5pm.", " - thanks", ""]
SPAM_TEXT = ["Boost your Google ranking today, cheap SEO packages", "We build websites for contractors, reply YES",
             "Get 500 leads per month guaranteed, call now", "Business loan approved, claim your funds",
             "Crypto investment opportunity limited time", "asdkjh qwe zxcmnb", "hello", "Buy backlinks high DA",
             "I can get you more 5 star reviews for cheap", "xqzt lorem vbn"]

# US area codes in service, from libphonenumber metadata (MIT); regenerate with scripts/area_codes.ts
VALID_NPA = json.loads((ROOT / "pipeline" / "us_area_codes_valid.json").read_text())
LOCAL_NPA = {"HVAC-PHX": [602, 480, 623, 520], "PLMB-DAL": [214, 469, 972, 817], "ROOF-TPA": [813, 727, 656],
             "ELEC-ATL": [404, 678, 770, 470], "PEST-BNA": [615, 629]}
DISPOSABLE = [d for d in (RAW / "disposable_domains.txt").read_text(encoding="utf-8").split() if d][:400]
B64 = string.ascii_letters + string.digits + "_-"


def rid(prefix: str, n: int) -> str:
    return prefix + "".join(rng.choice(list(B64), n))


def phone_pool(code: str, n: int) -> list:
    """Unique fictional numbers (NPA) 555-01XX for one brand; local area codes are drawn first."""
    pairs = [(a, x) for a in VALID_NPA for x in range(100, 200)]
    w = np.array([25.0 if a in LOCAL_NPA[code] else 1.0 for a, _ in pairs])
    idx = rng.choice(len(pairs), size=n, replace=False, p=w / w.sum())
    return [pairs[i] for i in idx]


def fmt_phone(npa: int, line: int, style: int) -> str:
    """The same number written five ways, as people really type it."""
    return [f"({npa}) 555-{line:04d}",
            f"{npa}-555-{line:04d}", f"+1{npa}555{line:04d}", f"{npa}.555.{line:04d}", f"{npa}555{line:04d}"][style]


# ---------------------------------------------------------------- genuine leads
HOUR_P = np.r_[[.004] * 6, [.03, .05, .07, .08, .08, .075, .07, .07, .07, .07, .065, .06, .055, .045, .03], [.016] * 3]
HOUR_P = HOUR_P / HOUR_P.sum()   # local hour of the lead: busy 7am-9pm, a few at night
rows = []
lead_n = 0
for b in BRANDS.itertuples():
    w = WEATHER[b.brand]
    mult = demand_multiplier(b.brand, w)
    expected = b.base * mult / mult.mean()               # keep each brand's average at its base volume
    if b.brand == "HVAC-PHX":
        # Incident 11 (real demand): after several days above ~44 C, AC units fail in cascade.
        # Demand during the real heat wave (and 2 days after) is ~1.8x what the daily formula gives.
        expected[HEAT_START:HEAT_END + timedelta(days=2)] *= 1.8
    counts = rng.poisson(expected.values)
    mix = CHANNEL_MIX[b.brand]
    pool = iter(phone_pool(b.brand, int(counts.sum() * 1.05) + 50))
    for day, n in zip(DAYS, counts):
        for _ in range(n):
            ch = rng.choice(list(mix), p=list(mix.values()))
            # local hour: busy 7am-9pm, a few at night
            hour = rng.choice(24, p=HOUR_P)
            local = day + timedelta(hours=int(hour), minutes=int(rng.integers(60)), seconds=int(rng.integers(60)))
            npa, line = next(pool)
            is_call = ch in ("lsa", "gbp") and rng.random() < .8 or ch in ("seo", "direct", "referral") and rng.random() < .3
            lead_n += 1
            rows.append(dict(brand=b.brand, local_ts=local, true_channel=ch, lead_type="call" if is_call else "form",
                             npa=npa, line=line, contact_key=lead_n))

leads = pd.DataFrame(rows)
leads["email_user"] = [rid("u", 7).lower() for _ in range(len(leads))]
leads["email_domain"] = rng.choice(["example.com", "example.net"], len(leads))
leads.loc[leads.lead_type == "call", "email_user"] = None

# ---------------------------------------------------------------- attribution fields
def attribution(r) -> dict:
    """What the website / integrations captured for a genuine lead (before incidents)."""
    svc = SERVICE[r.brand]
    out = dict(utm_source=None, utm_medium=None, utm_campaign=None, gclid=None, fbclid=None,
               landing_page=None, referrer=None, crm_attribution=None, click_lag_min=0.0)
    ch, call = r.true_channel, r.lead_type == "call"
    if ch == "google_ads":
        out.update(utm_source="google", utm_medium="cpc", utm_campaign=f"search-{svc}",
                   gclid=rid("Cj0KCQjw", 64), landing_page=f"/lp/{svc}", crm_attribution="Paid Search")
        if rng.random() < .03:      # consent refused / blocked: no click id kept
            out["gclid"] = None
    elif ch == "meta":
        if rng.random() < .3:       # Meta instant form (Lead Ads): arrives through the integration
            out.update(crm_attribution="Facebook Lead Ad", utm_source="facebook", utm_medium="lead_ad")
        else:
            out.update(utm_source="facebook", utm_medium="paid_social", utm_campaign=f"social-{svc}",
                       fbclid=rid("IwAR", 40), landing_page=f"/offer/{svc}", crm_attribution="Paid Social")
    elif ch == "lsa":
        out.update(crm_attribution="Google Local Services")
    elif ch == "gbp":
        out.update(crm_attribution="Google Business Profile" if call else "Organic Search",
                   utm_source=None if call else "google", utm_medium=None if call else "organic",
                   utm_campaign=None if call else "gbp-listing", landing_page=None if call else "/")
    elif ch == "seo":
        out.update(crm_attribution="Call" if call else "Organic Search", referrer=None if call else "https://www.google.com/",
                   landing_page=None if call else rng.choice(["/", f"/services/{svc}", f"/blog/{svc}-cost"]))
    elif ch == "direct":
        out.update(crm_attribution="Call" if call else "Direct traffic", landing_page=None if call else rng.choice(["/", "/contact"]))
    else:
        out.update(crm_attribution="Call" if call else "Referral",
                   referrer=None if call else rng.choice(["https://nextdoor.com/", "https://www.yelp.com/", "https://www.bbb.org/"]),
                   landing_page=None if call else "/")
    if ch in ("google_ads", "meta"):  # time between the ad click and the form: mostly minutes, sometimes days
        out["click_lag_min"] = float(rng.uniform(1, 25)) if rng.random() < .82 else float(rng.uniform(60 * 12, 60 * 24 * 6))
    return out

attr = pd.DataFrame([attribution(r) for r in leads.itertuples()])
leads = pd.concat([leads, attr], axis=1)

# Incident 3: landing-page redirect on PLMB-DAL drops the query string AND the referrer (JS redirect).
b3, s3, e3 = INC["utm_redirect"]
m3 = (leads.brand == b3) & leads.local_ts.between(s3, e3 + timedelta(days=1)) & (leads.true_channel == "google_ads")
leads.loc[m3, ["utm_source", "utm_medium", "utm_campaign", "gclid"]] = None
leads.loc[m3, "crm_attribution"] = "Direct traffic"
leads["inc_utm_redirect"] = m3

# Incident 4: a form update removed the hidden gclid field on the quote form (~28% of submissions), all brands.
_, s4, e4 = INC["gclid_field"]
quote_form = rng.random(len(leads)) < .28
m4 = leads.local_ts.between(s4, e4 + timedelta(days=1)) & (leads.true_channel == "google_ads") & quote_form & leads.gclid.notna()
leads.loc[m4, "gclid"] = None
leads["inc_gclid_missing"] = m4
leads["form_id"] = np.where(leads.lead_type == "call", None, np.where(quote_form, "quote_form", "contact_form"))

# Invalid (genuine people, bad data): area code typo or missing digits, ~1.2%
inv = (rng.random(len(leads)) < .012)
leads["is_invalid"] = inv
leads["phone_style"] = rng.choice(5, len(leads), p=[.45, .2, .1, .1, .15])
leads["phone_raw"] = [fmt_phone(r.npa, r.line, r.phone_style) for r in leads.itertuples()]
bad_npa = [a for a in range(200, 1000) if a not in VALID_NPA]
leads.loc[inv, "phone_raw"] = [rng.choice([f"({rng.choice(bad_npa)}) 555-{rng.integers(100, 200):04d}",
                                           f"555-{rng.integers(100, 200):04d}"]) for _ in range(inv.sum())]
leads["message"] = [None if t == "call" else rng.choice(MESSAGES[b]) + rng.choice(SUFFIX) for b, t in zip(leads.brand, leads.lead_type)]
leads["honeypot"] = None
leads["ip_hash"] = [rid("ip_", 10) for _ in range(len(leads))]
leads["is_spam"], leads["spam_kind"] = False, None
leads["dup_of"], leads["dup_type"] = None, None
# A few privacy-minded real customers use a throwaway inbox (they will become false positives)
fp = (leads.lead_type == "form") & (rng.random(len(leads)) < .004)
leads.loc[fp, "email_domain"] = rng.choice(DISPOSABLE, fp.sum())

# ---------------------------------------------------------------- duplicates (incident 1)
dups = []
used = set(zip(leads.npa, leads.line))
spare = iter([(a, x) for a in VALID_NPA for x in range(100, 200) if (a, x) not in used])   # numbers nobody else has
for r in leads.itertuples():
    u = rng.random()
    if r.lead_type == "form":
        kind = ("resubmit" if u < .08 else "form_then_call" if u < .135 else "phone_format" if u < .18
                else "other_contact" if u < .195 else None)
    else:
        kind = "repeat_call" if u < .05 else None
    if not kind:
        continue
    d = leads.loc[r.Index].copy()
    d["dup_of"], d["dup_type"] = r.Index, kind
    if kind == "resubmit":
        d["local_ts"] = r.local_ts + timedelta(seconds=int(rng.integers(15, 240)))
    elif kind == "form_then_call":
        d["local_ts"] = r.local_ts + timedelta(minutes=int(rng.integers(5, 60 * 36)))
        d["lead_type"], d["form_id"], d["email_user"], d["message"] = "call", None, None, None
        d[["utm_source", "utm_medium", "utm_campaign", "gclid", "fbclid", "landing_page", "referrer"]] = None
        d["crm_attribution"] = "Call"
        d["phone_style"] = 2
    elif kind == "phone_format":
        d["local_ts"] = r.local_ts + timedelta(minutes=int(rng.integers(60, 60 * 24 * 5)))
        d["phone_style"] = (r.phone_style + int(rng.integers(1, 5))) % 5
        if d.email_user and rng.random() < .5:
            d["email_user"] = d.email_user.upper()
        d["gclid"] = rid("Cj0KCQjw", 64) if d.gclid else None   # new click, new id
    elif kind == "other_contact":   # same person, but a spouse's phone and another inbox: no rule can link them
        d["local_ts"] = r.local_ts + timedelta(hours=int(rng.integers(2, 96)))
        d["npa"], d["line"] = next(spare)
        d["email_user"] = rid("u", 7).lower()
    else:
        d["local_ts"] = r.local_ts + timedelta(minutes=int(rng.integers(2, 60 * 48)))
    if not r.is_invalid:
        d["phone_raw"] = fmt_phone(int(d.npa), int(d.line), int(d.phone_style))
    dups.append(d)
leads = pd.concat([leads, pd.DataFrame(dups)], ignore_index=False)
leads["orig_index"] = leads.index
leads = leads.reset_index(drop=True)

# ---------------------------------------------------------------- spam (incident 2 + background)
def spam_row(brand: str, local_ts, wave: bool, burst_ip: str) -> dict:
    sig = rng.random(5)
    npa, line = int(rng.choice(VALID_NPA)), int(rng.integers(100, 200))
    phone = (rng.choice([f"+44 7700 900{rng.integers(0, 1000):03d}", f"+61 491 570 {rng.integers(100, 160)}"])
             if sig[0] < (.55 if wave else .35) else fmt_phone(npa, line, int(rng.integers(5))))
    domain = rng.choice(DISPOSABLE) if sig[1] < (.7 if wave else .5) else rng.choice(["example.com", "example.net"])
    via_ads = rng.random() < .2
    return dict(brand=brand, local_ts=local_ts, true_channel="google_ads" if via_ads else "direct", lead_type="form",
                email_user=rid("x", 8).lower(), email_domain=domain, phone_raw=phone,
                message=rng.choice(SPAM_TEXT) if sig[2] < .8 else rng.choice(MESSAGES[brand]),
                honeypot=("http://" + rid("", 8).lower() + ".example.org") if sig[3] < (.6 if wave else .4) else None,
                ip_hash=burst_ip, is_spam=True, spam_kind="wave" if wave else "background",
                utm_source="google" if via_ads else None, utm_medium="cpc" if via_ads else None,
                utm_campaign=f"search-{SERVICE[brand]}" if via_ads else None, gclid=rid("Cj0KCQjw", 64) if via_ads else None,
                landing_page=f"/lp/{SERVICE[brand]}" if via_ads else "/contact", crm_attribution="Paid Search" if via_ads else "Direct traffic",
                form_id="contact_form", click_lag_min=float(rng.uniform(0, 3)), is_invalid=False)

spam = []
for b in BRANDS.brand:  # background spam: ~2.5% of rows, sometimes in bursts from one address
    n_bg = int(len(leads[leads.brand == b]) * .025)
    for _ in range(n_bg // 2):
        t = START + timedelta(seconds=int(rng.integers(0, int((END - START).total_seconds()) + 86399)))
        ip = rid("ip_", 10)
        for k in range(int(rng.choice([1, 1, 1, 4]))):
            spam.append(spam_row(b, t + timedelta(seconds=int(40 * k + rng.integers(0, 30))), False, ip))
b2, s2, e2 = INC["spam_wave"]
for day in pd.date_range(s2, e2):
    for _ in range(int(rng.integers(14, 22))):            # bot bursts: 4 submissions in about 3 minutes
        t, ip = day + timedelta(minutes=int(rng.integers(0, 1440))), rid("ip_", 10)
        for k in range(4):
            spam.append(spam_row(b2, t + timedelta(seconds=int(45 * k + rng.integers(0, 20))), True, ip))
leads = pd.concat([leads, pd.DataFrame(spam)], ignore_index=True)
leads["is_spam"] = leads.is_spam.fillna(False).astype(bool)
leads["is_invalid"] = leads.is_invalid.fillna(False).astype(bool)
for c in ("inc_utm_redirect", "inc_gclid_missing"):
    leads[c] = leads[c].astype("boolean").fillna(False).astype(bool)

# ---------------------------------------------------------------- timestamps, ids, stages
tzmap = BRANDS.set_index("brand").tz
leads["created_at_utc"] = [ts.tz_localize(tzmap[b], ambiguous=False, nonexistent="shift_forward").tz_convert("UTC")
                           for ts, b in zip(leads.local_ts, leads.brand)]
leads["click_local_ts"] = leads.local_ts - pd.to_timedelta(leads.click_lag_min.fillna(0), unit="m")
leads = leads[leads.local_ts <= END + timedelta(days=1) - timedelta(seconds=1)]
leads = leads.sort_values("created_at_utc").reset_index(drop=True)
leads["lead_id"] = [f"lead_{i:06d}" for i in range(1, len(leads) + 1)]
id_of = dict(zip(leads.orig_index.where(leads.dup_type.isna()), leads.lead_id))
leads["dup_of_id"] = leads.dup_of.map(lambda x: id_of.get(x) if pd.notna(x) else None)
leads["email"] = np.where(leads.email_user.notna(), leads.email_user.fillna("") + "@" + leads.email_domain.fillna(""), None)
genuine = ~leads.is_spam & leads.dup_type.isna() & ~leads.is_invalid
p_book = np.where(genuine, .36, 0.0)
book = rng.random(len(leads)) < p_book
won = book & (rng.random(len(leads)) < .72)
leads["stage"] = np.select([leads.is_spam, won, book, genuine], ["Junk", "Won", "Booked", rng.choice(["Contacted", "Lost"], len(leads))], "New")
leads.loc[leads.dup_type.notna(), "stage"] = "New"
jv = leads.brand.map(BRANDS.set_index("brand").job_value)
leads["job_value_usd"] = np.where(won, (jv * rng.lognormal(0, .35, len(leads))).round(0), None)

# ---------------------------------------------------------------- CRM export (GoHighLevel-like)
crm = leads.rename(columns={"crm_attribution": "attribution_source"})[
    ["lead_id", "brand", "created_at_utc", "lead_type", "form_id", "attribution_source", "utm_source", "utm_medium",
     "utm_campaign", "gclid", "fbclid", "landing_page", "referrer", "phone_raw", "email", "message", "honeypot",
     "ip_hash", "stage", "job_value_usd"]].copy()
crm["created_at_utc"] = leads.created_at_utc.dt.strftime("%Y-%m-%dT%H:%M:%SZ")
crm.rename(columns={"phone_raw": "phone"}).to_csv(SIM / "crm_contacts.csv", index=False)

truth_leads = leads[["lead_id", "brand", "true_channel", "is_spam", "spam_kind", "is_invalid", "dup_type", "dup_of_id",
                     "inc_utm_redirect", "inc_gclid_missing"]].copy()
truth_leads["click_local_date"] = leads.click_local_ts.dt.date
truth_leads.to_csv(ROOT / "data" / "_hidden_truth_leads.csv", index=False)

# ---------------------------------------------------------------- Google Ads export (account tz, click date)
ga_rows = leads[(leads.true_channel == "google_ads") & (leads.lead_type == "form") & ~leads.inc_utm_redirect]
ga_rows = ga_rows[rng.random(len(ga_rows)) > .04]     # tag blocked by browser / consent: not counted by the platform
conv = ga_rows.groupby([ga_rows.brand, ga_rows.click_local_ts.dt.normalize()]).size()
conv_ct = ga_rows.groupby([ga_rows.brand, ga_rows.local_ts.dt.normalize()]).size()   # same, by conversion time
gads = []
for b in BRANDS.itertuples():
    mult = demand_multiplier(b.brand, WEATHER[b.brand])
    pace = (mult.rolling(28, min_periods=1).mean() / mult.mean()).clip(.55, 1.15)   # budget follows the season, capped
    for d in DAYS:
        cost = b.gads_budget * pace[d] * rng.uniform(.86, 1.0)
        cpc = rng.uniform(9, 16) if b.brand != "ROOF-TPA" else rng.uniform(14, 24)
        clicks = int(cost / cpc)
        n = int(conv.get((b.brand, d), 0))
        n_ct = int(conv_ct.get((b.brand, d), 0))
        extra = rng.binomial(n, .02) if n else 0    # conversions the tag counted that never reached the CRM
        gads.append(dict(date=d.date(), account=b.brand, campaign=f"search-{SERVICE[b.brand]}", impressions=int(clicks * rng.uniform(9, 14)),
                         clicks=clicks, cost=round(cost, 2), conversions=n + extra,
                         conversions_by_conv_time=n_ct + extra))
pd.DataFrame(gads).to_csv(SIM / "google_ads_daily.csv", index=False)

# ---------------------------------------------------------------- LSA export (incident 8: credits)
lsa = leads[(leads.true_channel == "lsa") & leads.dup_type.isna()].copy()
price = lsa.brand.map(BRANDS.set_index("brand").lsa_price)
lsa_out = pd.DataFrame({
    "lsa_lead_id": [f"lsa_{i:07d}" for i in range(len(lsa))],
    "account": lsa.brand.values,
    "lead_date": lsa.local_ts.dt.date.values,
    "lead_type": np.where(lsa.lead_type == "call", "PHONE_CALL", "MESSAGE"),
    "consumer_phone": lsa.phone_raw.map(lambda p: p).values,
    "charged": True,
    "charge_usd": (price * rng.uniform(.8, 1.2, len(lsa))).round(2).values,
})
lsa_out.loc[rng.random(len(lsa_out)) < .06, "charged"] = False          # some leads are not chargeable
lsa_out.loc[~lsa_out.charged, "charge_usd"] = 0.0
disp = lsa_out.charged & (rng.random(len(lsa_out)) < .13)
status = np.where(rng.random(len(lsa_out)) < .68, "APPROVED", np.where(rng.random(len(lsa_out)) < .5, "DENIED", "PENDING"))
lsa_out["dispute_status"] = np.where(disp, status, "NONE")
lsa_out["credit_usd"] = np.where(lsa_out.dispute_status == "APPROVED", lsa_out.charge_usd, 0.0)
lsa_out.to_csv(SIM / "lsa_leads.csv", index=False)

# ---------------------------------------------------------------- Meta export (incidents 5 and 12)
meta = leads[(leads.true_channel == "meta") & leads.dup_type.isna() & ~leads.is_spam]
meta_d = meta.groupby([meta.brand, meta.click_local_ts.dt.normalize(), meta.crm_attribution]).size()
mrows = []
for b in BRANDS.itertuples():
    for d in DAYS:
        lead_ads = int(meta_d.get((b.brand, d, "Facebook Lead Ad"), 0))
        site = int(meta_d.get((b.brand, d, "Paid Social"), 0))
        _, s5, e5 = INC["meta_no_event_id"]
        broken = b.brand == "HVAC-PHX" and s5 <= d <= e5
        # Pixel (browser) and CAPI (server) both send the lead. Without a shared event_id Meta cannot
        # deduplicate them, so a lead seen by both is counted twice.
        pixel = rng.binomial(site, .9) if site else 0
        capi = rng.binomial(site, .95) if site else 0
        site_counted = pixel + capi if broken else min(site, pixel + capi)
        modelled = rng.binomial(lead_ads + site_counted, .06) if (lead_ads + site_counted) else 0  # view-through etc.
        spend = b.meta_budget * rng.uniform(.85, 1.0)
        mrows.append(dict(date=d.date(), account=b.brand, campaign=f"social-{SERVICE[b.brand]}", amount_spent=round(spend, 2),
                          impressions=int(spend * rng.uniform(55, 80)), link_clicks=int(spend / rng.uniform(1.4, 2.4)),
                          leads=lead_ads + site_counted + modelled, pixel_leads=pixel, capi_leads=capi))
pd.DataFrame(mrows).to_csv(SIM / "meta_ads_daily.csv", index=False)

# ---------------------------------------------------------------- GA4 generate_lead (incident 10)
web = leads[(leads.lead_type == "form") & (leads.true_channel != "lsa") & ~((leads.true_channel == "meta") & (leads.crm_attribution == "Facebook Lead Ad"))]
web = web[rng.random(len(web)) < .91]                    # consent mode / blockers: GA4 sees ~91%
g = web.groupby([web.brand, web.local_ts.dt.normalize()]).size()
grow = []
_, s10, e10 = INC["ga4_reload"]
for b in BRANDS.brand:
    for d in DAYS:
        n = int(g.get((b, d), 0))
        reload = rng.binomial(n, .4) if (b == "ROOF-TPA" and s10 <= d <= e10 and n) else 0
        grow.append(dict(date=d.date(), property=b, event_name="generate_lead", event_count=n + reload))
pd.DataFrame(grow).to_csv(SIM / "ga4_events_daily.csv", index=False)

# ---------------------------------------------------------------- manual call sheet (incident 9)
calls = leads[(leads.lead_type == "call") & (leads.true_channel != "lsa") & ~leads.is_spam].copy()
calls = calls[rng.random(len(calls)) < .93]
clean = {"gbp": "GBP Call", "seo": "Organic", "direct": "Direct", "referral": "Referral", "google_ads": "Google Ads", "meta": "Facebook"}
variants = {"GBP Call": ["GBP call", "gbp", "Google Maps", "GBP  Call"], "Organic": ["organic ", "SEO", "Google search"],
            "Direct": ["direct", "Drive by", "Direct "], "Referral": ["referal", "Neighbor referral", "Referral "],
            "Google Ads": ["google ads", "Google-Ads", "Adwords"], "Facebook": ["FB", "facebook ads"]}
lab = calls.true_channel.map(clean).fillna("Direct")
typo = rng.random(len(calls)) < .04
lab = [rng.choice(variants[l]) if t else l for l, t in zip(lab, typo)]
sheet = pd.DataFrame({"call_date": calls.local_ts.dt.strftime("%m/%d/%Y"), "brand": calls.brand,
                      "caller_phone": calls.phone_raw, "source": lab,
                      "booked": np.where(calls.stage.isin(["Booked", "Won"]), "Y", "N"),
                      "entered_by": rng.choice(["S1", "S2", "S3", "S4"], len(calls))})
sheet.to_csv(SIM / "manual_calls_sheet.csv", index=False)

# ---------------------------------------------------------------- webhook payloads (last 60 days of forms)
recent = leads[(leads.lead_type == "form") & (leads.local_ts >= END - timedelta(days=59))]
with open(SIM / "webhooks.jsonl", "w", encoding="utf-8") as f:
    for r in recent.itertuples():
        qs = "&".join(f"{k}={v}" for k, v in [("utm_source", r.utm_source), ("utm_medium", r.utm_medium),
                                              ("utm_campaign", r.utm_campaign), ("gclid", r.gclid), ("fbclid", r.fbclid)] if isinstance(v, str))
        payload = {"type": "form_submission", "location_id": r.brand, "form_id": r.form_id,
                   "submitted_at": r.created_at_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
                   "contact": {"phone": r.phone_raw, "email": r.email},
                   "fields": {"message": r.message, "website": r.honeypot},
                   "page": {"url": f"https://www.{r.brand.lower()}.example{r.landing_page or '/'}" + (f"?{qs}" if qs else ""),
                            "referrer": r.referrer}, "event_id": rid("evt_", 16)}
        f.write(json.dumps(payload) + "\n")

# ---------------------------------------------------------------- brands + weather (for the dashboard)
BRANDS.drop(columns=["base", "gads_budget", "meta_budget", "lsa_price", "job_value"]).to_csv(SIM / "brands.csv", index=False)
pd.concat([WEATHER[b].assign(brand=b) for b in BRANDS.brand]).rename_axis("date").reset_index().to_csv(SIM / "weather_daily.csv", index=False)

# ---------------------------------------------------------------- hidden answer key: the 12 incidents
def n(mask) -> int:
    return int(mask.sum())

g4 = leads.true_channel.eq("google_ads") & leads.lead_type.eq("form") & ~leads.is_spam
truth = pd.DataFrame([
    (1, "Duplicate leads", "ALL", START, END, f"{n(leads.dup_type.notna())} duplicate rows ({leads.dup_type.notna().mean():.1%})", "Same normalized phone or e-mail within days"),
    (2, "Spam wave", b2, s2, e2, f"{n(leads.spam_kind.eq('wave'))} spam rows in 9 days", "Disposable domains, honeypot, non-US numbers, bursts"),
    (3, "UTM lost after redirect", b3, s3, e3, f"{n(leads.inc_utm_redirect)} paid-search leads labelled Direct", "Direct up, Google Ads down; /lp/ landing pages"),
    (4, "GCLID missing after form update", "ALL", s4, e4, f"{n(leads.inc_gclid_missing)} Google Ads leads without gclid", "gclid coverage drops to ~70%"),
    (5, "Pixel + CAPI without shared event_id", "HVAC-PHX", INC["meta_no_event_id"][1], INC["meta_no_event_id"][2], "Meta reports ~1.7x CRM", "Meta/CRM ratio far above 1"),
    (6, "Time zones (UTC vs account time)", "ALL", START, END, "Daily gaps, month-end leakage", "Evening leads land on the next UTC day"),
    (7, "History rewritten by channel-map update", "ALL", INC["channel_map_rewrite"][1], INC["channel_map_rewrite"][2], "Closed-month LSA leads moved to Google Ads", "Closed month KPI changes after a mapping edit"),
    (8, "LSA spend ignores credits", "ALL", START, END, f"${lsa_out.credit_usd.sum():,.0f} credited", "Gross LSA cost above net"),
    (9, "Manual sheet label variants", "ALL", START, END, f"{n(pd.Series(typo))} rows ({typo.mean():.1%})", "Non-standard source labels"),
    (10, "GA4 double-counts on thank-you reload", "ROOF-TPA", s10, e10, "GA4/CRM ~1.4x", "GA4 web leads above CRM"),
    (11, "FALSE SIGNAL: real heat wave", "HVAC-PHX", HEAT_START, HEAT_END, f"Peak 7-day mean max {summer.max():.1f} C", "Lead spike, CPL down, quality unchanged: NOT a data issue"),
    (12, "Fix verified: event_id shared", "HVAC-PHX", INC["meta_fixed"][1], END, "Meta/CRM back to ~1.05", "Ratio after fix"),
], columns=["incident", "title", "brand", "start", "end", "magnitude", "expected_signature"])
truth.to_csv(ROOT / "data" / "_hidden_truth.csv", index=False)

print(f"rows={len(leads)} genuine={n(genuine)} dups={n(leads.dup_type.notna())} spam={n(leads.is_spam)} invalid={n(leads.is_invalid)}")
print("heat wave:", HEAT_START.date(), "->", HEAT_END.date(), "| files:", sorted(p.name for p in SIM.iterdir()))
