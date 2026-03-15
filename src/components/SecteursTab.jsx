import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, Btn, Inp, Badge, Sel, StatCard } from "./ui.jsx";
import { JACHERE, JACHERE_TALC } from "../constants/jachere.js";
import { DEPT_ZONES, OP_COLORS } from "../constants/roles.js";
import { getC, getTalcC, MONTHS_ORDER, MONTHS_LABELS, normVille } from "../helpers/carnet.js";
import { DEMO_CONTRACTS } from "../data/contracts.js";
import { CommuneHeatmap } from "./MapTab.jsx";
import { localDateStr } from "../helpers/date.js";

function SecteursTab() {
const [sel, setSel] = useState(null);
const [selSource, setSelSource] = useState(null);
const [sortBy, setSortBy] = useState("c");
const [month, setMonth] = useState("");
const [communeView, setCommuneView] = useState(null); // { commune, dept, isTalc }
const [rueSearch, setRueSearch] = useState("");
const [rueSort, setRueSort] = useState("top"); // "top" | "recent"
const [showMap, setShowMap] = useState(false);
const [communeSearch, setCommuneSearch] = useState("");
const [dormantFilter, setDormantFilter] = useState(0);

var lastProspection = useMemo(function() {
  var map = {};
  DEMO_CONTRACTS.forEach(function(ct) {
    var v = normVille(ct.ville);
    if (!v) return;
    if (!map[v] || ct.date > map[v]) map[v] = ct.date;
  });
  return map;
}, []);

var last6Months = MONTHS_ORDER.slice(-6);

var stats = Object.entries(JACHERE).map(function(entry) {
var name = entry[0]; var data = entry[1];
var tp = data.communes.reduce(function(s, c) { return s + c.p; }, 0);
var tc = data.communes.reduce(function(s, c) { return s + getC(c, data.dept, month); }, 0);
return { name: name, dept: data.dept, communes: data.communes, tp: tp, tc: tc, taux: tp ? (tc / tp * 100) : 0, source: "JACHERE" };
});
var statsTalc = Object.entries(JACHERE_TALC).map(function(entry) {
var name = entry[0]; var data = entry[1];
var tp = data.communes.reduce(function(s, c) { return s + c.p; }, 0);
var tc = data.communes.reduce(function(s, c) { return s + getTalcC(c, data.dept, month); }, 0);
return { name: name, dept: data.dept, communes: data.communes, tp: tp, tc: tc, taux: tp ? (tc / tp * 100) : 0, source: "TALC" };
});

// === COMMUNE DETAIL VIEW ===
if (communeView) {
var cv = communeView.commune;
var cvDept = communeView.dept;
var cvTalc = communeView.isTalc;
var cvColor = cvTalc ? "#FF9F0A" : "#34C759";

// Bar chart: last 6 months
var cvVals = last6Months.map(function(mk) {
  return { mk: mk, label: MONTHS_LABELS[mk], count: cvTalc ? getTalcC(cv, cvDept, mk) : getC(cv, cvDept, mk) };
});
var cvMax = Math.max.apply(null, cvVals.map(function(v) { return v.count; })) || 1;
var cvTotal6 = cvVals.reduce(function(s, v) { return s + v.count; }, 0);

// Street data from live contracts
var cvContracts = DEMO_CONTRACTS.filter(function(ct) {
  return normVille(ct.ville) === cv.v;
});
// Group by rue
var rueMap = {};
cvContracts.forEach(function(ct) {
  var r = (ct.rue || "").trim();
  if (!r) r = "(rue non renseignée)";
  if (!rueMap[r]) rueMap[r] = { count: 0, commerciaux: {}, lastDate: "" };
  rueMap[r].count++;
  if (ct.date && ct.date > rueMap[r].lastDate) rueMap[r].lastDate = ct.date;
  var com = ct.commercial || "?";
  rueMap[r].commerciaux[com] = (rueMap[r].commerciaux[com] || 0) + 1;
});
var rueList = Object.entries(rueMap).sort(function(a, b) {
  if (rueSort === "recent") return b[1].lastDate > a[1].lastDate ? 1 : b[1].lastDate < a[1].lastDate ? -1 : 0;
  return b[1].count - a[1].count;
});
var rueQuery = rueSearch.trim().toUpperCase();
var rueFiltered = rueQuery ? rueList.filter(function(e) { return e[0].toUpperCase().indexOf(rueQuery) >= 0; }) : rueList;

// Commercial color palette (reuse team colors)
var comColors = ["#0071E3","#34C759","#FF9F0A","#FF3B30","#AF52DE","#5AC8FA","#FF2D55","#5856D6"];
var comColorMap = {};
var comColorIdx = 0;
function getComColor(name) {
  if (!comColorMap[name]) { comColorMap[name] = comColors[comColorIdx++ % comColors.length]; }
  return comColorMap[name];
}

return (
<div>
{/* Breadcrumb nav */}
<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
  <Btn v="ghost" onClick={function() { setSel(null); setSelSource(null); setCommuneView(null); setRueSearch(""); setShowMap(false); setRueSort("top"); }}>← Secteurs</Btn>
  <span style={{ color: "rgba(255,255,255,0.20)", fontSize: 14 }}>›</span>
  <Btn v="ghost" onClick={function() { setCommuneView(null); setRueSearch(""); setShowMap(false); setRueSort("top"); }}>{sel}</Btn>
  <span style={{ color: "rgba(255,255,255,0.20)", fontSize: 14 }}>›</span>
  <span style={{ fontSize: 14, fontWeight: 700, color: "#f0f0f5" }}>{cv.v}</span>
</div>

{/* Header card */}
<Card style={{ marginBottom: 16, padding: 20 }}>
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
    <div>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.6 }}>{cv.v}</h2>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 3 }}>{cv.p.toLocaleString("fr-FR")} prises · Dept {cvDept}</div>
    </div>
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <Badge color={cvTalc ? "#FF9F0A" : "#6E6E73"}>{cvTalc ? "TALC" : "Stratygo"}</Badge>
      <Badge color={cv.z === "H" ? "#FF3B30" : "#0071E3"}>{cv.z === "H" ? "Haute densité" : "Standard"}</Badge>
    </div>
  </div>
  {/* 6-month bar chart */}
  <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
    {cvVals.map(function(v) {
      var h = Math.max(v.count / cvMax * 60, v.count > 0 ? 6 : 2);
      var isCur = month === v.mk;
      var col = v.count === 0 ? "rgba(255,255,255,0.08)" : isCur ? "#0071E3" : cvColor;
      var lbl = v.label.split(" ");
      return (
        <div key={v.mk} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: v.count > 0 ? (isCur ? "#0071E3" : "#f0f0f5") : "rgba(255,255,255,0.08)" }}>{v.count || ""}</div>
          <div style={{ width: "100%", height: 60, display: "flex", alignItems: "flex-end" }}>
            <div style={{ width: "100%", height: h, borderRadius: "4px 4px 0 0", background: col }} />
          </div>
          <div style={{ fontSize: 9, color: isCur ? "#0071E3" : "rgba(255,255,255,0.35)", fontWeight: isCur ? 700 : 400, textAlign: "center", lineHeight: 1.2 }}>{lbl[0]}<br/>{lbl[1]}</div>
        </div>
      );
    })}
  </div>
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Total 6 derniers mois</span>
    <span style={{ fontSize: 18, fontWeight: 800, color: cvTotal6 > 0 ? "#f0f0f5" : "rgba(255,255,255,0.20)" }}>{cvTotal6} contrat{cvTotal6 > 1 ? "s" : ""}</span>
  </div>
