import React, { useState } from "react";
import { motion } from "framer-motion";
import { Card, Btn, Inp, Badge, Sel, StatCard } from "./ui.jsx";
import { DEPT_ZONES, OP_COLORS } from "../constants/roles.js";
import { getC, getTalcC, MONTHS_ORDER, MONTHS_LABELS, normVille } from "../helpers/carnet.js";
import { getArchiveMonthKey } from "../helpers/carnet-core.js";
import { isCaduque } from "../helpers/status.js";
import { DEMO_CONTRACTS } from "../data/contracts.js";
import { CommuneHeatmap } from "./MapTab.jsx";
import { getSectorCatalog } from "../helpers/sector-catalog.js";

function SecteursTab({ customSectors }) {
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

var last6Months = MONTHS_ORDER.slice(-6);
var sectorCatalog = getSectorCatalog(customSectors);
var jachere = sectorCatalog.jachere;
var jachereTalc = sectorCatalog.jachereTalc;

function getCTotal(c, dept, isTalc) {
  return isTalc ? getTalcC(c, dept, "") : getC(c, dept, "");
}

var stats = Object.entries(jachere).map(function(entry) {
var name = entry[0]; var data = entry[1];
var tp = data.communes.reduce(function(s, c) { return s + c.p; }, 0);
var tc = data.communes.reduce(function(s, c) { return s + getC(c, data.dept, month); }, 0);
return { name: name, dept: data.dept, communes: data.communes, tp: tp, tc: tc, taux: tp ? (tc / tp * 100) : 0, source: "JACHERE" };
});
var statsTalc = Object.entries(jachereTalc).map(function(entry) {
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
var cvColor = cvTalc ? "var(--lo-taupe)" : "var(--lo-accent)";

// Bar chart: last 6 months
var cvVals = last6Months.map(function(mk) {
  return { mk: mk, label: MONTHS_LABELS[mk], count: cvTalc ? getTalcC(cv, cvDept, mk) : getC(cv, cvDept, mk) };
});
var cvMax = Math.max.apply(null, cvVals.map(function(v) { return v.count; })) || 1;
var cvTotal6 = cvVals.reduce(function(s, v) { return s + v.count; }, 0);

// Street data from live contracts
var cvContracts = DEMO_CONTRACTS.filter(function(ct) {
  if (normVille(ct.ville) !== cv.v) return false;
  if (isCaduque(ct)) return false;
  return !month || getArchiveMonthKey(ct) === month;
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
var comColors = ["var(--lo-primary)","var(--lo-accent)","var(--lo-taupe)","var(--lo-danger)","var(--lo-accent)","#5AC8FA","#FF2D55","#5856D6"];
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
  <span style={{ color: "rgba(76,87,96,0.24)", fontSize: 14 }}>›</span>
  <Btn v="ghost" onClick={function() { setCommuneView(null); setRueSearch(""); setShowMap(false); setRueSort("top"); }}>{sel}</Btn>
  <span style={{ color: "rgba(76,87,96,0.24)", fontSize: 14 }}>›</span>
  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--lo-ink)" }}>{cv.v}</span>
</div>

{/* Header card */}
<Card className="secteurs-commune-card" style={{ marginBottom: 16, padding: 20 }}>
  <div className="secteurs-commune-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
    <div>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.6 }}>{cv.v}</h2>
      <div style={{ fontSize: 13, color: "var(--lo-muted)", marginTop: 3 }}>{cv.p.toLocaleString("fr-FR")} prises · Dept {cvDept}</div>
    </div>
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <Badge color={cvTalc ? "var(--lo-taupe)" : "#6E6E73"}>{cvTalc ? "TALC" : "Stratygo"}</Badge>
      <Badge color={cv.z === "H" ? "var(--lo-danger)" : "var(--lo-primary)"}>{cv.z === "H" ? "Haute densité" : "Standard"}</Badge>
    </div>
  </div>
  {/* 6-month bar chart */}
  <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
    {cvVals.map(function(v) {
      var h = Math.max(v.count / cvMax * 60, v.count > 0 ? 6 : 2);
      var isCur = month === v.mk;
      var col = v.count === 0 ? "rgba(76,87,96,0.10)" : isCur ? "var(--lo-primary)" : cvColor;
      var lbl = v.label.split(" ");
      return (
        <div key={v.mk} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: v.count > 0 ? (isCur ? "var(--lo-primary)" : "var(--lo-ink)") : "rgba(76,87,96,0.10)" }}>{v.count || ""}</div>
          <div style={{ width: "100%", height: 60, display: "flex", alignItems: "flex-end" }}>
            <div style={{ width: "100%", height: h, borderRadius: "4px 4px 0 0", background: col }} />
          </div>
          <div style={{ fontSize: 9, color: isCur ? "var(--lo-primary)" : "var(--lo-faint)", fontWeight: isCur ? 700 : 400, textAlign: "center", lineHeight: 1.2 }}>{lbl[0]}<br/>{lbl[1]}</div>
        </div>
      );
    })}
  </div>
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(76,87,96,0.08)" }}>
    <span style={{ fontSize: 12, color: "var(--lo-muted)" }}>Total 6 derniers mois</span>
    <span style={{ fontSize: 18, fontWeight: 800, color: cvTotal6 > 0 ? "var(--lo-ink)" : "rgba(76,87,96,0.24)" }}>{cvTotal6} contrat{cvTotal6 > 1 ? "s" : ""}</span>
  </div>
