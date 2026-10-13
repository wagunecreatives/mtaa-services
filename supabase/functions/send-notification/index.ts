import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-notification-worker-secret" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST" || req.headers.get("x-notification-worker-secret") !== Deno.env.get("NOTIFICATION_WORKER_SECRET")) {
    return new Response("Unauthorized", { status: 401, headers: cors });
  }
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return new Response("Worker configuration missing", { status: 500, headers: cors });
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  let outboxId: string | undefined;
  try {
    const payload = await req.json();
    outboxId = payload?.record?.id;
    if (typeof outboxId !== "string") return new Response("Missing outbox id", { status: 400, headers: cors });
    const { data: claimed, error: claimError } = await supabase.rpc("claim_notification_outbox", { p_outbox_id: outboxId });
    if (claimError) throw claimError;
    const item = claimed?.[0];
    if (!item) return Response.json({ ok: true, skipped: true }, { headers: cors });
    const { data: notice, error: noticeError } = await supabase.from("notifications").select("id,recipient_id,event_type,title,body,data").eq("id", item.notification_id).single();
    if (noticeError) throw noticeError;
    const [{ data: preference }, { data: tokens }] = await Promise.all([
      supabase.from("notification_preferences").select("push_enabled,match_alerts_enabled").eq("user_id", notice.recipient_id).maybeSingle(),
      supabase.from("device_push_tokens").select("id,expo_push_token").eq("user_id", notice.recipient_id).eq("is_active", true),
    ]);
    const allowed = (preference?.push_enabled ?? true) && (!['provider_match', 'new_request'].includes(notice.event_type) || (preference?.match_alerts_enabled ?? true));
    if (!allowed || !tokens?.length) {
      await supabase.from("notification_outbox").update({ status: "sent", delivered_at: new Date().toISOString() }).eq("id", outboxId);
      return Response.json({ ok: true, skipped: true }, { headers: cors });
    }
    const messages = tokens.map((token) => ({ to: token.expo_push_token, sound: "default", title: notice.title, body: notice.body,
      data: { screen: notice.data?.screen, requestId: notice.data?.requestId, notificationId: notice.id }, channelId: "default", priority: "high" }));
    const response = await fetch("https://exp.host/--/api/v2/push/send", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(messages) });
    const result = await response.json();
    if (!response.ok) throw new Error(`Expo push returned ${response.status}`);
    const tickets = result?.data ?? [];
    for (let i = 0; i < tickets.length; i++) {
      if (tickets[i]?.details?.error === "DeviceNotRegistered") await supabase.from("device_push_tokens").update({ is_active: false }).eq("id", tokens[i].id);
    }
    await supabase.from("notification_outbox").update({ status: "sent", delivered_at: new Date().toISOString(), last_error: null }).eq("id", outboxId);
    return Response.json({ ok: true, sent: tickets.length }, { headers: cors });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Notification delivery failed";
    // Do not include payload/customer data in logs or responses.
    console.error("Notification worker error", message);
    if (outboxId) {
      const url = Deno.env.get("SUPABASE_URL");
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (url && key) await createClient(url, key, { auth: { persistSession: false } }).from("notification_outbox").update({ status: "failed", last_error: "Delivery attempt failed" }).eq("id", outboxId);
    }
    return Response.json({ ok: false, error: "Notification delivery failed" }, { status: 500, headers: cors });
  }
});
