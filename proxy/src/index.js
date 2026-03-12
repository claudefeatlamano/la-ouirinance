var PROXAD = "https://vad.proxad.net/v1/server.pl";
var ALLOWED_ORIGIN = "https://claudefeatlamano.github.io";

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
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
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN
      }
    });
  }
};