</Card>

{showMap && <CommuneHeatmap communeName={cv.v} rueList={rueList} />}

{/* Street search */}
<Card style={{ padding: 20 }}>
  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#f0f0f5" }}>Rues</h3>
    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", flex: 1 }}>{cvContracts.length} contrat{cvContracts.length > 1 ? "s" : ""} · {rueList.length} rue{rueList.length > 1 ? "s" : ""}</span>
    {[["top","🏆 Top"], ["recent","🕐 Récentes"]].map(function(opt) {
      var active = rueSort === opt[0];
      return <button key={opt[0]} onClick={function() { setRueSort(opt[0]); }} style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, border: "1.5px solid", cursor: "pointer", background: active ? "rgba(255,255,255,0.15)" : "transparent", color: active ? "#fff" : "rgba(255,255,255,0.55)", borderColor: active ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.08)", fontFamily: "inherit" }}>{opt[1]}</button>;
    })}
    <button onClick={function() { setShowMap(function(v) { return !v; }); }} style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, border: "1.5px solid", cursor: "pointer", background: showMap ? "#0071E3" : "transparent", color: showMap ? "#fff" : "rgba(255,255,255,0.55)", borderColor: showMap ? "#0071E3" : "rgba(255,255,255,0.08)", fontFamily: "inherit" }}>🗺 Carte</button>
  </div>
  <div style={{ position: "relative", marginBottom: 16 }}>
    <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "rgba(255,255,255,0.35)", pointerEvents: "none" }}>🔍</span>
    <input
      value={rueSearch}
      onChange={function(e) { setRueSearch(e.target.value); }}
      placeholder="Rechercher une rue..."
      style={{ width: "100%", boxSizing: "border-box", paddingLeft: 36, paddingRight: 12, paddingTop: 10, paddingBottom: 10, fontSize: 14, border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 10, outline: "none", fontFamily: "inherit", background: "rgba(255,255,255,0.08)", color: "#f0f0f5" }}
    />
    {rueSearch && (
      <button onClick={function() { setRueSearch(""); }} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.35)", fontSize: 16, padding: 2 }}>×</button>
    )}
  </div>
  {rueFiltered.length === 0 ? (
    <div style={{ textAlign: "center", padding: "24px 0", color: "rgba(255,255,255,0.35)", fontSize: 13 }}>Aucune rue trouvée</div>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {rueFiltered.map(function(entry, i) {
        var rue = entry[0]; var info = entry[1];
        var coms = Object.entries(info.commerciaux).sort(function(a, b) { return b[1] - a[1]; });
        var relTime = "";
        if (info.lastDate) {
          var diff = Math.floor((new Date() - new Date(info.lastDate + "T12:00:00")) / 86400000);
          if (diff === 0) relTime = "aujourd'hui";
          else if (diff === 1) relTime = "hier";
          else if (diff < 7) relTime = "il y a " + diff + " j";
          else if (diff < 30) relTime = "il y a " + Math.floor(diff / 7) + " sem.";
          else if (diff < 365) relTime = "il y a " + Math.floor(diff / 30) + " mois";
          else relTime = "il y a " + Math.floor(diff / 365) + " an" + (diff >= 730 ? "s" : "");
        }
        return (
          <motion.div
            key={rue}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: i * 0.04 }}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: i % 2 ? "rgba(255,255,255,0.03)" : "transparent", borderRadius: 8 }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#f0f0f5", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rue}</span>
                {relTime && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", whiteSpace: "nowrap", flexShrink: 0 }}>{relTime}</span>}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {coms.map(function(ce) {
                  var firstName = ce[0].split(" ")[0];
                  return (
                    <span key={ce[0]} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: getComColor(ce[0]), background: getComColor(ce[0]) + "18", borderRadius: 20, paddingLeft: 8, paddingRight: 8, paddingTop: 3, paddingBottom: 3 }}>
                      {firstName}{ce[1] > 1 ? <span style={{ fontWeight: 800 }}>×{ce[1]}</span> : ""}
                    </span>
                  );
                })}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: cvColor }}>{info.count}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>contrat{info.count > 1 ? "s" : ""}</div>
            </div>
          </motion.div>
        );
      })}
    </div>
  )}
