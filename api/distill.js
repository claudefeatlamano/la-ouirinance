export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  var key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(500).json({ error: "missing_anthropic_key" });
    return;
  }
  var body = req.body || {};
  var question = String(body.question || "");
  var idealAnswerRaw = String(body.idealAnswerRaw || "");
  var context = String(body.context || "");
  if (!idealAnswerRaw.trim()) {
    res.status(400).json({ error: "missing_ideal_answer" });
    return;
  }

  var system = [
    "Tu es l'assistant de calibrage d'un bot de coaching commercial (porte-à-porte fibre).",
    "Le manager te donne une SITUATION (question d'un commercial) et SA réponse idéale, parfois en notes brutes.",
    "Tu dois la COMPRENDRE et la distiller, pas la recopier.",
    "Réponds UNIQUEMENT en JSON valide, sans texte autour, avec exactement ces clés :",
    '{"principle": "...", "formulation": "...", "tags": ["...", "..."]}',
    "- principle : le principe de coaching en une phrase claire (le POURQUOI/QUOI).",
    "- formulation : la bonne manière de le dire au commercial, concise, ton terrain (tutoiement).",
    "- tags : 2 à 4 mots-clés courts en minuscules (thème, objection, étape) pour la recherche.",
  ].join("\n");

  var userContent =
    "SITUATION (question du commercial) :\n" + question + "\n\n" +
    (context ? "CONTEXTE :\n" + context + "\n\n" : "") +
    "RÉPONSE IDÉALE DU MANAGER (à distiller) :\n" + idealAnswerRaw;

  try {
    var resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        system: system,
        messages: [{ role: "user", content: userContent }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) {
      var errText = await resp.text();
      res.status(502).json({ error: "anthropic_error", detail: errText });
      return;
    }
    var data = await resp.json();
    var text = (data.content && data.content[0] && data.content[0].text) || "";
    var jsonStart = text.indexOf("{");
    var jsonEnd = text.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd <= jsonStart) {
      res.status(502).json({ error: "distill_bad_json", detail: text.slice(0, 300) });
      return;
    }
    var parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    res.status(200).json({
      principle: String(parsed.principle || ""),
      formulation: String(parsed.formulation || ""),
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
    });
  } catch (e) {
    res.status(500).json({ error: "distill_failed", detail: String(e) });
  }
}
