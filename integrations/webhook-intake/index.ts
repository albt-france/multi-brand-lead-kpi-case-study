// Supabase Edge Function entry point (Deno). Deploy with: supabase functions deploy webhook-intake
// NOT deployed in this case study: it runs against fixtures (see intake.test.ts) and is ready for real credentials.
//
// Flow: verify shared secret -> processWebhook() -> insert into raw.webhook_events
// ON CONFLICT (dedup_key) DO NOTHING, so a retried delivery is stored once (idempotent).
import { createClient } from "npm:@supabase/supabase-js@2";
import { processWebhook } from "./intake.ts";

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void };

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { db: { schema: "raw" } });
let disposable: Set<string> | null = null;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SHARED_SECRET")) return new Response("unauthorized", { status: 401 });

  let payload: unknown;
  try { payload = await req.json(); } catch { return Response.json({ errors: ["invalid JSON"] }, { status: 400 }); }

  if (!disposable) {   // cached for the life of the function instance
    const { data } = await supabase.from("disposable_domains").select("domain");
    disposable = new Set((data ?? []).map((r: { domain: string }) => r.domain));
  }
  const res = await processWebhook(payload, disposable);
  if (!res.ok) return Response.json({ errors: res.errors }, { status: 400 });

  const { error } = await supabase.from("webhook_events")
    .upsert({ source: "form", dedup_key: res.dedupKey, payload: { raw: payload, normalized: res.row, flags: res.flags } },
            { onConflict: "dedup_key", ignoreDuplicates: true });
  if (error) return Response.json({ errors: [error.message] }, { status: 500 });
  // 200 even for a duplicate: the sender must stop retrying.
  return Response.json({ stored: true, dedup_key: res.dedupKey, flags: res.flags });
});
