import React, { useState } from "react";

var ONBOARDING_BASE = "https://la-ouirinance-onboarding-preview.vercel.app/";

// Normalise un numéro FR en format international sans + (pour WhatsApp / le lien).
function normalizeNumber(raw) {
  var d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.indexOf("0") === 0) return "33" + d.slice(1);
  return d;
}

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

function buildLink(num, name) {
  return ONBOARDING_BASE + "?num=" + encodeURIComponent(num) + "&name=" + encodeURIComponent(name || "");
}

function buildMessage(name, link) {
  return "Salut " + firstName(name) + " 👋\nJe suis ta nouvelle assistante personnelle pour l'agence. Avant de commencer, faisons un point ensemble 👇\n" + link;
}

export function CampaignTab(props) {
  var team = (props.team || []).filter(function (m) { return m.active !== false; });
  var rows = team.map(function (m) {
    return { id: m.id, name: m.name, number: normalizeNumber(m.whatsappNumber) };
  });

  var [selected, setSelected] = useState({});
  var [status, setStatus] = useState({}); // id -> "sending" | "sent" | "error:..."
  var [bulkRunning, setBulkRunning] = useState(false);

  function toggle(id) {
    setSelected(function (s) { var n = Object.assign({}, s); n[id] = !n[id]; return n; });
  }
  function selectAll(on) {
    var n = {};
    rows.forEach(function (r) { if (r.number) n[r.id] = on; });
    setSelected(n);
  }

  async function sendOne(r) {
    if (!r.number) return { ok: false, err: "pas de numéro" };
    setStatus(function (s) { var n = Object.assign({}, s); n[r.id] = "sending"; return n; });
    try {
      var link = buildLink(r.number, r.name);
      var message = buildMessage(r.name, link);
      var resp = await fetch("/api/send-whatsapp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: r.number, message: message }),
      });
      var data = await resp.json();
      if (!resp.ok) {
        setStatus(function (s) { var n = Object.assign({}, s); n[r.id] = "error:" + (data.error || resp.status); return n; });
        return { ok: false, err: data.error || resp.status };
      }
      setStatus(function (s) { var n = Object.assign({}, s); n[r.id] = "sent"; return n; });
      return { ok: true };
    } catch (e) {
      setStatus(function (s) { var n = Object.assign({}, s); n[r.id] = "error:" + String(e); return n; });
      return { ok: false, err: String(e) };
    }
  }

  async function sendSelected() {
    var targets = rows.filter(function (r) { return selected[r.id] && r.number; });
    if (targets.length === 0) { alert("Sélectionne au moins une personne (avec un numéro)."); return; }
    if (targets.length > 1 && !window.confirm("Envoyer l'onboarding à " + targets.length + " personnes ? (envoi espacé pour éviter le ban WhatsApp)")) return;
    setBulkRunning(true);
    for (var i = 0; i < targets.length; i++) {
      await sendOne(targets[i]);
      if (i < targets.length - 1) await new Promise(function (res) { setTimeout(res, 4000); }); // anti-ban : ~1 / 4s
    }
    setBulkRunning(false);
  }

  var selectedCount = rows.filter(function (r) { return selected[r.id] && r.number; }).length;

  return (
    <div style={{ padding: "8px 4px" }}>
      <p style={{ opacity: 0.65, fontSize: 13, marginBottom: 12 }}>
        Envoie le message d'onboarding + le lien personnalisé sur le WhatsApp de chaque commercial. Teste en individuel avant d'envoyer à tout le monde. Envoi espacé (~1 toutes les 4 s) pour limiter le risque de blocage WhatsApp.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={function () { selectAll(true); }} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(76,87,96,0.3)", background: "transparent", cursor: "pointer" }}>Tout sélectionner</button>
        <button onClick={function () { selectAll(false); }} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(76,87,96,0.3)", background: "transparent", cursor: "pointer" }}>Tout désélectionner</button>
        <button disabled={bulkRunning || selectedCount === 0} onClick={sendSelected} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: selectedCount ? "#2e7d32" : "#ccc", color: "#fff", cursor: selectedCount ? "pointer" : "default" }}>
          {bulkRunning ? "Envoi en cours…" : "Envoyer l'onboarding (" + selectedCount + ")"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map(function (r) {
          var st = status[r.id];
          return (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid rgba(76,87,96,0.15)", borderRadius: 8, padding: "8px 12px", background: "rgba(255,253,247,0.5)" }}>
              <input type="checkbox" checked={!!selected[r.id]} disabled={!r.number} onChange={function () { toggle(r.id); }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{r.name}</div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>{r.number || "pas de numéro WhatsApp (à remplir dans Équipe)"}</div>
              </div>
              <div style={{ fontSize: 12, minWidth: 90, textAlign: "right", color: st === "sent" ? "#2e7d32" : (st && st.indexOf("error") === 0 ? "#c0392b" : "#888") }}>
                {st === "sending" ? "envoi…" : st === "sent" ? "✅ envoyé" : st && st.indexOf("error") === 0 ? "❌ " + st.slice(6) : ""}
              </div>
              <button disabled={!r.number || st === "sending"} onClick={function () { sendOne(r); }} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(76,87,96,0.3)", background: "transparent", cursor: r.number ? "pointer" : "default", fontSize: 13 }}>
                Envoyer
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