</Card>
</div>
);
}

// === SECTOR DETAIL VIEW ===
if (sel) {
var isTalc = selSource === "TALC";
var jData = isTalc ? JACHERE_TALC[sel] : JACHERE[sel];
var s = (isTalc ? statsTalc : stats).find(function(x) { return x.name === sel; });
var sorted = jData.communes.slice().sort(function(a, b) {
var ac = isTalc ? getTalcC(a, jData.dept, month) : getC(a, jData.dept, month);
var bc = isTalc ? getTalcC(b, jData.dept, month) : getC(b, jData.dept, month);
if (sortBy === "c") return bc - ac;
if (sortBy === "p") return b.p - a.p;
return (bc / (b.p || 1)) - (ac / (a.p || 1));
});
return (
<div>
<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
<Btn v="ghost" onClick={function() { setSel(null); setSelSource(null); setCommuneSearch(""); setDormantFilter(0); }}>← Retour</Btn>
<h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{sel}</h2>
{isTalc ? <Badge color="#FF9F0A">TALC</Badge> : <Badge color={OP_COLORS.Free}>Stratygo</Badge>}
{!isTalc && DEPT_ZONES[jData.dept] && DEPT_ZONES[jData.dept].b && <Badge color={OP_COLORS.Bouygues}>Bouygues</Badge>}
<div style={{ marginLeft: "auto" }}><Sel value={month} onChange={setMonth} placeholder="Tous les mois" options={MONTHS_ORDER.map(function(m) { return { value: m, label: MONTHS_LABELS[m] }; })} style={{ minWidth: 140 }} /></div>
</div>
<div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
<StatCard label="Communes" value={jData.communes.length} color="#0071E3" />
<StatCard label="Prises" value={s.tp.toLocaleString("fr-FR")} color="#f0f0f5" />
<StatCard label="Contrats" value={s.tc} color="#34C759" />
<StatCard label="Taux" value={s.taux.toFixed(2) + "%"} color={s.taux > 0.5 ? "#34C759" : "#FF9F0A"} />
</div>
<Card>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
<h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, letterSpacing: -0.3, color: "#f0f0f5" }}>Communes</h3>
<div style={{ display: "flex", gap: 6 }}>
<Btn s="sm" v={sortBy === "c" ? "primary" : "secondary"} onClick={function() { setSortBy("c"); }}>Contrats</Btn>
<Btn s="sm" v={sortBy === "p" ? "primary" : "secondary"} onClick={function() { setSortBy("p"); }}>Prises</Btn>
<Btn s="sm" v={sortBy === "t" ? "primary" : "secondary"} onClick={function() { setSortBy("t"); }}>Taux</Btn>
</div>
</div>
<div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
<span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginRight: 4 }}>Pas de prospection depuis :</span>
{[0,1,2,3,4,5,6].map(function(m) {
  var active = dormantFilter === m;
  return <Btn key={m} s="sm" v={active ? "primary" : "secondary"} onClick={function() { setDormantFilter(m); }}>{m === 0 ? "Tous" : m + " mois"}</Btn>;
})}
</div>
<div style={{ position: "relative", marginBottom: 16 }}>
  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "rgba(255,255,255,0.35)", pointerEvents: "none" }}>🔍</span>
  <input
    value={communeSearch}
    onChange={function(e) { setCommuneSearch(e.target.value); }}
    placeholder="Rechercher une commune..."
    style={{ width: "100%", boxSizing: "border-box", paddingLeft: 36, paddingRight: 12, paddingTop: 10, paddingBottom: 10, fontSize: 14, border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 10, outline: "none", fontFamily: "inherit", background: "rgba(255,255,255,0.08)", color: "#f0f0f5" }}
  />
  {communeSearch && (
    <button onClick={function() { setCommuneSearch(""); }} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.35)", fontSize: 16, padding: 2 }}>×</button>
  )}