</Card>

{showMap && <CommuneHeatmap communeName={cv.v} rueList={rueList} />}

{/* Street search */}
<Card className="secteurs-street-card" style={{ padding: 20 }}>
  <div className="secteurs-street-toolbar" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--lo-ink)" }}>Rues</h3>
    <span style={{ fontSize: 12, color: "var(--lo-faint)", flex: 1 }}>{cvContracts.length} contrat{cvContracts.length > 1 ? "s" : ""}{month ? " · " + MONTHS_LABELS[month] : ""} · {rueList.length} rue{rueList.length > 1 ? "s" : ""}</span>
    {[["top","🏆 Top"], ["recent","🕐 Récentes"]].map(function(opt) {
      var active = rueSort === opt[0];
      return <button key={opt[0]} onClick={function() { setRueSort(opt[0]); }} style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, border: "1.5px solid", cursor: "pointer", background: active ? "rgba(76,87,96,0.14)" : "transparent", color: active ? "#fff" : "var(--lo-muted)", borderColor: active ? "rgba(76,87,96,0.14)" : "rgba(76,87,96,0.10)", fontFamily: "inherit" }}>{opt[1]}</button>;
    })}
    <button onClick={function() { setShowMap(function(v) { return !v; }); }} style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, border: "1.5px solid", cursor: "pointer", background: showMap ? "var(--lo-primary)" : "transparent", color: showMap ? "#fff" : "var(--lo-muted)", borderColor: showMap ? "var(--lo-primary)" : "rgba(76,87,96,0.10)", fontFamily: "inherit" }}>🗺 Carte</button>
  </div>
  <div style={{ position: "relative", marginBottom: 16 }}>
    <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "var(--lo-faint)", pointerEvents: "none" }}>🔍</span>
    <input
      value={rueSearch}
      onChange={function(e) { setRueSearch(e.target.value); }}
      placeholder="Rechercher une rue..."
      style={{ width: "100%", boxSizing: "border-box", paddingLeft: 36, paddingRight: 12, paddingTop: 10, paddingBottom: 10, fontSize: 14, border: "1.5px solid rgba(76,87,96,0.14)", borderRadius: 10, outline: "none", fontFamily: "inherit", background: "rgba(76,87,96,0.10)", color: "var(--lo-ink)" }}
    />
    {rueSearch && (
      <button onClick={function() { setRueSearch(""); }} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--lo-faint)", fontSize: 16, padding: 2 }}>×</button>
    )}
  </div>
  {rueFiltered.length === 0 ? (
    <div style={{ textAlign: "center", padding: "24px 0", color: "var(--lo-faint)", fontSize: 13 }}>Aucune rue trouvée</div>
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
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: i % 2 ? "rgba(76,87,96,0.05)" : "transparent", borderRadius: 8 }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--lo-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rue}</span>
                {relTime && <span style={{ fontSize: 11, color: "var(--lo-faint)", whiteSpace: "nowrap", flexShrink: 0 }}>{relTime}</span>}
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
              <div style={{ fontSize: 10, color: "var(--lo-faint)" }}>contrat{info.count > 1 ? "s" : ""}</div>
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
var jData = isTalc ? jachereTalc[sel] : jachere[sel];
var s = (isTalc ? statsTalc : stats).find(function(x) { return x.name === sel; });
var sorted = jData.communes.slice().sort(function(a, b) {
var ac = month ? (isTalc ? getTalcC(a, jData.dept, month) : getC(a, jData.dept, month)) : getCTotal(a, jData.dept, isTalc);
var bc = month ? (isTalc ? getTalcC(b, jData.dept, month) : getC(b, jData.dept, month)) : getCTotal(b, jData.dept, isTalc);
if (sortBy === "c") return bc - ac;
if (sortBy === "p") return b.p - a.p;
return (bc / (b.p || 1)) - (ac / (a.p || 1));
});
return (
<div>
<div className="secteurs-detail-header" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
<Btn v="ghost" onClick={function() { setSel(null); setSelSource(null); setCommuneSearch(""); setDormantFilter(0); }}>← Retour</Btn>
<h2 className="secteurs-detail-title" style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{sel}</h2>
{isTalc ? <Badge color="var(--lo-taupe)">TALC</Badge> : <Badge color={OP_COLORS.Free}>Stratygo</Badge>}
{!isTalc && DEPT_ZONES[jData.dept] && DEPT_ZONES[jData.dept].b && <Badge color={OP_COLORS.Bouygues}>Bouygues</Badge>}
<div className="secteurs-detail-select" style={{ marginLeft: "auto" }}><Sel value={month} onChange={setMonth} placeholder="Tous les mois" options={MONTHS_ORDER.map(function(m) { return { value: m, label: MONTHS_LABELS[m] }; })} style={{ minWidth: 140 }} /></div>
</div>
<div className="secteurs-stat-row" style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
<StatCard label="Communes" value={jData.communes.length} color="var(--lo-primary)" />
<StatCard label="Prises" value={s.tp.toLocaleString("fr-FR")} color="var(--lo-ink)" />
<StatCard label="Contrats" value={s.tc} color="var(--lo-accent)" />
<StatCard label="Taux" value={s.taux.toFixed(2) + "%"} color={s.taux > 0.5 ? "var(--lo-accent)" : "var(--lo-taupe)"} />
</div>
<Card className="secteurs-communes-card">
<div className="secteurs-communes-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
<h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, letterSpacing: -0.3, color: "var(--lo-ink)" }}>Communes</h3>
<div className="secteurs-sort-controls" style={{ display: "flex", gap: 6 }}>
<Btn s="sm" v={sortBy === "c" ? "primary" : "secondary"} onClick={function() { setSortBy("c"); }}>Contrats</Btn>
<Btn s="sm" v={sortBy === "p" ? "primary" : "secondary"} onClick={function() { setSortBy("p"); }}>Prises</Btn>
<Btn s="sm" v={sortBy === "t" ? "primary" : "secondary"} onClick={function() { setSortBy("t"); }}>Taux</Btn>
</div>
</div>
<div className="secteurs-dormant-filter" style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
<span style={{ fontSize: 12, color: "var(--lo-muted)", marginRight: 4 }}>Pas de prospection depuis :</span>
{[0,1,2,3,4,5,6].map(function(m) {
  var active = dormantFilter === m;
  return <Btn key={m} s="sm" v={active ? "primary" : "secondary"} onClick={function() { setDormantFilter(m); }}>{m === 0 ? "Tous" : m + " mois"}</Btn>;
})}
</div>
<div style={{ position: "relative", marginBottom: 16 }}>
  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "var(--lo-faint)", pointerEvents: "none" }}>🔍</span>
  <input
    value={communeSearch}
    onChange={function(e) { setCommuneSearch(e.target.value); }}
    placeholder="Rechercher une commune..."
    style={{ width: "100%", boxSizing: "border-box", paddingLeft: 36, paddingRight: 12, paddingTop: 10, paddingBottom: 10, fontSize: 14, border: "1.5px solid rgba(76,87,96,0.14)", borderRadius: 10, outline: "none", fontFamily: "inherit", background: "rgba(76,87,96,0.10)", color: "var(--lo-ink)" }}
  />
  {communeSearch && (
    <button onClick={function() { setCommuneSearch(""); }} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--lo-faint)", fontSize: 16, padding: 2 }}>×</button>
  )}
