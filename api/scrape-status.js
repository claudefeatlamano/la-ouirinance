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

function toRun(run) {
  return {
    id: run.id,
    status: run.status,
    conclusion: run.conclusion,
    event: run.event,
    branch: run.head_branch,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    url: run.html_url,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  var config = getConfig();
  if (!config.owner || !config.repo) return res.status(500).json({ error: "invalid_repository" });
  if (!config.token) return res.status(500).json({ error: "missing_github_dispatch_token" });

  var since = req.query.since ? new Date(req.query.since.toString()).getTime() : 0;
  var minCreatedAt = since ? since - 120000 : 0;
  var url = "https://api.github.com/repos/" + config.owner + "/" + config.repo + "/actions/workflows/" + encodeURIComponent(config.workflow) + "/runs?branch=" + encodeURIComponent(config.ref) + "&event=workflow_dispatch&per_page=10";

  try {
    var upstream = await fetch(url, {
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": "Bearer " + config.token,
        "User-Agent": "la-ouirinance-dashboard",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!upstream.ok) {
      var text = await upstream.text();
      return res.status(upstream.status).json({ error: "github_status_failed", status: upstream.status, message: text.slice(0, 500) });
    }

    var data = await upstream.json();
    var runs = Array.isArray(data.workflow_runs) ? data.workflow_runs : [];
    var run = runs.find(function(item) {
      return !minCreatedAt || new Date(item.created_at).getTime() >= minCreatedAt;
    }) || (since ? null : runs[0] || null);

    return res.status(200).json({ ok: true, run: run ? toRun(run) : null });
  } catch (e) {
    return res.status(502).json({ error: "github_status_unreachable", message: String(e && e.message ? e.message : e) });
  }
}
