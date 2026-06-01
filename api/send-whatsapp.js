export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  var base = process.env.BOT_BASE_URL;
  var token = process.env.PUSH_TOKEN;
  if (!base || !token) {
    res.status(500).json({ error: "missing_bot_config", detail: "BOT_BASE_URL et/ou PUSH_TOKEN manquants côté Vercel" });
    return;
  }
  var body = req.body || {};
  var to = String(body.to || "");
  var message = String(body.message || "");
  if (!to || !message) {
    res.status(400).json({ error: "missing_to_or_message" });
    return;
  }
  try {
    var url = base.replace(/\/+$/, "") + "/v1/push";
    var r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-push-token": token },
      body: JSON.stringify({ to: to, message: message }),
      signal: AbortSignal.timeout(15000),
    });
    var text = await r.text();
    if (!r.ok) {
      res.status(502).json({ error: "bot_error", status: r.status, detail: text });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "send_failed", detail: String(e) });
  }
}
