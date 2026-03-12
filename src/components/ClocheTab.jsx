import React, { useState } from "react";
import { Card, Btn, Badge, StatCard } from "./ui.jsx";
import { statusColor, isCaduque } from "../helpers/status.js";
import { ROLE_COLORS } from "../constants/roles.js";
import { localDateStr } from "../helpers/date.js";
import { motion } from "framer-motion";

function ClocheTab({ team, contracts }) {
  var today = new Date();
  var dayOfWeek = today.getDay();

  var veilleDate = [];
  if (dayOfWeek === 1) {
    var fri = new Date(today); fri.setDate(today.getDate() - 3);
    var sat = new Date(today); sat.setDate(today.getDate() - 2);
    veilleDate.push(localDateStr(fri));
    veilleDate.push(localDateStr(sat));
  } else if (dayOfWeek === 0) {
    var fri = new Date(today); fri.setDate(today.getDate() - 2);
    var sat = new Date(today); sat.setDate(today.getDate() - 1);
    veilleDate.push(localDateStr(fri));
    veilleDate.push(localDateStr(sat));
  } else {
    var yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    veilleDate.push(localDateStr(yesterday));
  }

  var dateLabel = veilleDate.length === 2
    ? new Date(veilleDate[0] + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
      + " & " + new Date(veilleDate[1] + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
    : new Date(veilleDate[0] + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  var VALID_FOR_CLOCHE = { "En attente RDV":1, "RDV pris":1, "Branch\u00E9":1, "Valide":1, "Postprod":1 };

  var counts = {};
  team.filter(function(m) { return m.active; }).forEach(function(m) { counts[m.name] = 0; });
  contracts.forEach(function(c) {
    if (veilleDate.indexOf(c.date) >= 0 && counts[c.commercial] !== undefined && VALID_FOR_CLOCHE[c.status]) {
      counts[c.commercial]++;
    }
  });

  var sorted = Object.entries(counts).sort(function(a, b) { return b[1] - a[1]; });

  var totalContrats = sorted.reduce(function(s, e) { return s + e[1]; }, 0);
  var cloches = sorted.filter(function(e) { return e[1] >= 3; }).length;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, letterSpacing: -0.6, color: "#f0f0f5" }}>Cloche</h2>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", textTransform: "capitalize" }}>{dateLabel}</div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <StatCard label="TOTAL CONTRATS" value={totalContrats} color="#f0f0f5" />
        <StatCard label="CLOCHES" value={cloches} color="#FF9F0A" />
        <StatCard label="MOY / COMMERCIAL" value={sorted.length > 0 ? (totalContrats / sorted.length).toFixed(1) : "0"} color="#0071E3" />
      </div>

      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {sorted.map(function(entry, i) {
            var name = entry[0];
            var count = entry[1];
            var hasCloche = count >= 3;
            var bg = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.03)";
            var countColor = count === 0 ? "rgba(255,255,255,0.20)" : hasCloche ? "#34C759" : "#f0f0f5";

            return (
              <motion.div
                key={name}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.25 }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 18px", background: bg,
                  borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)",
                  borderRadius: i === 0 ? "14px 14px 0 0" : i === sorted.length - 1 ? "0 0 14px 14px" : 0
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: hasCloche ? "rgba(52,199,89,0.15)" : "rgba(255,255,255,0.05)",
                    border: "1px solid " + (hasCloche ? "rgba(52,199,89,0.25)" : "rgba(255,255,255,0.08)"),
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 700, fontSize: 13,
                    color: hasCloche ? "#34C759" : "rgba(255,255,255,0.35)"
                  }}>
                    {name.split(" ").map(function(n) { return n[0]; }).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <span style={{ fontWeight: 500, fontSize: 14, color: "#f0f0f5", letterSpacing: -0.2 }}>{name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {hasCloche && <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 2 }} style={{ fontSize: 18 }}>{"\u{1F514}"}</motion.span>}
                  <span style={{ fontWeight: 600, fontSize: 20, letterSpacing: -0.5, color: countColor, minWidth: 28, textAlign: "right" }}>
                    {count}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

export { ClocheTab };