</div>
{(function() {
  var cq = communeSearch.trim().toUpperCase();
  var filtered = cq ? sorted.filter(function(c) { return c.v.indexOf(cq) >= 0; }) : sorted;
  if (dormantFilter > 0) {
    var cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - dormantFilter);
    var cutoffStr = localDateStr(cutoff);
    filtered = filtered.filter(function(c) {
      return !lastProspection[c.v] || lastProspection[c.v] < cutoffStr;
    });
  }
  return filtered;
})().map(function(c, i) {
var cc = isTalc ? getTalcC(c, jData.dept, month) : getC(c, jData.dept, month);
var t = c.p ? (cc / c.p * 100) : 0;
var col = t > 0.8 ? "#34C759" : t > 0.3 ? "#FF9F0A" : cc === 0 ? "rgba(255,255,255,0.08)" : "#FF3B30";
var lpDate = lastProspection[c.v];
var lpText = "";
var lpColor = "rgba(255,255,255,0.35)";
if (!lpDate) {
  lpText = "Jamais prospectée";
  lpColor = "#FF3B30";
} else {
  var lpDiff = Math.floor((new Date() - new Date(lpDate + "T12:00:00")) / 86400000);
  if (lpDiff === 0) lpText = "Dernier contrat aujourd'hui";
  else if (lpDiff === 1) lpText = "Dernier contrat hier";
  else if (lpDiff < 7) lpText = "Dernier contrat il y a " + lpDiff + " j";
  else if (lpDiff < 30) lpText = "Dernier contrat il y a " + Math.floor(lpDiff / 7) + " sem.";
  else if (lpDiff < 365) lpText = "Dernier contrat il y a " + Math.floor(lpDiff / 30) + " mois";
  else lpText = "Dernier contrat il y a " + Math.floor(lpDiff / 365) + " an" + (lpDiff >= 730 ? "s" : "");
  if (lpDiff < 30) lpColor = "#34C759";
  else if (lpDiff < 90) lpColor = "#FF9F0A";
  else lpColor = "#FF3B30";
}
return (
<motion.div
key={c.v}
initial={{ opacity: 0, y: 10 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.25, delay: i * 0.04 }}
onClick={function() { setCommuneView({ commune: c, dept: jData.dept, isTalc: isTalc }); setRueSearch(""); }}
style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: i % 2 ? "rgba(255,255,255,0.03)" : "transparent", borderRadius: 8, cursor: "pointer" }}
>
<div style={{ width: 24, textAlign: "center", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.35)" }}>{i + 1}</div>
<div style={{ flex: 1 }}>
<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
<span style={{ fontSize: 13, fontWeight: 600 }}>{c.v}</span>
<Badge color={c.z === "H" ? "#FF3B30" : "#0071E3"}>{c.z === "H" ? "Haute" : "Std"}</Badge>
</div>
<div style={{ fontSize: 11, color: lpColor, marginTop: 2 }}>{lpText}</div>
<div style={{ marginTop: 4, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.10)", overflow: "hidden" }}>
<div style={{ width: Math.min(t * 50, 100) + "%", height: "100%", borderRadius: 3, background: col }} />
</div>
</div>
<div style={{ textAlign: "right", minWidth: 70 }}>
<div style={{ fontSize: 14, fontWeight: 800, color: cc ? "#f0f0f5" : "rgba(255,255,255,0.20)" }}>{cc}</div>
<div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{c.p.toLocaleString("fr-FR")} pr.</div>
</div>
<div style={{ minWidth: 45, textAlign: "right" }}>
<span style={{ fontSize: 12, fontWeight: 700, color: col }}>{t.toFixed(2)}%</span>
</div>
</motion.div>
);
})}
</Card>
</div>
);
}

