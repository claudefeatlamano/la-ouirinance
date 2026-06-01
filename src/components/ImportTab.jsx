import React, { useState } from "react";
import { Card, Btn, Badge } from "./ui.jsx";
import { motion } from "framer-motion";
import { mergeImportedSectors, parseImportRows } from "../helpers/import-parser.js";

function ImportTab({ team, saveTeam, contracts, saveContracts, customSectors, saveCustomSectors }) {
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
var rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
addLog(rows.length + " lignes");
if (!rows.length) { addLog("Vide", "error"); setImp(false); return; }
var parsed = parseImportRows(rows, { fileName: file.name });

  if (parsed.type === "team") {
    addLog("Type: equipe", "success");
    var nm = parsed.members;
    if (nm.length) { saveTeam(nm); addLog(nm.length + " importes!", "success"); } else { addLog("Aucun valide", "error"); }
  } else if (parsed.type === "contracts") {
    addLog("Type: contrats", "success");
    var nc = parsed.contracts;
    if (nc.length) { saveContracts(contracts.concat(nc)); addLog(nc.length + " contrats!", "success"); } else { addLog("Aucun valide", "error"); }
  } else if (parsed.type === "jachere") {
    addLog("Type: jachere", "success");
    if (parsed.sectors.length && saveCustomSectors) {
      var nextSectors = mergeImportedSectors(customSectors, parsed);
      saveCustomSectors(nextSectors);
      var communeCount = parsed.sectors.reduce(function(total, sector) { return total + sector.communes.length; }, 0);
      addLog(parsed.sectors.length + " jachere(s), " + communeCount + " commune(s) importees", "success");
    } else {
      addLog("Aucune jachere valide", "error");
    }
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
<h2 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 600, letterSpacing: -0.4, color: "var(--lo-ink)" }}>Import</h2>
<p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--lo-muted)" }}>Glissez vos fichiers Excel ou CSV.</p>
<motion.div
  whileHover={{ scale: 1.01 }}
  onDragOver={function(e) { e.preventDefault(); setDrag(true); }}
  onDragLeave={function() { setDrag(false); }}
  onDrop={function(e) { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
  style={{ border: "2px dashed " + (drag ? "var(--lo-primary)" : "rgba(76,87,96,0.24)"), borderRadius: 16, padding: 48, textAlign: "center", background: drag ? "rgba(76,87,96,0.10)" : "rgba(76,87,96,0.07)", cursor: "pointer", marginBottom: 24, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", transition: "all 0.2s" }}
  onClick={function() { document.getElementById("fi").click(); }}
>
<div style={{ fontSize: 36, marginBottom: 8, color: "var(--lo-faint)" }}>+</div>
<div style={{ fontSize: 14, fontWeight: 600, color: "var(--lo-ink)" }}>Glissez ici</div>
<div style={{ fontSize: 12, color: "var(--lo-faint)", marginTop: 4 }}>.xlsx, .csv</div>
<input id="fi" type="file" accept=".xlsx,.xls,.csv" onChange={function(e) { if (e.target.files[0]) handleFile(e.target.files[0]); }} style={{ display: "none" }} />
</motion.div>
{logs.length > 0 && (
<Card style={{ background: "rgba(0,0,0,0.30)", border: "1px solid rgba(76,87,96,0.10)" }}>
<div style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 1.8 }}>
{logs.map(function(l, i) {
return <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} style={{ color: l.t === "error" ? "#FF6B6B" : l.t === "success" ? "#34D399" : "var(--lo-faint)" }}>[{l.time}] {l.m}</motion.div>;
})}
</div>
</Card>
)}
</div>
);
}

export { ImportTab };