</div>
{(function() {
  var cq = communeSearch.trim().toUpperCase();
  var filtered = cq ? sorted.filter(function(c) { return c.v.indexOf(cq) >= 0; }) : sorted;
  if (dormantFilter > 0) {
    var cutoffIdx = MONTHS_ORDER.length - 1 - dormantFilter;
    filtered = filtered.filter(function(c) {
      var lmi = -1;
      for (var mi = MONTHS_ORDER.length - 1; mi >= 0; mi--) {
        var cnt = isTalc ? getTalcC(c, jData.dept, MONTHS_ORDER[mi]) : getC(c, jData.dept, MONTHS_ORDER[mi]);
        if (cnt > 0) { lmi = mi; break; }
      }
      return lmi < 0 || lmi <= cutoffIdx;
    });
  }
  return filtered;
})().map(function(c, i) {
var cc = month ? (isTalc ? getTalcC(c, jData.dept, month) : getC(c, jData.dept, month)) : getCTotal(c, jData.dept, isTalc);
var t = c.p ? (cc / c.p * 100) : 0;
var col = t > 0.8 ? "var(--lo-accent)" : t > 0.3 ? "var(--lo-taupe)" : cc === 0 ? "rgba(76,87,96,0.10)" : "var(--lo-danger)";
var lastMonthIdx = -1;
for (var mi = MONTHS_ORDER.length - 1; mi >= 0; mi--) {
  var cnt = isTalc ? getTalcC(c, jData.dept, MONTHS_ORDER[mi]) : getC(c, jData.dept, MONTHS_ORDER[mi]);
  if (cnt > 0) { lastMonthIdx = mi; break; }
}
var lpText = "";
var lpColor = "var(--lo-faint)";
if (lastMonthIdx < 0) {
  lpText = "Jamais prospectée";
  lpColor = "var(--lo-danger)";
} else {
  var monthsAgo = MONTHS_ORDER.length - 1 - lastMonthIdx;
  if (monthsAgo === 0) { lpText = "Prospecté ce mois"; lpColor = "var(--lo-accent)"; }
  else {
    lpText = "Dernier contrat il y a " + monthsAgo + " mois";
    lpColor = monthsAgo <= 1 ? "var(--lo-accent)" : monthsAgo <= 3 ? "var(--lo-taupe)" : "var(--lo-danger)";
  }
}
return (
<motion.div
key={c.v}
initial={{ opacity: 0, y: 10 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.25, delay: i * 0.04 }}
onClick={function() { setCommuneView({ commune: c, dept: jData.dept, isTalc: isTalc }); setRueSearch(""); }}
className="secteurs-commune-row"
style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: i % 2 ? "rgba(76,87,96,0.05)" : "transparent", borderRadius: 8, cursor: "pointer" }}
>
<div style={{ width: 24, textAlign: "center", fontSize: 12, fontWeight: 700, color: "var(--lo-faint)" }}>{i + 1}</div>
<div className="secteurs-commune-main" style={{ flex: 1 }}>
<div className="secteurs-commune-name-row" style={{ display: "flex", alignItems: "center", gap: 6 }}>
<span className="secteurs-commune-name" style={{ fontSize: 13, fontWeight: 600 }}>{c.v}</span>
<Badge color={c.z === "H" ? "var(--lo-danger)" : "var(--lo-primary)"}>{c.z === "H" ? "Haute" : "Std"}</Badge>
</div>
<div style={{ fontSize: 11, color: lpColor, marginTop: 2 }}>{lpText}</div>
<div style={{ marginTop: 4, height: 5, borderRadius: 3, background: "rgba(76,87,96,0.10)", overflow: "hidden" }}>
<div style={{ width: Math.min(t * 50, 100) + "%", height: "100%", borderRadius: 3, background: col }} />
</div>
</div>
<div className="secteurs-commune-count" style={{ textAlign: "right", minWidth: 70 }}>
<div style={{ fontSize: 14, fontWeight: 800, color: cc ? "var(--lo-ink)" : "rgba(76,87,96,0.24)" }}>{cc}</div>
<div style={{ fontSize: 10, color: "var(--lo-faint)" }}>{c.p.toLocaleString("fr-FR")} pr.</div>
</div>
<div className="secteurs-commune-rate" style={{ minWidth: 45, textAlign: "right" }}>
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
<div className="secteurs-overview-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
<div>
<h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: -0.4, color: "var(--lo-ink)" }}>Secteurs</h2>
<p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--lo-muted)" }}>{stats.length} secteurs Stratygo · {statsTalc.length} secteurs TALC</p>
</div>
<div className="secteurs-overview-select"><Sel value={month} onChange={setMonth} placeholder="Tous les mois" options={MONTHS_ORDER.map(function(m) { return { value: m, label: MONTHS_LABELS[m] }; })} style={{ minWidth: 150 }} /></div>
</div>
<div className="secteurs-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
{stats.concat(statsTalc).sort(function(a, b) { return b.tc - a.tc; }).map(function(j, i) {
var isTalcCard = j.source === "TALC";
var col = j.taux > 0.5 ? "var(--lo-accent)" : j.taux > 0.2 ? "var(--lo-taupe)" : "var(--lo-danger)";
return (
<motion.div
key={j.name}
initial={{ opacity: 0, y: 16 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.3, delay: i * 0.04 }}
>
<Card className="secteurs-card" onClick={function() { setSel(j.name); setSelSource(j.source); }} style={{ cursor: "pointer", padding: 18, border: "1px solid " + (isTalcCard ? "rgba(255,159,10,0.25)" : "rgba(76,87,96,0.14)") }}>
<div className="secteurs-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
<div className="secteurs-card-title-block">
<div className="secteurs-card-title" style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.3, color: "var(--lo-ink)" }}>{j.name}</div>
<div style={{ fontSize: 12, color: "var(--lo-faint)", marginTop: 2 }}>{j.communes.length} com. · {j.tp.toLocaleString("fr-FR")} prises</div>
</div>
<div style={{ display: "flex", gap: 4, alignItems: "center" }}>
{isTalcCard ? <Badge color="var(--lo-taupe)">TALC</Badge> : <Badge color="#6E6E73">Stratygo</Badge>}
<Badge color={col}>{j.taux.toFixed(2)}%</Badge>
</div>
</div>
<div style={{ height: 8, borderRadius: 4, background: "rgba(76,87,96,0.10)", overflow: "hidden", marginBottom: 8 }}>
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
