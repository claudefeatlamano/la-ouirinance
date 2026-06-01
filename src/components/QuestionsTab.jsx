import React, { useState } from "react";

function priorityRank(e) {
  // confiance basse + nouveau = priorité max
  if (e.status === "nouveau" && e.confidence === "low") return 0;
  if (e.status === "nouveau") return 1;
  return 2;
}

function sortFeedback(list) {
  return [...list].sort(function (a, b) {
    var pa = priorityRank(a), pb = priorityRank(b);
    if (pa !== pb) return pa - pb;
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });
}

export function QuestionsTab(props) {
  var feedback = props.feedback || [];
  // updateFeedbackEntry(id, patch) et addCalibrated(ref) re-lisent la dernière
  // version Firestore avant d'écrire (le bot écrit en continu dans le même doc :
  // un overwrite depuis l'état React périmé effacerait ses captures récentes).
  var updateFeedbackEntry = props.updateFeedbackEntry;
  var addCalibrated = props.addCalibrated;

  var [drafts, setDrafts] = useState({});
  var [busy, setBusy] = useState({});

  var rows = sortFeedback(feedback);

  function setDraft(id, val) {
    setDrafts(function (d) { var n = Object.assign({}, d); n[id] = val; return n; });
  }

  async function markGood(entry) {
    if (busy[entry.id]) return;
    setBusy(function (b) { var n = Object.assign({}, b); n[entry.id] = true; return n; });
    try {
      await updateFeedbackEntry(entry.id, { status: "ok_tel_quel", updatedAt: new Date().toISOString() });
    } finally {
      setBusy(function (b) { var n = Object.assign({}, b); n[entry.id] = false; return n; });
    }
  }

  async function validate(entry) {
    var raw = (drafts[entry.id] || "").trim();
    if (!raw) return;
    setBusy(function (b) { var n = Object.assign({}, b); n[entry.id] = true; return n; });
    try {
      var resp = await fetch("/api/distill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: entry.question, idealAnswerRaw: raw, context: "Commercial: " + entry.commercial + (entry.formateur ? ", formateur: " + entry.formateur : "") }),
      });
      var distilled = await resp.json();
      if (!resp.ok) { alert("Distillation échouée : " + (distilled.error || resp.status)); return; }

      var refId = String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8);
      var newRef = {
        id: refId,
        createdAt: new Date().toISOString(),
        question: entry.question,
        principle: distilled.principle || "",
        formulation: distilled.formulation || "",
        tags: distilled.tags || [],
      };
      await addCalibrated(newRef);
      await updateFeedbackEntry(entry.id, { status: "repondu", idealAnswerRaw: raw, calibratedRefId: refId, updatedAt: new Date().toISOString() });
    } catch (e) {
      alert("Erreur : " + String(e));
    } finally {
      setBusy(function (b) { var n = Object.assign({}, b); n[entry.id] = false; return n; });
    }
  }

  return (
    <div style={{ padding: "16px 24px" }}>
      <h2 style={{ marginBottom: 12 }}>Questions des commerciaux ({rows.length})</h2>
      {rows.length === 0 ? <p style={{ opacity: 0.6 }}>Aucune question capturée pour l'instant.</p> : null}
      {rows.map(function (e) {
        var status = e.status;
        var badge = status === "nouveau" ? (e.confidence === "low" ? "⚠️ à revoir" : "nouveau") : (status === "repondu" ? "✅ répondu" : "👍 ok");
        return (
          <div key={e.id} style={{ border: "1px solid rgba(76,87,96,0.18)", borderRadius: 10, padding: 14, marginBottom: 12, background: "rgba(255,253,247,0.6)" }}>
            <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 6 }}>
              {e.date} · {e.commercial}{e.formateur ? " · formateur " + e.formateur : ""} · {badge}
            </div>
            <div style={{ marginBottom: 6 }}><b>Q :</b> {e.question}</div>
            <div style={{ marginBottom: 10, opacity: 0.8 }}><b>Bot :</b> {e.botReply}</div>
            {status === "nouveau" ? (
              <div>
                <textarea
                  value={drafts[e.id] || ""}
                  onChange={function (ev) { setDraft(e.id, ev.target.value); }}
                  placeholder="Réponse idéale (en clair, je m'occupe de la distiller)"
                  style={{ width: "100%", minHeight: 70, padding: 8, borderRadius: 8, border: "1px solid rgba(76,87,96,0.25)" }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button disabled={busy[e.id]} onClick={function () { validate(e); }} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#2e7d32", color: "#fff", cursor: "pointer" }}>
                    {busy[e.id] ? "Distillation…" : "Valider"}
                  </button>
                  <button onClick={function () { markGood(e); }} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(76,87,96,0.3)", background: "transparent", cursor: "pointer" }}>
                    Le bot était bon
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, opacity: 0.7 }}>{e.idealAnswerRaw ? "Réponse idéale enregistrée." : "Marqué OK."}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
