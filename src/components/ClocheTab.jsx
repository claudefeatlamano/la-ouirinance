import React, { useState } from "react";
import { Card, Btn, Badge } from "./ui.jsx";
import { statusColor, isCaduque } from "../helpers/status.js";
import { ROLE_COLORS } from "../constants/roles.js";

function ClocheTab({ team, contracts }) {
  // Calculer les dates "veille" : J-1, et si lundi → vendredi + samedi
  var today = new Date();
  var dayOfWeek = today.getDay(); // 0=dim, 1=lun, 2=mar...

  var veilleDate = [];
  if (dayOfWeek === 1) {
    // Lundi → vendredi + samedi
    var fri = new Date(today); fri.setDate(today.getDate() - 3);
    var sat = new Date(today); sat.setDate(today.getDate() - 2);
    veilleDate.push(fri.toISOString().split("T")[0]);
    veilleDate.push(sat.toISOString().split("T")[0]);
  } else if (dayOfWeek === 0) {
    // Dimanche → vendredi + samedi (preview du lundi matin)
    var fri = new Date(today); fri.setDate(today.getDate() - 2);
    var sat = new Date(today); sat.setDate(today.getDate() - 1);
    veilleDate.push(fri.toISOString().split("T")[0]);
    veilleDate.push(sat.toISOString().split("T")[0]);
  } else {
    var yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    veilleDate.push(yesterday.toISOString().split("T")[0]);
  }

  var dateLabel = veilleDate.length === 2
    ? new Date(veilleDate[0] + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
      + " & " + new Date(veilleDate[1] + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
    : new Date(veilleDate[0] + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  // Contrats avec RIB validé uniquement (blancs = status vide → exclus)
  var VALID_FOR_CLOCHE = { "En attente RDV":1, "RDV pris":1, "RDV pris J+7":1, "Branché":1, "Branché VRF":1, "Valide":1 };

  // Compter les contrats par commercial sur les dates veille
  var counts = {};
  team.filter(function(m) { return m.active; }).forEach(function(m) { counts[m.name] = 0; });
  contracts.forEach(function(c) {
    if (veilleDate.indexOf(c.date) >= 0 && counts[c.commercial] !== undefined && VALID_FOR_CLOCHE[c.status]) {
      counts[c.commercial]++;
    }
  });

  // Trier par nombre décroissant
  var sorted = Object.entries(counts).sort(function(a, b) { return b[1] - a[1]; });

  var totalContrats = sorted.reduce(function(s, e) { return s + e[1]; }, 0);
  var cloches = sorted.filter(function(e) { return e[1] >= 3; }).length;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, letterSpacing: -0.6, color: "#1D1D1F" }}>Cloche</h2>
        <div style={{ fontSize: 13, color: "#6E6E73", textTransform: "capitalize" }}>{dateLabel}</div>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <Card style={{ flex: 1, minWidth: 120, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#AEAEB2", fontWeight: 500, letterSpacing: 0.5, marginBottom: 6 }}>TOTAL CONTRATS</div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1, color: "#1D1D1F" }}>{totalContrats}</div>
        </Card>
        <Card style={{ flex: 1, minWidth: 120, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#AEAEB2", fontWeight: 500, letterSpacing: 0.5, marginBottom: 6 }}>CLOCHES</div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1, color: "#FF9F0A" }}>{cloches}</div>
        </Card>
        <Card style={{ flex: 1, minWidth: 120, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#AEAEB2", fontWeight: 500, letterSpacing: 0.5, marginBottom: 6 }}>MOY / COMMERCIAL</div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1, color: "#0071E3" }}>
            {sorted.length > 0 ? (totalContrats / sorted.length).toFixed(1) : "0"}
          </div>
        </Card>
      </div>

      {/* Liste commerciaux */}
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {sorted.map(function(entry, i) {
            var name = entry[0];
            var count = entry[1];
            var hasCloche = count >= 3;
            var bg = i % 2 === 0 ? "#fff" : "#FAFAFA";
            var countColor = count === 0 ? "#D1D1D6" : hasCloche ? "#34C759" : "#1D1D1F";

            return (
              <div key={name} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 18px", background: bg,
                borderTop: i === 0 ? "none" : "1px solid #F3F4F6",
                borderRadius: i === 0 ? "14px 14px 0 0" : i === sorted.length - 1 ? "0 0 14px 14px" : 0
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, background: hasCloche ? "#E8F8ED" : "#F5F5F7",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 700, fontSize: 13, color: hasCloche ? "#1C7A3A" : "#AEAEB2"
                  }}>
                    {name.split(" ").map(function(n) { return n[0]; }).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <span style={{ fontWeight: 500, fontSize: 14, color: "#1D1D1F", letterSpacing: -0.2 }}>{name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {hasCloche && <span style={{ fontSize: 18 }}>🔔</span>}
                  <span style={{ fontWeight: 600, fontSize: 20, letterSpacing: -0.5, color: countColor, minWidth: 28, textAlign: "right" }}>
                    {count}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

export { ClocheTab };
