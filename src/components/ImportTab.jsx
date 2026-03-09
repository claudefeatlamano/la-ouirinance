import React, { useState } from "react";
import { Card, Btn, Badge } from "./ui.jsx";
import { ROLES, OPERATORS } from "../constants/roles.js";

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
<h2 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 600, letterSpacing: -0.4, color: "#1D1D1F" }}>Import</h2>
<p style={{ margin: "0 0 24px", fontSize: 13, color: "#6E6E73" }}>Glissez vos fichiers Excel ou CSV.</p>
<div
onDragOver={function(e) { e.preventDefault(); setDrag(true); }}
onDragLeave={function() { setDrag(false); }}
onDrop={function(e) { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
style={{ border: "2px dashed " + (drag ? "#0071E3" : "#D1D1D6"), borderRadius: 16, padding: 48, textAlign: "center", background: drag ? "#EFF6FF" : "#FAFAFA", cursor: "pointer", marginBottom: 24 }}
onClick={function() { document.getElementById("fi").click(); }}
>
<div style={{ fontSize: 36, marginBottom: 8 }}>+</div>
<div style={{ fontSize: 14, fontWeight: 600 }}>Glissez ici</div>
<div style={{ fontSize: 12, color: "#AEAEB2", marginTop: 4 }}>.xlsx, .csv</div>
<input id="fi" type="file" accept=".xlsx,.xls,.csv" onChange={function(e) { if (e.target.files[0]) handleFile(e.target.files[0]); }} style={{ display: "none" }} />
</div>
{logs.length > 0 && (
<Card style={{ background: "#1D1D1F", color: "rgba(0,0,0,0.08)" }}>
<div style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 1.8 }}>
{logs.map(function(l, i) {
return <div key={i} style={{ color: l.t === "error" ? "#F87171" : l.t === "success" ? "#34D399" : "#AEAEB2" }}>[{l.time}] {l.m}</div>;
})}
</div>
</Card>
)}
</div>
);
}

export { ImportTab };
