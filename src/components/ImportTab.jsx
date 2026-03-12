import React, { useState } from "react";
import { Card, Btn, Badge } from "./ui.jsx";
import { ROLES, OPERATORS } from "../constants/roles.js";
import { motion } from "framer-motion";

function ImportTab({ team, saveTeam, contracts, saveContracts }) {
const [drag, setDrag] = useState(false);
const [logs, setLogs] = useState([]);
const [imp, setImp] = useState(false);

function addLog(m, t) { setLogs(function(prev) { return prev.concat([{ m: m, t: t || "info", time: new Date().toLocaleTimeString("fr-FR") }]); }); }

function handleFile(file) {
setImp(true);
setLogs([]);
addLog("Fichier: " + file.name);

(async function() {
try {
if (file.name.match(/.(xlsx|xls|csv)$/i)) {
var XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs");
var data = await file.arrayBuffer();
var wb = XLSX.read(data);
var ws = wb.Sheets[wb.SheetNames[0]];
var rows = XLSX.utils.sheet_to_json(ws);
addLog(rows.length + " lignes");
if (!rows.length) { addLog("Vide", "error"); setImp(false); return; }
var cols = Object.keys(rows[0]).map(function(c) { return c.toLowerCase(); });
var isTeam = cols.some(function(c) { return c.indexOf("role") >= 0 || c.indexOf("permis") >= 0; });
var isContract = cols.some(function(c) { return c.indexOf("heure") >= 0 || c.indexOf("statut") >= 0; });


  if (isTeam) {
    addLog("Type: equipe", "success");
    var nm = rows.map(function(r, i) {
      var keys = Object.keys(r);
      function g(ks) { for (var k of ks) { var found = keys.find(function(x) { return x.toLowerCase().indexOf(k) >= 0; }); if (found && r[found]) return String(r[found]).trim(); } return ""; }
      var name = g(["nom", "name", "prenom", "commercial"]);
      if (!name) return null;
      var rl = ROLES.find(function(x) { return g(["role", "poste"]).toLowerCase().indexOf(x.toLowerCase()) >= 0; }) || "Debutant";
      var op = OPERATORS.find(function(x) { return g(["operateur", "produit"]).toLowerCase().indexOf(x.toLowerCase()) >= 0; }) || "Bouygues";
      return { id: Date.now() + i, name: name, role: rl, operators: [op], permis: ["oui", "yes", "1", "true", "x"].indexOf(g(["permis"]).toLowerCase()) >= 0, voiture: ["oui", "yes", "1", "true", "x"].indexOf(g(["voiture"]).toLowerCase()) >= 0, active: true };
    }).filter(Boolean);
    if (nm.length) { saveTeam(nm); addLog(nm.length + " importes!", "success"); } else { addLog("Aucun valide", "error"); }
  } else if (isContract) {
    addLog("Type: contrats", "success");
    var nc = rows.map(function(r, i) {
      var keys = Object.keys(r);
      function g(ks) { for (var k of ks) { var found = keys.find(function(x) { return x.toLowerCase().indexOf(k) >= 0; }); if (found && r[found]) return String(r[found]).trim(); } return ""; }
      return { id: "i-" + Date.now() + "-" + i, commercial: g(["commercial", "nom", "vendeur"]), date: g(["date"]), heure: g(["heure"]), ville: g(["ville"]), rue: g(["rue", "adresse"]), operator: OPERATORS.find(function(x) { return g(["operateur"]).toLowerCase().indexOf(x.toLowerCase()) >= 0; }) || "Free", type: "Fibre", status: g(["statut", "status"]) || "Valide" };
    }).filter(function(c) { return c.commercial && c.date; });
    if (nc.length) { saveContracts(contracts.concat(nc)); addLog(nc.length + " contrats!", "success"); } else { addLog("Aucun valide", "error"); }
  } else {
    addLog("Type non reconnu", "error");
  }
} else { addLog("Format non supporte", "error"); }
} catch (e) { addLog(e.message, "error"); }
setImp(false);
})();
}

return (

<div style={{ maxWidth: 700 }}>
<h2 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 600, letterSpacing: -0.4, color: "#f0f0f5" }}>Import</h2>
<p style={{ margin: "0 0 24px", fontSize: 13, color: "rgba(255,255,255,0.55)" }}>Glissez vos fichiers Excel ou CSV.</p>
<motion.div
  whileHover={{ scale: 1.01 }}
  onDragOver={function(e) { e.preventDefault(); setDrag(true); }}
  onDragLeave={function() { setDrag(false); }}
  onDrop={function(e) { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
  style={{ border: "2px dashed " + (drag ? "#0071E3" : "rgba(255,255,255,0.20)"), borderRadius: 16, padding: 48, textAlign: "center", background: drag ? "rgba(0,113,227,0.08)" : "rgba(255,255,255,0.05)", cursor: "pointer", marginBottom: 24, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", transition: "all 0.2s" }}
  onClick={function() { document.getElementById("fi").click(); }}
>
<div style={{ fontSize: 36, marginBottom: 8, color: "rgba(255,255,255,0.35)" }}>+</div>
<div style={{ fontSize: 14, fontWeight: 600, color: "#f0f0f5" }}>Glissez ici</div>
<div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>.xlsx, .csv</div>
<input id="fi" type="file" accept=".xlsx,.xls,.csv" onChange={function(e) { if (e.target.files[0]) handleFile(e.target.files[0]); }} style={{ display: "none" }} />
</motion.div>
{logs.length > 0 && (
<Card style={{ background: "rgba(0,0,0,0.30)", border: "1px solid rgba(255,255,255,0.08)" }}>
<div style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 1.8 }}>
{logs.map(function(l, i) {
return <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} style={{ color: l.t === "error" ? "#FF6B6B" : l.t === "success" ? "#34D399" : "rgba(255,255,255,0.45)" }}>[{l.time}] {l.m}</motion.div>;
})}
</div>
</Card>
)}
</div>
);
}

export { ImportTab };
