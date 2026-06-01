import React from "react";

// Lecture seule : affiche les codes vendeurs collectés, depuis 2 sources :
// - le FORMULAIRE web d'onboarding (onboarding-submissions-v1, le plus fiable : nom + numéro + code donnés explicitement)
// - le BOT WhatsApp (bot-commercial-profiles-v1 -> profile.vendorCode)
// Sert à reporter les codes dans les fiches Équipe. On n'écrit jamais ici.
function Row(props) {
  var r = props.r;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid rgba(76,87,96,0.15)", borderRadius: 8, padding: "10px 12px", marginBottom: 8, background: r.vendorCode ? "rgba(46,125,50,0.06)" : "rgba(255,253,247,0.5)" }}>
      <div>
        <div style={{ fontWeight: 600 }}>{r.name || "Nom inconnu"}</div>
        <div style={{ fontSize: 12, opacity: 0.6 }}>{r.whatsappNumber || "numéro inconnu"}{r.extra ? " · " + r.extra : ""}</div>
      </div>
      <div style={{ fontFamily: "monospace", fontSize: 14, color: r.vendorCode ? "#2e7d32" : "#999" }}>
        {r.vendorCode || "— pas de code"}
      </div>
    </div>
  );
}

export function VendorCodesTab(props) {
  var submissions = props.submissions || [];
  var profiles = props.profiles || {};

  // Source 1 : formulaire web (plus récents en premier)
  var webRows = submissions
    .map(function (s) {
      return { name: s.name || "", vendorCode: s.vendorCode || "", whatsappNumber: s.whatsappNumber || "", createdAt: s.createdAt || "" };
    })
    .sort(function (a, b) { return (b.createdAt || "").localeCompare(a.createdAt || ""); });

  // Source 2 : profils bot
  var botRows = Object.keys(profiles)
    .map(function (name) {
      var p = profiles[name] || {};
      return { name: p.name || name, vendorCode: p.vendorCode || "", whatsappNumber: p.whatsappNumber || "", extra: p.onboardingComplete ? "" : "onboarding en cours" };
    })
    .sort(function (a, b) {
      if (!!a.vendorCode !== !!b.vendorCode) return a.vendorCode ? -1 : 1;
      return (a.name || "").localeCompare(b.name || "");
    });

  var webWithCode = webRows.filter(function (r) { return r.vendorCode; }).length;
  var botWithCode = botRows.filter(function (r) { return r.vendorCode; }).length;

  return (
    <div style={{ padding: "16px 24px" }}>
      <h2 style={{ marginBottom: 4 }}>Codes vendeurs collectés</h2>
      <p style={{ opacity: 0.6, marginBottom: 16, fontSize: 13 }}>
        À reporter dans les fiches de l'onglet Équipe. Lecture seule.
      </p>

      <h3 style={{ margin: "8px 0 8px", fontSize: 15 }}>Via le formulaire d'onboarding ({webWithCode})</h3>
      {webRows.length === 0 ? <p style={{ opacity: 0.5, fontSize: 13, marginBottom: 16 }}>Aucune soumission pour l'instant.</p> : null}
      {webRows.map(function (r, i) { return <Row key={"w" + i} r={r} />; })}

      <h3 style={{ margin: "20px 0 8px", fontSize: 15 }}>Via le bot WhatsApp ({botWithCode})</h3>
      {botRows.length === 0 ? <p style={{ opacity: 0.5, fontSize: 13 }}>Aucun profil bot pour l'instant.</p> : null}
      {botRows.map(function (r, i) { return <Row key={"b" + i} r={r} />; })}
    </div>
  );
}