// === OVERVIEW ===
return (
<div>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
<div>
<h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: -0.4, color: "#f0f0f5" }}>Secteurs</h2>
<p style={{ margin: "4px 0 0", fontSize: 13, color: "rgba(255,255,255,0.55)" }}>{stats.length} secteurs Stratygo · {statsTalc.length} secteurs TALC</p>
</div>
<Sel value={month} onChange={setMonth} placeholder="Tous les mois" options={MONTHS_ORDER.map(function(m) { return { value: m, label: MONTHS_LABELS[m] }; })} style={{ minWidth: 150 }} />
</div>
<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
{stats.concat(statsTalc).sort(function(a, b) { return b.tc - a.tc; }).map(function(j, i) {
var isTalcCard = j.source === "TALC";
var col = j.taux > 0.5 ? "#34C759" : j.taux > 0.2 ? "#FF9F0A" : "#FF3B30";
return (
<motion.div
key={j.name}
initial={{ opacity: 0, y: 16 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.3, delay: i * 0.04 }}
>
<Card onClick={function() { setSel(j.name); setSelSource(j.source); }} style={{ cursor: "pointer", padding: 18, border: "1px solid " + (isTalcCard ? "rgba(255,159,10,0.25)" : "rgba(255,255,255,0.12)") }}>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
<div>
<div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.3, color: "#f0f0f5" }}>{j.name}</div>
<div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{j.communes.length} com. · {j.tp.toLocaleString("fr-FR")} prises</div>
</div>
<div style={{ display: "flex", gap: 4, alignItems: "center" }}>
{isTalcCard ? <Badge color="#FF9F0A">TALC</Badge> : <Badge color="#6E6E73">Stratygo</Badge>}
<Badge color={col}>{j.taux.toFixed(2)}%</Badge>
</div>
</div>
<div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.10)", overflow: "hidden", marginBottom: 8 }}>
<div style={{ width: Math.min(j.taux * 50, 100) + "%", height: "100%", borderRadius: 4, background: col }} />
</div>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
<span style={{ fontSize: 22, fontWeight: 800 }}>{j.tc}</span>
<div style={{ display: "flex", gap: 4 }}>
{!isTalcCard && <Badge color={OP_COLORS.Free}>Free</Badge>}
{!isTalcCard && DEPT_ZONES[j.dept] && DEPT_ZONES[j.dept].b && <Badge color={OP_COLORS.Bouygues}>B</Badge>}
</div>
</div>
</Card>
</motion.div>
);
})}
</div>
</div>
);
}

// IMPORT

export { SecteursTab };
