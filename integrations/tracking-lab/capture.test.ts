// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { readAttribution, saveAttribution, loadAttribution, fillHiddenFields, newEventId, trackLeadOnce, capiPayload, TTL_DAYS } from "./capture.js";

const AD = "https://www.hvac-phx.example/lp/ac-repair?utm_source=google&utm_medium=cpc&utm_campaign=search&gclid=Cj0TEST";
const T0 = Date.UTC(2026, 9, 1);

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); document.body.innerHTML = ""; });

describe("capture and storage", () => {
  it("reads UTM and click ids from the landing URL", () => {
    expect(readAttribution(AD, T0)).toMatchObject({ utm_source: "google", utm_medium: "cpc", gclid: "Cj0TEST", landing_page: "/lp/ac-repair" });
    expect(readAttribution("https://www.hvac-phx.example/contact")).toBeNull();
  });
  it("keeps the first touch and updates the last touch", () => {
    saveAttribution(localStorage, readAttribution(AD, T0), T0);
    const rec = saveAttribution(localStorage, readAttribution("https://x.example/offer/a?utm_source=facebook&fbclid=IwAR1", T0 + 864e5), T0 + 864e5);
    expect(rec.first.gclid).toBe("Cj0TEST");
    expect(rec.last.fbclid).toBe("IwAR1");
  });
  it("forgets attribution after 90 days", () => {
    saveAttribution(localStorage, readAttribution(AD, T0), T0);
    expect(loadAttribution(localStorage, T0 + (TTL_DAYS - 1) * 864e5)).not.toBeNull();
    expect(loadAttribution(localStorage, T0 + (TTL_DAYS + 1) * 864e5)).toBeNull();
  });
  it("a later visit without parameters keeps the stored click (survives a redirect)", () => {
    saveAttribution(localStorage, readAttribution(AD, T0), T0);
    const rec = saveAttribution(localStorage, readAttribution("https://www.hvac-phx.example/contact", T0 + 1000), T0 + 1000);
    expect(rec.last.gclid).toBe("Cj0TEST");
  });
});

describe("form and conversion", () => {
  it("fills hidden fields, creating them when missing", () => {
    document.body.innerHTML = `<form><input name="phone"><input type="hidden" name="gclid"></form>`;
    const form = document.querySelector("form")!;
    const n = fillHiddenFields(form, saveAttribution(localStorage, readAttribution(AD, T0), T0));
    expect(n).toBeGreaterThanOrEqual(5);
    expect((form.querySelector('input[name="gclid"]') as HTMLInputElement).value).toBe("Cj0TEST");
    expect((form.querySelector('input[name="utm_medium"]') as HTMLInputElement).value).toBe("cpc");
  });
  it("counts generate_lead once even if the thank-you page reloads", () => {
    const dl: object[] = [];
    const id = newEventId();
    expect(trackLeadOnce(dl, sessionStorage, "sub_1", id)).toBe(true);
    expect(trackLeadOnce(dl, sessionStorage, "sub_1", id)).toBe(false);
    expect(dl).toHaveLength(1);
  });
  it("shares the same event_id between the browser event and the CAPI payload", () => {
    const dl: { event_id?: string }[] = [];
    const id = newEventId();
    trackLeadOnce(dl, sessionStorage, "sub_2", id);
    expect(capiPayload(id, AD).data[0].event_id).toBe(dl[0].event_id);
    expect(capiPayload(id, AD).data[0].event_name).toBe("Lead");
  });
});
