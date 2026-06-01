const DEFAULT_REPOSITORY = "claudefeatlamano/la-ouirinance";
const DEFAULT_WORKFLOW = "scrape.yml";
const DEFAULT_REF = "main";

function getConfig() {
  var repository = process.env.GITHUB_DISPATCH_REPOSITORY || DEFAULT_REPOSITORY;
  var parts = repository.split("/");
  return {
    owner: parts[0],
    repo: parts[1],
    workflow: process.env.GITHUB_DISPATCH_WORKFLOW || DEFAULT_WORKFLOW,
    ref: process.env.GITHUB_DISPATCH_REF || DEFAULT_REF,
    token: process.env.GITHUB_DISPATCH_TOKEN || "",
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  var config = getConfig();
  if (!config.owner || !config.repo) {
    return res.status(500).json({ error: "invalid_repository" });
  }
  if (!config.token) {
    return res.status(500).json({ error: "missing_github_dispatch_token" });
  }

  var url = "https://api.github.com/repos/" + config.owner + "/" + config.repo + "/actions/workflows/" + encodeURIComponent(config.workflow) + "/dispatches";

  try {
    var upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": "Bearer " + config.token,
        "Content-Type": "application/json",
        "User-Agent": "la-ouirinance-dashboard",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref: config.ref }),
    });

    if (upstream.status === 204) {
      return res.status(202).json({ ok: true, workflow: config.workflow, ref: config.ref });
    }

    var body = await upstream.text();
    return res.status(upstream.status).json({
      error: "github_dispatch_failed",
      status: upstream.status,
      message: body.slice(0, 500),
    });
  } catch (e) {
    return res.status(502).json({ error: "github_dispatch_unreachable", message: String(e && e.message ? e.message : e) });
  }
}
