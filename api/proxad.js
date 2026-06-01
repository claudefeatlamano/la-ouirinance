// Proxy serverless Vercel vers l'API Proxad (vad.proxad.net), meme origine que le
// dashboard -> zero CORS. Remplace l'ancien worker Cloudflare.
// Routage : vercel.json reecrit /api/proxad/<path> -> /api/proxad?path=<path>.
// Ex: /api/proxad/v1/user -> relaye vers https://vad.proxad.net/v1/server.pl/v1/user
const PROXAD = "https://vad.proxad.net/v1/server.pl";

export default async function handler(req, res) {
  const path = (req.query.path || "").toString();
  const target = PROXAD + "/" + path;

  const headers = { "Content-Type": "application/json" };
  if (req.headers.authorization) headers["Authorization"] = req.headers.authorization;

  const init = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD" && req.body !== undefined) {
    init.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  }

  try {
    const upstream = await fetch(target, init);
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json");
    res.send(text);
  } catch (e) {
    res.status(502).json({ error: "proxy_failed", message: String(e && e.message ? e.message : e) });
  }
}
