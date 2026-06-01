import React from "react";

// Lecture seule : affiche les codes vendeurs collectés par le bot en onboarding
// (stockés dans bot-commercial-profiles-v1 -> profile.vendorCode). Sert à attribuer
// les codes aux membres dans l'onglet Équipe. On n'écrit jamais ici.
export function VendorCodesTab(props) {
  var profiles = props.profiles || {};
  var rows = Object.keys(profiles).map(function (name) {
    var p = profiles[name] || {};
    return {
      name: p.name || name,
      vendorCode: p.vendorCode || "",
      whatsappNumber: p.whatsappNumber || "",
      onboardingComplete: !!p.onboardingComplete,
    };
  });
  rows.sort(function (a, b) {
    if (!!a.vendorCode !== !!b.vendorCode) return a.vendorCode ? -1 : 1;
    return (a.name || "").localeCompare(b.name || "");
  });
  var withCode = rows.filter(function (r) { return r.vendorCode; }).length;

  return (
    <div style={{ padding: "16px 24px" }}>
      <h2 style={{ marginBottom: 4 }}>Codes vendeurs collectés par le bot</h2>
      <p style={{ opacity: 0.6, marginBottom: 14, fontSize: 13 }}>
        {withCode} code(s) sur {rows.length} commercial(aux) connus du bot. À reporter dans les fiches de l'onglet Équipe.
      </p>
      {rows.length === 0 ? <p style={{ opacity: 0.6 }}>Aucun profil commercial pour l'instant.</p> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map(function (r) {
          return (
            <div key={r.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid rgba(76,87,96,0.15)", borderRadius: 8, padding: "10px 12px", background: r.vendorCode ? "rgba(46,125,50,0.06)" : "rgba(255,253,247,0.5)" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{r.name}</div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>
                  {r.whatsappNumber || "numéro inconnu"}{r.onboardingComplete ? "" : " · onboarding en cours"}
                </div>
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 14, color: r.vendorCode ? "#2e7d32" : "#999" }}>
                {r.vendorCode || "— pas encore donné"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
