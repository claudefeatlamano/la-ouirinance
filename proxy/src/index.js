var PROXAD = "https://vad.proxad.net/v1/server.pl";
var ALLOWED_ORIGINS = [
  "https://la-ouirinance.vercel.app",
  "https://claudefeatlamano.github.io",
  "http://localhost:5173",
  "http://localhost:4173"
];

function getAllowedOrigin(request) {
  var origin = request.headers.get("Origin") || "";
  if (ALLOWED_ORIGINS.indexOf(origin) >= 0) return origin;
  // Autorise tous les deploiements Vercel du projet (production + previews)
  if (/^https:\/\/la-ouirinance[a-z0-9-]*\.vercel\.app$/.test(origin)) return origin;
  return ALLOWED_ORIGINS[0];
}

export default {
  async fetch(request) {
    var origin = getAllowedOrigin(request);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    var url = new URL(request.url);
    var target = PROXAD + url.pathname;
    var opts = {
      method: request.method,
      headers: {
        "Authorization": request.headers.get("Authorization") || "",
        "Content-Type": "application/json"
      }
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      opts.body = await request.text();
    }

    var resp = await fetch(target, opts);
    var body = await resp.text();

    return new Response(body, {
      status: resp.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": origin
      }
    });
  }
};
