import React, { useState, useMemo } from "react";
import { Badge, Card, Btn, Sel, Inp, Modal, StatCard } from "./ui.jsx";
import { statusColor, isCaduque } from "../helpers/status.js";
import { resolveVTA } from "../helpers/resolution.js";
import { VTA_GROUPS } from "../constants/vta.js";
import { ROLE_COLORS, OP_COLORS } from "../constants/roles.js";
import { MONTHS_ORDER, MONTHS_LABELS, _ML_KEYS, _ML_FULL } from "../helpers/carnet.js";

function ContractsTab({ contracts, team, dailyPlan, cars, saveContracts }) {
var _dp = dailyPlan ? (dailyPlan[new Date().toISOString().split("T")[0]] || {}) : {};
const [view, setView] = useState(null); // null | "today" | "week" | "month" | "quality"
const [fD, setFD] = useState("");
const [fC, setFC] = useState("");
const [fO, setFO] = useState("");
const [fS, setFS] = useState("");
const [showAll, setShowAll] = useState(false);
const [qCom, setQCom] = useState(null); // selected commercial in quality detail
const [qFrom, setQFrom] = useState("");
const [qTo, setQTo] = useState("");
const [selectedCom, setSelectedCom] = useState(null); // recap commercial
const [comFrom, setComFrom] = useState("");
const [comTo, setComTo] = useState("");

// ── shared helpers ──────────────────────────────────────────────────────────
var pendingVTA = contracts.filter(function(c) { return c.vtaCode && !c.vtaResolved; });
function resolveAllVTA() {
  var updated = contracts.map(function(c) {
    if (!c.vtaCode || c.vtaResolved) return c;
    var group = VTA_GROUPS[c.vtaCode];
    if (!group) return Object.assign({}, c, { vtaResolved: true });
    var resolved = c.commercial;
    var cPlan = dailyPlan ? (dailyPlan[c.date] || _dp) : _dp;
    // Priorité 1 : codes VTA assignés manuellement
    var manualMatch = [];
    Object.values(cPlan).forEach(function(entry) {
      if (entry && entry.memberVtaCodes) {
        Object.keys(entry.memberVtaCodes).forEach(function(mid) {
          if (entry.memberVtaCodes[mid] === c.vtaCode) {
            var m = team.find(function(t) { return t.id === parseInt(mid); });
            if (m) manualMatch.push(m.name);
          }
        });
      }
    });
    if (manualMatch.length === 1) resolved = manualMatch[0];
    else {
      // Priorité 2 : présence dans le plan
      var presentIds = [];
      Object.values(cPlan).forEach(function(entry) { if (entry && entry.members) presentIds = presentIds.concat(entry.members); });
      var presentNames = presentIds.map(function(id) { var m = team.find(function(t) { return t.id === id; }); return m ? m.name : null; }).filter(Boolean);
      var inGroup = group.filter(function(name) { return presentNames.indexOf(name) >= 0; });
      if (inGroup.length === 1) resolved = inGroup[0];
    }
    return Object.assign({}, c, { commercial: resolved, vtaResolved: true });
  });
  saveContracts(updated);
}

var COM_PALETTE = ["#0071E3","#34C759","#FF9F0A","#AF52DE","#FF3B30","#5AC8FA","#FF2D55","#5856D6","#32ADE6","#FF6961"];
var comColorCache = {};
var comColorI = 0;
var allComs = Array.from(new Set(contracts.map(function(c) { return c.commercial; }))).sort();
function comColor(name) {
  if (!comColorCache[name]) comColorCache[name] = COM_PALETTE[comColorI++ % COM_PALETTE.length];
  return comColorCache[name];
}
allComs.forEach(function(n) { comColor(n); });

function topComs(list) {
  var counts = {};
  list.forEach(function(c) { counts[c.commercial] = (counts[c.commercial] || 0) + 1; });
  return Object.entries(counts).sort(function(a,b) { return b[1] - a[1]; });
}

function CRow(c, i) {
  var col = comColor(c.commercial);
  var initials = c.commercial.split(" ").map(function(w){ return w[0]; }).slice(0,2).join("").toUpperCase();
  var sCol = statusColor(c.status);
  return (
    <div key={c.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 16px", borderTop: i > 0 ? "1px solid rgba(0,0,0,0.05)" : "none" }}>
      <div style={{ width:34, height:34, borderRadius:99, background:col+"20", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
        <span style={{ fontSize:11, fontWeight:800, color:col }}>{initials}</span>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
          <span style={{ fontSize:13, fontWeight:700, color:col }}>{c.commercial.split(" ")[0]}</span>
          {c.vtaCode && !c.vtaResolved && <span style={{ fontSize:10, fontWeight:700, color:"#FF9F0A", background:"#FF9F0A18", borderRadius:4, padding:"1px 5px" }}>VTA?</span>}
          <span style={{ fontSize:11, color:"#AEAEB2" }}>{c.heure}</span>
        </div>
        <div style={{ fontSize:13, fontWeight:600, color:"#1D1D1F", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
          {c.ville}{c.rue ? <span style={{ fontWeight:400, color:"#6E6E73" }}> · {c.rue}</span> : ""}
        </div>
      </div>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0 }}>
        <Badge color={sCol}>{c.status}</Badge>
        {c.box && <span style={{ fontSize:10, color:"#AEAEB2" }}>{c.box}</span>}
      </div>
    </div>
  );
}

function CList(list) {
  return <Card style={{ padding:0, overflow:"hidden" }}>{list.map(function(c,i){ return CRow(c,i); })}</Card>;
}

// ── date ranges ──────────────────────────────────────────────────────────────
var now = new Date();
var todayStr = now.toISOString().split("T")[0];
var yest = new Date(now); yest.setDate(now.getDate()-1);
var yestStr = yest.toISOString().split("T")[0];

var dow = now.getDay(); var dFromMon = dow === 0 ? 6 : dow - 1;
var wkStart = new Date(now); wkStart.setDate(now.getDate() - dFromMon);
var wkStartStr = wkStart.toISOString().split("T")[0];
var lwStart = new Date(wkStart); lwStart.setDate(wkStart.getDate()-7);
var lwSameEnd = new Date(lwStart); lwSameEnd.setDate(lwStart.getDate()+dFromMon);
var lwStartStr = lwStart.toISOString().split("T")[0];
var lwSameEndStr = lwSameEnd.toISOString().split("T")[0];

var moStart = new Date(now.getFullYear(), now.getMonth(), 1);
var moStartStr = moStart.toISOString().split("T")[0];
var pmStart = new Date(now.getFullYear(), now.getMonth()-1, 1);
var pmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
var pmStartStr = pmStart.toISOString().split("T")[0];
var pmEndStr = pmEnd.toISOString().split("T")[0];

var todayC   = contracts.filter(function(c){ return c.date === todayStr && !isCaduque(c); });
var yestC    = contracts.filter(function(c){ return c.date === yestStr && !isCaduque(c); });
var weekC    = contracts.filter(function(c){ return c.date >= wkStartStr && c.date <= todayStr && !isCaduque(c); });
var lwC      = contracts.filter(function(c){ return c.date >= lwStartStr && c.date <= lwSameEndStr && !isCaduque(c); });
var monthC   = contracts.filter(function(c){ return c.date >= moStartStr && c.date <= todayStr && !isCaduque(c); });
var prevMonC = contracts.filter(function(c){ return c.date >= pmStartStr && c.date <= pmEndStr && !isCaduque(c); });

function delta(a, b) {
  var d = a - b; if (d === 0) return null;
  return <span style={{ fontSize:12, fontWeight:700, color: d>0?"#34C759":"#FF3B30" }}>{d>0?"+":""}{d}</span>;
}

// ── DETAIL VIEWS ─────────────────────────────────────────────────────────────
if (view === "today") {
  // Build passengerIds for today
  var todayPassIds = new Set();
  if (dailyPlan && cars) {
    cars.forEach(function(car) {
      var cp = _dp[car.id];
      if (cp && cp.members) cp.members.forEach(function(id) { todayPassIds.add(id); });
    });
  }
  function isCarInactiveT(car) { return car.driverId ? todayPassIds.has(car.driverId) : false; }
  function getCarMembersT(car) {
    var ms = [];
    if (car.driverId) { var drv = team.find(function(m){ return m.id === car.driverId; }); if (drv) ms.push(drv); }
    var cp = _dp[car.id] || null;
    if (cp && cp.members) cp.members.forEach(function(id) { var m = team.find(function(t){ return t.id === id; }); if (m) ms.push(m); });
    return ms;
  }
  function personCountT(name) { return todayC.filter(function(c){ return c.commercial === name; }).length; }
  function memberCommuneT(car, memberId) {
    if (!_dp[car.id]) return "";
    return (_dp[car.id].memberCommunes || {})[memberId] || "";
  }
  function carTotalT(car) {
    return getCarMembersT(car).reduce(function(sum, m){ return sum + personCountT(m.name); }, 0);
  }
  // Find which car a driver rides in (for inactive display)
  function ridingInCarT(driverId) {
    if (!cars) return null;
    var found = cars.find(function(car) {
      var cp = _dp[car.id];
      return cp && cp.members && cp.members.indexOf(driverId) >= 0;
    });
    return found || null;
  }
  var carsToShow = cars ? cars.filter(function(car) { return getCarMembersT(car).length > 0; }) : [];

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <Btn v="ghost" onClick={function(){ setView(null); }}>← Retour</Btn>
        <h2 style={{ margin:0, fontSize:20, fontWeight:800 }}>Aujourd'hui</h2>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginLeft:"auto" }}>
          {delta(todayC.length, yestC.length)}
          <span style={{ fontSize:12, color:"#AEAEB2" }}>vs hier ({yestC.length})</span>
        </div>
      </div>
      {!dailyPlan || carsToShow.length === 0 ? (
        <Card><div style={{ textAlign:"center", padding:40, color:"#AEAEB2" }}>Plan voitures non configuré</div></Card>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {carsToShow.map(function(car) {
            var inactive = isCarInactiveT(car);
            var members = getCarMembersT(car);
            var total = carTotalT(car);
            var ridingIn = inactive && car.driverId ? ridingInCarT(car.driverId) : null;
            return (
              <Card key={car.id} style={{ padding:0, overflow:"hidden", opacity: inactive ? 0.55 : 1 }}>
                <div style={{ padding:"12px 16px", background:"#F5F5F7", display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:14, fontWeight:700, color:"#1D1D1F" }}>{car.name}</span>
                  {inactive && (
                    <span style={{ fontSize:11, color:"#FF9F0A", fontWeight:600 }}>
                      {ridingIn ? "en voiture avec " + ridingIn.name : "inactive"}
                    </span>
                  )}
                  <div style={{ marginLeft:"auto", background: total > 0 ? "#0071E3" : "#E5E5EA", color: total > 0 ? "#fff" : "#AEAEB2", borderRadius:99, fontSize:13, fontWeight:800, padding:"2px 12px", minWidth:28, textAlign:"center" }}>{total}</div>
                </div>
                {members.map(function(m, i) {
                  var count = personCountT(m.name);
                  var commune = memberCommuneT(car, m.id);
                  var col = comColor(m.name);
                  var initials = m.name.split(" ").map(function(w){ return w[0]; }).slice(0,2).join("").toUpperCase();
                  var isDriver = car.driverId === m.id;
                  return (
                    <div key={m.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 16px", borderTop: i > 0 ? "1px solid rgba(0,0,0,0.05)" : "none" }}>
                      <div style={{ width:36, height:36, borderRadius:99, background:col+"20", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, position:"relative" }}>
                        <span style={{ fontSize:11, fontWeight:800, color:col }}>{initials}</span>
                        {isDriver && <div style={{ position:"absolute", bottom:-2, right:-2, width:12, height:12, borderRadius:99, background:"#FF9F0A", border:"2px solid #fff", display:"flex", alignItems:"center", justifyContent:"center" }}><span style={{ fontSize:7, color:"#fff" }}>🚗</span></div>}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:"#1D1D1F" }}>{m.name}</div>
                        {commune && <div style={{ fontSize:12, color:"#AEAEB2", marginTop:1 }}>{commune}</div>}
                      </div>
                      <div style={{ fontSize:22, fontWeight:800, color: count > 0 ? col : "#D1D1D6", minWidth:28, textAlign:"right" }}>{count}</div>
                    </div>
                  );
                })}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

if (view === "week") {
  // Build daily counts for Mon → today
  var weekDays = [];
  for (var wi = 0; wi <= dFromMon; wi++) {
    var wd = new Date(wkStart); wd.setDate(wkStart.getDate()+wi);
    var wdStr = wd.toISOString().split("T")[0];
    var wdCount = weekC.filter(function(c){ return c.date === wdStr; }).length;
    weekDays.push({ date: wdStr, label: wd.toLocaleDateString("fr-FR",{weekday:"short"}), count: wdCount });
  }
  var maxWd = Math.max.apply(null, weekDays.map(function(d){ return d.count; })) || 1;
  var bestDay = weekDays.reduce(function(best, d){ return d.count > best.count ? d : best; }, weekDays[0] || { count:0 });
  var comRankW = topComs(weekC);

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <Btn v="ghost" onClick={function(){ setView(null); }}>← Retour</Btn>
        <h2 style={{ margin:0, fontSize:20, fontWeight:800 }}>Cette semaine</h2>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginLeft:"auto" }}>
          {delta(weekC.length, lwC.length)}
          <span style={{ fontSize:12, color:"#AEAEB2" }}>vs sem. préc. ({lwC.length})</span>
        </div>
      </div>
      <div style={{ display:"flex", gap:12, marginBottom:20, flexWrap:"wrap" }}>
        <StatCard label="Contrats" value={weekC.length} color="#0071E3" />
        <StatCard label="Moy./jour" value={(weekC.length/(dFromMon+1||1)).toFixed(1)} color="#5856D6" />
        <StatCard label="Meilleur jour" value={bestDay.count + " (" + bestDay.label + ")"} color="#34C759" />
      </div>
      {/* Day bar chart */}
      <Card style={{ marginBottom:16, padding:20 }}>
        <h3 style={{ margin:"0 0 16px", fontSize:14, fontWeight:700 }}>Par jour</h3>
        <div style={{ display:"flex", alignItems:"flex-end", gap:8, height:80 }}>
          {weekDays.map(function(d) {
            var h = Math.max(d.count/maxWd*60, d.count>0?6:2);
            var isToday = d.date === todayStr;
            return (
              <div key={d.date} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                <div style={{ fontSize:12, fontWeight:800, color: d.count>0?"#1D1D1F":"#E5E5EA" }}>{d.count||""}</div>
                <div style={{ width:"100%", height:60, display:"flex", alignItems:"flex-end" }}>
                  <div style={{ width:"100%", height:h, borderRadius:"4px 4px 0 0", background: isToday?"#0071E3":"#34C759" }} />
                </div>
                <div style={{ fontSize:10, color: isToday?"#0071E3":"#AEAEB2", fontWeight: isToday?700:400, textTransform:"capitalize" }}>{d.label}</div>
              </div>
            );
          })}
        </div>
      </Card>
      {/* Top commerciaux */}
      {comRankW.length > 0 && (
        <Card style={{ marginBottom:16, padding:20 }}>
          <h3 style={{ margin:"0 0 14px", fontSize:14, fontWeight:700 }}>Classement semaine</h3>
          {comRankW.slice(0,5).map(function(entry, i) {
            var col = comColor(entry[0]);
            var pct = entry[1] / (comRankW[0][1]||1) * 100;
            return (
              <div key={entry[0]} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                <div style={{ width:22, fontSize:12, fontWeight:700, color:"#AEAEB2", textAlign:"center" }}>{i+1}</div>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <span style={{ fontSize:13, fontWeight:600 }}>{entry[0]}</span>
                    <span style={{ fontSize:13, fontWeight:800, color:col }}>{entry[1]}</span>
                  </div>
                  <div style={{ height:5, borderRadius:3, background:"#F5F5F7" }}>
                    <div style={{ width:pct+"%", height:"100%", borderRadius:3, background:col }} />
                  </div>
                </div>
              </div>
            );
          })}
        </Card>
      )}
      {weekC.length === 0
        ? <Card><div style={{ textAlign:"center", padding:40, color:"#AEAEB2" }}>Aucun contrat cette semaine</div></Card>
        : CList(weekC.slice().sort(function(a,b){ return (b.date+(b.heure||"")).localeCompare(a.date+(a.heure||"")); }))
      }
    </div>
  );
}

if (view === "month") {
  var comRankM = topComs(monthC);
  // Group by week number within month
  var weekGroups = {};
  monthC.forEach(function(c) {
    var d = new Date(c.date + "T12:00:00");
    var w = Math.ceil(d.getDate() / 7);
    var key = "Semaine " + w;
    if (!weekGroups[key]) weekGroups[key] = [];
    weekGroups[key].push(c);
  });
  var moName = now.toLocaleDateString("fr-FR", { month:"long", year:"numeric" });

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <Btn v="ghost" onClick={function(){ setView(null); }}>← Retour</Btn>
        <h2 style={{ margin:0, fontSize:20, fontWeight:800, textTransform:"capitalize" }}>{moName}</h2>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginLeft:"auto" }}>
          {delta(monthC.length, prevMonC.length)}
          <span style={{ fontSize:12, color:"#AEAEB2" }}>vs mois préc. ({prevMonC.length})</span>
        </div>
      </div>
      <div style={{ display:"flex", gap:12, marginBottom:20, flexWrap:"wrap" }}>
        <StatCard label="Contrats" value={monthC.length} color="#0071E3" />
        <StatCard label="Mois précédent" value={prevMonC.length} color="#AEAEB2" />
        <StatCard label="Actifs ce mois" value={new Set(monthC.map(function(c){return c.commercial;})).size} color="#AF52DE" />
      </div>
      {/* Commercial ranking */}
      <Card style={{ marginBottom:16, padding:20 }}>
        <h3 style={{ margin:"0 0 14px", fontSize:14, fontWeight:700 }}>Classement du mois</h3>
        {comRankM.length === 0 && <div style={{ color:"#AEAEB2", fontSize:13 }}>Aucun contrat</div>}
        {comRankM.map(function(entry, i) {
          var col = comColor(entry[0]);
          var pct = entry[1] / (comRankM[0][1]||1) * 100;
          var medal = i===0?"🥇":i===1?"🥈":i===2?"🥉":null;
          return (
            <div key={entry[0]} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
              <div style={{ width:22, fontSize:13, textAlign:"center" }}>{medal || <span style={{ fontSize:12, color:"#AEAEB2", fontWeight:700 }}>{i+1}</span>}</div>
              <div style={{ width:32, height:32, borderRadius:99, background:col+"20", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <span style={{ fontSize:11, fontWeight:800, color:col }}>{entry[0].split(" ").map(function(w){return w[0];}).slice(0,2).join("").toUpperCase()}</span>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                  <span style={{ fontSize:13, fontWeight:600 }}>{entry[0]}</span>
                  <span style={{ fontSize:14, fontWeight:800, color:col }}>{entry[1]}</span>
                </div>
                <div style={{ height:6, borderRadius:3, background:"#F5F5F7" }}>
                  <div style={{ width:pct+"%", height:"100%", borderRadius:3, background:col }} />
                </div>
              </div>
            </div>
          );
        })}
      </Card>
      {/* By week */}
      {Object.keys(weekGroups).sort().map(function(wk) {
        var wItems = weekGroups[wk].slice().sort(function(a,b){ return (b.date+(b.heure||"")).localeCompare(a.date+(a.heure||"")); });
        return (
          <div key={wk} style={{ marginBottom:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8, paddingLeft:4 }}>
              <span style={{ fontSize:13, fontWeight:700, color:"#1D1D1F" }}>{wk}</span>
              <span style={{ fontSize:12, color:"#AEAEB2" }}>{wItems.length} contrat{wItems.length>1?"s":""}</span>
            </div>
            {CList(wItems)}
          </div>
        );
      })}
      {monthC.length === 0 && <Card><div style={{ textAlign:"center", padding:40, color:"#AEAEB2" }}>Aucun contrat ce mois</div></Card>}
    </div>
  );
}

if (view === "quality") {
  function isBranche(c) { return c.status && (c.status === "Branché" || c.status === "Branché VRF"); }
  function isRdv(c) { return c.status && (c.status === "RDV pris" || c.status === "RDV pris J+7"); }
  function isAnnule(c) { return c.status === "Annulé" || c.status === "Résilié"; }

  // ── Date filtering ──────────────────────────────────────────────────────────
  var qContracts = contracts.filter(function(c) {
    if (qFrom && c.date < qFrom) return false;
    if (qTo && c.date > qTo) return false;
    return true;
  });

  var presetBtn = function(label, from, to) {
    var active = qFrom === from && qTo === to;
    return (
      <button key={label} onClick={function(){ setQFrom(from); setQTo(to); }} style={{
        padding:"5px 12px", borderRadius:20, border:"1px solid " + (active ? "#0071E3" : "#E5E5EA"),
        background: active ? "#0071E3" : "#fff", color: active ? "#fff" : "#1D1D1F",
        fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit"
      }}>{label}</button>
    );
  };

  var dateInputStyle = {
    padding:"5px 10px", borderRadius:8, border:"1px solid #E5E5EA", fontSize:12,
    fontFamily:"inherit", color:"#1D1D1F", background:"#fff", cursor:"pointer"
  };

  var DateRangeBar = (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16, flexWrap:"wrap" }}>
      {presetBtn("Tout", "", "")}
      {presetBtn("Cette semaine", wkStartStr, todayStr)}
      {presetBtn("Ce mois", moStartStr, todayStr)}
      <div style={{ display:"flex", alignItems:"center", gap:6, marginLeft:"auto" }}>
        <input type="date" value={qFrom} onChange={function(e){ setQFrom(e.target.value); }} style={dateInputStyle} />
        <span style={{ fontSize:12, color:"#AEAEB2" }}>→</span>
        <input type="date" value={qTo} onChange={function(e){ setQTo(e.target.value); }} style={dateInputStyle} />
      </div>
    </div>
  );

  // ── Metrics ─────────────────────────────────────────────────────────────────
  var totalQ = qContracts.length || 1;
  var branchesQ = qContracts.filter(isBranche).length;
  var rdvQ = qContracts.filter(isRdv).length;
  var attenteQ = qContracts.filter(function(c){ return c.status === "En attente RDV"; }).length;
  var annulesQ = qContracts.filter(isAnnule).length;
  var tauxGlobalQ = ((branchesQ + rdvQ) / totalQ * 100).toFixed(1);
  var tauxBrancheQ = (branchesQ / totalQ * 100).toFixed(1);
  var tauxRdvQ = (rdvQ / totalQ * 100).toFixed(1);
  var tauxAttenteQ = (attenteQ / totalQ * 100).toFixed(1);
  var tauxAnnuleQ = (annulesQ / totalQ * 100).toFixed(1);

  var comNamesQ = Array.from(new Set(qContracts.map(function(c){ return c.commercial; }))).sort();
  var comStatsQ = comNamesQ.map(function(name) {
    var cc = qContracts.filter(function(c){ return c.commercial === name; });
    var tot = cc.length || 1;
    var br = cc.filter(isBranche).length;
    var rd = cc.filter(isRdv).length;
    var at = cc.filter(function(c){ return c.status === "En attente RDV"; }).length;
    var an = cc.filter(isAnnule).length;
    return { name: name, total: cc.length, br: br, rd: rd, at: at, an: an,
      tGlobal: (br + rd) / tot * 100, tBr: br / tot * 100, tRd: rd / tot * 100, tAt: at / tot * 100, tAn: an / tot * 100,
      contracts: cc };
  }).sort(function(a,b){ return b.total - a.total; });

  // ── Detail: one commercial ──────────────────────────────────────────────────
  if (qCom) {
    var cs = comStatsQ.find(function(s){ return s.name === qCom; });
    if (!cs) { setQCom(null); return null; }
    var qualColor = cs.tGlobal >= 60 ? "#34C759" : cs.tGlobal >= 35 ? "#FF9F0A" : "#FF3B30";
    return (
      <div>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
          <Btn v="ghost" onClick={function(){ setQCom(null); }}>← Retour</Btn>
          <div style={{ width:36, height:36, borderRadius:99, background:comColor(cs.name)+"20", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <span style={{ fontSize:12, fontWeight:800, color:comColor(cs.name) }}>{cs.name.split(" ").map(function(w){ return w[0]; }).slice(0,2).join("").toUpperCase()}</span>
          </div>
          <h2 style={{ margin:0, fontSize:20, fontWeight:800 }}>{cs.name}</h2>
          <div style={{ marginLeft:"auto", fontSize:28, fontWeight:800, color:qualColor }}>{cs.tGlobal.toFixed(0)}%</div>
        </div>
        {DateRangeBar}
        <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
          {[
            { label:"Total", val:cs.total, col:"#1D1D1F" },
            { label:"Branchés", val:cs.br, col:"#34C759" },
            { label:"RDV Pris", val:cs.rd, col:"#1A7A3F" },
            { label:"En attente", val:cs.at, col:"#FF9F0A" },
            { label:"Annulés", val:cs.an, col:"#FF3B30" },
          ].map(function(item) {
            return (
              <Card key={item.label} style={{ flex:1, minWidth:80, padding:14, textAlign:"center" }}>
                <div style={{ fontSize:10, fontWeight:600, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>{item.label}</div>
                <div style={{ fontSize:28, fontWeight:800, color:item.col }}>{item.val}</div>
              </Card>
            );
          })}
        </div>
        <Card style={{ marginBottom:16, padding:20 }}>
          {[
            { label:"Taux branchement", sub:"qualité long terme", val:cs.tBr, col:"#34C759" },
            { label:"Taux RDV", sub:"qualité hebdomadaire", val:cs.tRd, col:"#1A7A3F" },
            { label:"En attente RDV", sub:"pipeline en cours", val:cs.tAt, col:"#FF9F0A" },
            { label:"Taux annulation", sub:"rétractations", val:cs.tAn, col:"#FF3B30" },
          ].map(function(item) {
            return (
              <div key={item.label} style={{ marginBottom:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6 }}>
                  <div>
                    <span style={{ fontSize:13, fontWeight:700 }}>{item.label}</span>
                    <span style={{ fontSize:11, color:"#AEAEB2", marginLeft:6 }}>{item.sub}</span>
                  </div>
                  <span style={{ fontSize:16, fontWeight:800, color:item.col }}>{item.val.toFixed(1)}%</span>
                </div>
                <div style={{ height:8, borderRadius:4, background:"#F5F5F7" }}>
                  <div style={{ width:Math.min(item.val,100)+"%", height:"100%", borderRadius:4, background:item.col }} />
                </div>
              </div>
            );
          })}
        </Card>
        {CList(cs.contracts.slice().sort(function(a,b){ return (b.date+(b.heure||"")).localeCompare(a.date+(a.heure||"")); }))}
      </div>
    );
  }

  // ── Overview ────────────────────────────────────────────────────────────────
  var globalQualCol = parseFloat(tauxGlobalQ) >= 60 ? "#34C759" : parseFloat(tauxGlobalQ) >= 35 ? "#FF9F0A" : "#FF3B30";
  var annuleCol = parseFloat(tauxAnnuleQ) > 15 ? "#FF3B30" : parseFloat(tauxAnnuleQ) > 8 ? "#FF9F0A" : "#34C759";
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <Btn v="ghost" onClick={function(){ setView(null); }}>← Retour</Btn>
        <h2 style={{ margin:0, fontSize:20, fontWeight:800 }}>Qualité</h2>
        <span style={{ fontSize:12, color:"#AEAEB2", marginLeft:4 }}>{qContracts.length} contrat{qContracts.length > 1 ? "s" : ""}</span>
      </div>
      {DateRangeBar}

      {/* Global metrics */}
      <div style={{ display:"flex", gap:12, marginBottom:24, flexWrap:"wrap" }}>
        <Card style={{ flex:2, minWidth:220, padding:20 }}>
          <div style={{ fontSize:11, fontWeight:600, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.5, marginBottom:8 }}>Qualité globale agence</div>
          <div style={{ fontSize:48, fontWeight:800, letterSpacing:-2, color:globalQualCol, lineHeight:1, marginBottom:14 }}>{tauxGlobalQ}%</div>
          <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
            <div>
              <div style={{ fontSize:10, color:"#AEAEB2", fontWeight:600, textTransform:"uppercase", letterSpacing:0.3, marginBottom:2 }}>Branchement</div>
              <div style={{ fontSize:18, fontWeight:800, color:"#34C759" }}>{tauxBrancheQ}%</div>
              <div style={{ fontSize:11, color:"#AEAEB2" }}>{branchesQ} contrats</div>
            </div>
            <div style={{ width:1, background:"#F0F0F0" }} />
            <div>
              <div style={{ fontSize:10, color:"#AEAEB2", fontWeight:600, textTransform:"uppercase", letterSpacing:0.3, marginBottom:2 }}>RDV pris</div>
              <div style={{ fontSize:18, fontWeight:800, color:"#1A7A3F" }}>{tauxRdvQ}%</div>
              <div style={{ fontSize:11, color:"#AEAEB2" }}>{rdvQ} contrats</div>
            </div>
            <div style={{ width:1, background:"#F0F0F0" }} />
            <div>
              <div style={{ fontSize:10, color:"#AEAEB2", fontWeight:600, textTransform:"uppercase", letterSpacing:0.3, marginBottom:2 }}>En attente</div>
              <div style={{ fontSize:18, fontWeight:800, color:"#FF9F0A" }}>{tauxAttenteQ}%</div>
              <div style={{ fontSize:11, color:"#AEAEB2" }}>{attenteQ} contrats</div>
            </div>
          </div>
        </Card>
        <Card style={{ flex:1, minWidth:120, padding:20, textAlign:"center", display:"flex", flexDirection:"column", justifyContent:"center" }}>
          <div style={{ fontSize:11, fontWeight:600, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.5, marginBottom:8 }}>Taux annulation</div>
          <div style={{ fontSize:42, fontWeight:800, letterSpacing:-2, color:annuleCol, lineHeight:1 }}>{tauxAnnuleQ}%</div>
          <div style={{ fontSize:12, color:"#AEAEB2", marginTop:8 }}>{annulesQ} contrat{annulesQ > 1 ? "s" : ""}</div>
        </Card>
        {pendingVTA.length > 0 && (
          <Card style={{ flex:1, minWidth:110, padding:16, textAlign:"center", cursor:"pointer", border:"2px solid #FF9F0A30" }} onClick={resolveAllVTA}>
            <div style={{ fontSize:11, fontWeight:600, color:"#FF9F0A", textTransform:"uppercase", letterSpacing:0.5, marginBottom:6 }}>VTA à résoudre</div>
            <div style={{ fontSize:32, fontWeight:800, letterSpacing:-1, color:"#FF9F0A" }}>{pendingVTA.length}</div>
            <div style={{ fontSize:11, color:"#FF9F0A", marginTop:4 }}>Appuyer pour résoudre</div>
          </Card>
        )}
      </div>

      {/* Per-commercial quality */}
      <div style={{ fontSize:13, fontWeight:700, color:"#1D1D1F", marginBottom:12 }}>Qualité par commercial</div>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {comStatsQ.map(function(cs) {
          var col = comColor(cs.name);
          var initials = cs.name.split(" ").map(function(w){ return w[0]; }).slice(0,2).join("").toUpperCase();
          var qCol = cs.tGlobal >= 60 ? "#34C759" : cs.tGlobal >= 35 ? "#FF9F0A" : "#FF3B30";
          return (
            <Card key={cs.name} onClick={function(){ setQCom(cs.name); }} style={{ padding:"14px 16px", cursor:"pointer" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
                <div style={{ width:36, height:36, borderRadius:99, background:col+"20", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <span style={{ fontSize:11, fontWeight:800, color:col }}>{initials}</span>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:"#1D1D1F" }}>{cs.name}</div>
                  <div style={{ fontSize:11, color:"#AEAEB2" }}>{cs.total} contrat{cs.total > 1 ? "s" : ""}</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:22, fontWeight:800, color:qCol, lineHeight:1 }}>{cs.tGlobal.toFixed(0)}%</div>
                  <div style={{ fontSize:10, color:"#AEAEB2", fontWeight:600, marginTop:2 }}>qualité</div>
                </div>
              </div>
              <div style={{ display:"flex", gap:10 }}>
                {[
                  { label:"Branché", val:cs.tBr, count:cs.br, col:"#34C759" },
                  { label:"RDV", val:cs.tRd, count:cs.rd, col:"#1A7A3F" },
                  { label:"Attente", val:cs.tAt, count:cs.at, col:"#FF9F0A" },
                  { label:"Annulé", val:cs.tAn, count:cs.an, col:"#FF3B30" },
                ].map(function(item) {
                  return (
                    <div key={item.label} style={{ flex:1 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                        <span style={{ fontSize:10, color:"#AEAEB2", fontWeight:600 }}>{item.label}</span>
                        <span style={{ fontSize:10, fontWeight:700, color:item.col }}>{item.count} · {item.val.toFixed(0)}%</span>
                      </div>
                      <div style={{ height:4, borderRadius:2, background:"#F5F5F7" }}>
                        <div style={{ width:Math.min(item.val,100)+"%", height:"100%", borderRadius:2, background:item.col }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── RECAP COMMERCIAL ─────────────────────────────────────────────────────────
if (view === "commercial") {
  function isBrC(c) { return c.status && (c.status === "Branché" || c.status === "Branché VRF"); }
  function isRdC(c) { return c.status && (c.status === "RDV pris" || c.status === "RDV pris J+7"); }
  function isAnC(c) { return c.status === "Annulé" || c.status === "Résilié"; }

  var comNamesRC = Array.from(new Set(contracts.map(function(c){ return c.commercial; }))).sort();
  var comStatsRC = comNamesRC.map(function(name) {
    var cc = contracts.filter(function(c){ return c.commercial === name; });
    var weekCC = cc.filter(function(c){ return c.date >= wkStartStr && c.date <= todayStr; });
    var monthCC = cc.filter(function(c){ return c.date >= moStartStr && c.date <= todayStr; });
    var tot = cc.length || 1;
    var br = cc.filter(isBrC).length;
    var rd = cc.filter(isRdC).length;
    var at = cc.filter(function(c){ return c.status === "En attente RDV"; }).length;
    var an = cc.filter(isAnC).length;
    var activeDates = Array.from(new Set(cc.map(function(c){ return c.date; }))).sort(function(a,b){ return b.localeCompare(a); });
    var villeCount = {};
    cc.forEach(function(c){ if (c.ville) villeCount[c.ville] = (villeCount[c.ville]||0)+1; });
    var topVilles = Object.entries(villeCount).sort(function(a,b){ return b[1]-a[1]; }).slice(0,3);
    var boxCount = {};
    cc.forEach(function(c){ if (c.box) boxCount[c.box] = (boxCount[c.box]||0)+1; });
    var last6 = MONTHS_ORDER.slice(-6);
    var monthlyData = last6.map(function(mk) {
      var mIdx = _ML_KEYS.indexOf(mk.slice(0,-2));
      var yr = parseInt("20" + mk.slice(-2));
      var cnt = cc.filter(function(c) {
        if (!c.date) return false;
        var d = new Date(c.date + "T12:00:00");
        return d.getFullYear() === yr && d.getMonth() === mIdx;
      }).length;
      return { mk: mk, label: _ML_FULL[mIdx], count: cnt };
    });
    return {
      name: name, total: cc.length, weekTotal: weekCC.length, monthTotal: monthCC.length,
      activeDays: activeDates.length, lastDate: activeDates[0] || null,
      br: br, rd: rd, at: at, an: an,
      tBr: br/tot*100, tRd: rd/tot*100, tAt: at/tot*100, tAn: an/tot*100,
      tGlobal: (br+rd)/tot*100, topVilles: topVilles, boxCount: boxCount, monthlyData: monthlyData,
    };
  }).sort(function(a,b){ return b.total - a.total; });

  // ── DETAIL ──
  if (selectedCom) {
    var csdBase = comStatsRC.find(function(s){ return s.name === selectedCom; });
    if (!csdBase) { setSelectedCom(null); return null; }

    // Filtered contracts for this commercial + date range
    var ccF = contracts.filter(function(c) {
      if (c.commercial !== selectedCom) return false;
      if (comFrom && c.date < comFrom) return false;
      if (comTo && c.date > comTo) return false;
      return true;
    });
    var weekCCF = ccF.filter(function(c){ return c.date >= wkStartStr && c.date <= todayStr; });
    var monthCCF = ccF.filter(function(c){ return c.date >= moStartStr && c.date <= todayStr; });
    var totF = ccF.length || 1;
    var brF = ccF.filter(isBrC).length;
    var rdF = ccF.filter(isRdC).length;
    var atF = ccF.filter(function(c){ return c.status === "En attente RDV"; }).length;
    var anF = ccF.filter(isAnC).length;
    var activeDatesF = Array.from(new Set(ccF.map(function(c){ return c.date; }))).sort(function(a,b){ return b.localeCompare(a); });
    var villeCountF = {};
    ccF.forEach(function(c){ if (c.ville) villeCountF[c.ville] = (villeCountF[c.ville]||0)+1; });
    var topVillesF = Object.entries(villeCountF).sort(function(a,b){ return b[1]-a[1]; }).slice(0,3);
    var boxCountF = {};
    ccF.forEach(function(c){ if (c.box) boxCountF[c.box] = (boxCountF[c.box]||0)+1; });
    var csd = {
      name: selectedCom, total: ccF.length, weekTotal: weekCCF.length, monthTotal: monthCCF.length,
      activeDays: activeDatesF.length, lastDate: activeDatesF[0] || null,
      br: brF, rd: rdF, at: atF, an: anF,
      tBr: brF/totF*100, tRd: rdF/totF*100, tAt: atF/totF*100, tAn: anF/totF*100,
      tGlobal: (brF+rdF)/totF*100, topVilles: topVillesF, boxCount: boxCountF,
      monthlyData: csdBase.monthlyData, // trend always unfiltered
    };

    var colD = comColor(csd.name);
    var initialsD = csd.name.split(" ").map(function(w){ return w[0]; }).slice(0,2).join("").toUpperCase();
    var qualColD = csd.tGlobal >= 60 ? "#34C759" : csd.tGlobal >= 35 ? "#FF9F0A" : "#FF3B30";
    var maxMo = Math.max.apply(null, csd.monthlyData.map(function(m){ return m.count; })) || 1;
    var tmMember = team.find(function(m){ return m.name === selectedCom; });
    var lastDateLabel = csd.lastDate ? (function() {
      var diff = Math.round((new Date() - new Date(csd.lastDate + "T12:00:00")) / 86400000);
      if (diff === 0) return "Aujourd'hui";
      if (diff === 1) return "Hier";
      if (diff < 7) return "Il y a " + diff + "j";
      if (diff < 14) return "Sem. dernière";
      return "Il y a " + Math.round(diff/7) + " sem.";
    })() : "—";

    var dateInputStyleD = { padding:"5px 10px", borderRadius:8, border:"1px solid #E5E5EA", fontSize:12, fontFamily:"inherit", color:"#1D1D1F", background:"#fff" };
    function presetBtnD(label, from, to) {
      var active = comFrom === from && comTo === to;
      return <button key={label} onClick={function(){ setComFrom(from); setComTo(to); }} style={{ padding:"5px 12px", borderRadius:20, border:"1px solid "+(active?"#0071E3":"#E5E5EA"), background:active?"#0071E3":"#fff", color:active?"#fff":"#1D1D1F", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>{label}</button>;
    }

    return (
      <div>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
          <Btn v="ghost" onClick={function(){ setSelectedCom(null); setComFrom(""); setComTo(""); }}>← Retour</Btn>
          <div style={{ width:42, height:42, borderRadius:99, background:colD+"20", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <span style={{ fontSize:13, fontWeight:800, color:colD }}>{initialsD}</span>
          </div>
          <div>
            <h2 style={{ margin:0, fontSize:20, fontWeight:800 }}>{csd.name}</h2>
            {tmMember && <div style={{ fontSize:12, color:"#AEAEB2" }}>{tmMember.role}</div>}
          </div>
          <div style={{ marginLeft:"auto", textAlign:"right" }}>
            <div style={{ fontSize:28, fontWeight:800, color:qualColD, lineHeight:1 }}>{csd.tGlobal.toFixed(0)}%</div>
            <div style={{ fontSize:10, color:"#AEAEB2", fontWeight:600 }}>qualité</div>
          </div>
        </div>

        {/* Date range bar */}
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20, flexWrap:"wrap" }}>
          {presetBtnD("Tout", "", "")}
          {presetBtnD("Cette semaine", wkStartStr, todayStr)}
          {presetBtnD("Ce mois", moStartStr, todayStr)}
          <div style={{ display:"flex", alignItems:"center", gap:6, marginLeft:"auto" }}>
            <input type="date" value={comFrom} onChange={function(e){ setComFrom(e.target.value); }} style={dateInputStyleD} />
            <span style={{ fontSize:12, color:"#AEAEB2" }}>→</span>
            <input type="date" value={comTo} onChange={function(e){ setComTo(e.target.value); }} style={dateInputStyleD} />
          </div>
        </div>

        {/* Volume */}
        <div style={{ fontSize:10, fontWeight:700, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.8, marginBottom:10 }}>Volume</div>
        <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" }}>
          {[
            { label:"Total", val:csd.total, col:"#0071E3" },
            { label:"Cette sem.", val:csd.weekTotal, col:"#34C759" },
            { label:"Ce mois", val:csd.monthTotal, col:"#AF52DE" },
            { label:"Jours actifs", val:csd.activeDays, col:"#FF9F0A" },
          ].map(function(item) {
            return (
              <Card key={item.label} style={{ flex:1, minWidth:70, padding:"12px 10px", textAlign:"center" }}>
                <div style={{ fontSize:9, fontWeight:600, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.4, marginBottom:4 }}>{item.label}</div>
                <div style={{ fontSize:26, fontWeight:800, color:item.col, lineHeight:1 }}>{item.val}</div>
              </Card>
            );
          })}
          <Card style={{ flex:1, minWidth:70, padding:"12px 10px", textAlign:"center" }}>
            <div style={{ fontSize:9, fontWeight:600, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.4, marginBottom:4 }}>Dernier</div>
            <div style={{ fontSize:13, fontWeight:800, color:"#1D1D1F", lineHeight:1.3 }}>{lastDateLabel}</div>
          </Card>
        </div>

        {/* Qualité */}
        <div style={{ fontSize:10, fontWeight:700, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.8, marginBottom:10 }}>Qualité</div>
        <Card style={{ marginBottom:20, padding:20 }}>
          {[
            { label:"Taux branchement", sub:"long terme", val:csd.tBr, count:csd.br, col:"#34C759" },
            { label:"Taux RDV", sub:"hebdomadaire", val:csd.tRd, count:csd.rd, col:"#1A7A3F" },
            { label:"En attente RDV", sub:"pipeline", val:csd.tAt, count:csd.at, col:"#FF9F0A" },
            { label:"Taux annulation", sub:"rétractations", val:csd.tAn, count:csd.an, col:"#FF3B30" },
          ].map(function(item) {
            return (
              <div key={item.label} style={{ marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:5 }}>
                  <div>
                    <span style={{ fontSize:13, fontWeight:600 }}>{item.label}</span>
                    <span style={{ fontSize:10, color:"#AEAEB2", marginLeft:5 }}>{item.sub}</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:10, color:"#AEAEB2" }}>{item.count}</span>
                    <span style={{ fontSize:16, fontWeight:800, color:item.col }}>{item.val.toFixed(1)}%</span>
                  </div>
                </div>
                <div style={{ height:7, borderRadius:4, background:"#F5F5F7" }}>
                  <div style={{ width:Math.min(item.val,100)+"%", height:"100%", borderRadius:4, background:item.col }} />
                </div>
              </div>
            );
          })}
        </Card>

        {/* Tendance 6 mois */}
        <div style={{ fontSize:10, fontWeight:700, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.8, marginBottom:10 }}>Tendance 6 mois</div>
        <Card style={{ marginBottom:20, padding:20 }}>
          <div style={{ display:"flex", alignItems:"flex-end", gap:6, height:110 }}>
            {csd.monthlyData.map(function(m, i) {
              var isCurr = i === csd.monthlyData.length - 1;
              var barH = maxMo > 0 ? Math.max(4, Math.round(m.count / maxMo * 90)) : 4;
              return (
                <div key={m.mk} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                  <div style={{ fontSize:11, fontWeight:700, color: isCurr ? colD : "#6E6E73" }}>{m.count > 0 ? m.count : ""}</div>
                  <div style={{ width:"100%", height:barH, borderRadius:4, background: isCurr ? colD : colD+"35" }} />
                  <div style={{ fontSize:9, color: isCurr ? colD : "#AEAEB2", fontWeight: isCurr ? 700 : 400, textAlign:"center" }}>{m.label}</div>
                </div>
              );
            })}
          </div>
          {csd.monthlyData.length >= 2 && (function() {
            var curr = csd.monthlyData[csd.monthlyData.length-1].count;
            var prev = csd.monthlyData[csd.monthlyData.length-2].count;
            var diff = curr - prev;
            return (
              <div style={{ marginTop:12, paddingTop:12, borderTop:"1px solid #F5F5F7", display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:12, color:"#AEAEB2" }}>vs mois précédent :</span>
                <span style={{ fontSize:14, fontWeight:800, color: diff > 0 ? "#34C759" : diff < 0 ? "#FF3B30" : "#AEAEB2" }}>{diff > 0 ? "+" : ""}{diff}</span>
                {prev > 0 && <span style={{ fontSize:11, color:"#AEAEB2" }}>({((diff/prev)*100).toFixed(0)}%)</span>}
              </div>
            );
          })()}
        </Card>

        {/* Top communes */}
        {csd.topVilles.length > 0 && <div>
          <div style={{ fontSize:10, fontWeight:700, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.8, marginBottom:10 }}>Top communes</div>
          <Card style={{ marginBottom:20, padding:0, overflow:"hidden" }}>
            {csd.topVilles.map(function(entry, i) {
              var pct = entry[1] / csd.total * 100;
              return (
                <div key={entry[0]} style={{ padding:"12px 16px", borderTop: i > 0 ? "1px solid #F5F5F7" : "none", display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"#AEAEB2", minWidth:16 }}>{i+1}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ fontSize:13, fontWeight:600 }}>{entry[0]}</span>
                      <span style={{ fontSize:13, fontWeight:800, color:colD }}>{entry[1]}</span>
                    </div>
                    <div style={{ height:5, borderRadius:2.5, background:"#F5F5F7" }}>
                      <div style={{ width:pct+"%", height:"100%", borderRadius:2.5, background:colD+"50" }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </Card>
        </div>}

        {/* Produits */}
        {Object.keys(csd.boxCount).length > 0 && <div>
          <div style={{ fontSize:10, fontWeight:700, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.8, marginBottom:10 }}>Produits</div>
          <div style={{ display:"flex", gap:10, marginBottom:20 }}>
            {[
              { key:"ULTRA", label:"Ultra", col:"#0071E3" },
              { key:"ULTRA_LIGHT", label:"Ultra Light", col:"#5AC8FA" },
              { key:"POP", label:"Pop", col:"#FF9F0A" },
            ].filter(function(item){ return csd.boxCount[item.key] > 0; }).map(function(item) {
              var pct = (csd.boxCount[item.key] / csd.total * 100).toFixed(0);
              return (
                <Card key={item.key} style={{ flex:1, padding:"14px 12px", textAlign:"center" }}>
                  <div style={{ fontSize:9, fontWeight:600, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.4, marginBottom:4 }}>{item.label}</div>
                  <div style={{ fontSize:26, fontWeight:800, color:item.col, lineHeight:1, marginBottom:2 }}>{csd.boxCount[item.key]}</div>
                  <div style={{ fontSize:11, color:"#AEAEB2" }}>{pct}%</div>
                </Card>
              );
            })}
          </div>
        </div>}
      </div>
    );
  }

  // ── GRILLE ──
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <Btn v="ghost" onClick={function(){ setView(null); }}>← Retour</Btn>
        <h2 style={{ margin:0, fontSize:20, fontWeight:800 }}>Récap Commercial</h2>
        <span style={{ fontSize:12, color:"#AEAEB2", marginLeft:4 }}>{comStatsRC.length} commerciaux</span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(155px, 1fr))", gap:12 }}>
        {comStatsRC.map(function(cs) {
          var col = comColor(cs.name);
          var initials = cs.name.split(" ").map(function(w){ return w[0]; }).slice(0,2).join("").toUpperCase();
          var qualCol = cs.tGlobal >= 60 ? "#34C759" : cs.tGlobal >= 35 ? "#FF9F0A" : "#FF3B30";
          var firstName = cs.name.split(" ")[0];
          var lastName = cs.name.split(" ").slice(1).join(" ");
          return (
            <Card key={cs.name} onClick={function(){ setSelectedCom(cs.name); setComFrom(""); setComTo(""); }} style={{ padding:16, cursor:"pointer", textAlign:"center" }}>
              <div style={{ width:46, height:46, borderRadius:99, background:col+"20", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 10px" }}>
                <span style={{ fontSize:14, fontWeight:800, color:col }}>{initials}</span>
              </div>
              <div style={{ fontSize:13, fontWeight:700, color:"#1D1D1F" }}>{firstName}</div>
              <div style={{ fontSize:11, color:"#6E6E73", marginBottom:10 }}>{lastName}</div>
              <div style={{ fontSize:26, fontWeight:800, color:col, lineHeight:1, marginBottom:2 }}>{cs.total}</div>
              <div style={{ fontSize:10, color:"#AEAEB2", marginBottom:10 }}>contrats</div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:3 }}>
                <span style={{ color:"#AEAEB2" }}>Ce mois</span>
                <span style={{ fontWeight:700, color:col }}>{cs.monthTotal}</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11 }}>
                <span style={{ color:"#AEAEB2" }}>Qualité</span>
                <span style={{ fontWeight:700, color:qualCol }}>{cs.tGlobal.toFixed(0)}%</span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── OVERVIEW ─────────────────────────────────────────────────────────────────
var dates = Array.from(new Set(contracts.map(function(c) { return c.date; }))).sort(function(a, b) { return b.localeCompare(a); });
var total = contracts.length;
var statuses = Array.from(new Set(contracts.map(function(c) { return c.status; }).filter(Boolean))).sort();
var hasFilter = fD || fC || fO || fS;

var filtered = contracts.filter(function(c) {
  if (fD && c.date !== fD) return false;
  if (fC && c.commercial !== fC) return false;
  if (fO && c.operator !== fO) return false;
  if (fS && c.status !== fS) return false;
  return true;
}).sort(function(a, b) { return (b.date + (b.heure||"")).localeCompare(a.date + (a.heure||"")); });

var grouped = [];
if (!fD) {
  var dateGroups = {};
  filtered.forEach(function(c) {
    if (!dateGroups[c.date]) dateGroups[c.date] = [];
    dateGroups[c.date].push(c);
  });
  Object.keys(dateGroups).sort(function(a,b){return b.localeCompare(a);}).forEach(function(d) {
    grouped.push({ date: d, items: dateGroups[d] });
  });
} else {
  grouped = [{ date: fD, items: filtered }];
}

var todayDelta = todayC.length - yestC.length;
var weekDelta  = weekC.length - lwC.length;
var monthDelta = monthC.length - prevMonC.length;
var tauxBrancheOv = total > 0 ? (contracts.filter(function(c){ return c.status && c.status.indexOf("Branché")===0; }).length / total * 100).toFixed(0) : "0";
var annulesOv = contracts.filter(function(c){ return c.status === "Annulé" || c.status === "Résilié"; }).length;

return (
<div>
  {/* 4 summary cards */}
  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))", gap:14, marginBottom:20 }}>
    {/* Aujourd'hui */}
    <Card onClick={function(){ setView("today"); }} style={{ cursor:"pointer", padding:20, border:"2px solid transparent" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:600, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>Aujourd'hui</div>
          <div style={{ fontSize:36, fontWeight:800, letterSpacing:-1.5, color:"#0071E3", lineHeight:1 }}>{todayC.length}</div>
        </div>
        <div style={{ fontSize:22 }}>📅</div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <span style={{ fontSize:12, fontWeight:700, color: todayDelta>0?"#34C759":todayDelta<0?"#FF3B30":"#AEAEB2" }}>
          {todayDelta>0?"+":""}{todayDelta !== 0 ? todayDelta : "="} vs hier
        </span>
      </div>
      <div style={{ marginTop:10, display:"flex", gap:4, flexWrap:"wrap" }}>
        {topComs(todayC).slice(0,3).map(function(e){
          var col = comColor(e[0]);
          return <span key={e[0]} style={{ fontSize:11, fontWeight:700, color:col, background:col+"15", borderRadius:20, padding:"2px 8px" }}>{e[0].split(" ")[0]} {e[1]}</span>;
        })}
      </div>
    </Card>

    {/* Semaine */}
    <Card onClick={function(){ setView("week"); }} style={{ cursor:"pointer", padding:20, border:"2px solid transparent" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:600, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>Cette semaine</div>
          <div style={{ fontSize:36, fontWeight:800, letterSpacing:-1.5, color:"#34C759", lineHeight:1 }}>{weekC.length}</div>
        </div>
        <div style={{ fontSize:22 }}>📊</div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <span style={{ fontSize:12, fontWeight:700, color: weekDelta>0?"#34C759":weekDelta<0?"#FF3B30":"#AEAEB2" }}>
          {weekDelta>0?"+":""}{weekDelta !== 0 ? weekDelta : "="} vs sem. préc.
        </span>
      </div>
      <div style={{ marginTop:10 }}>
        <div style={{ fontSize:12, color:"#6E6E73" }}>Moy. {(weekC.length/(dFromMon+1||1)).toFixed(1)}/jour · {(dFromMon+1)} jour{dFromMon>0?"s":""}</div>
      </div>
    </Card>

    {/* Mois */}
    <Card onClick={function(){ setView("month"); }} style={{ cursor:"pointer", padding:20, border:"2px solid transparent" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:600, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>Ce mois</div>
          <div style={{ fontSize:36, fontWeight:800, letterSpacing:-1.5, color:"#AF52DE", lineHeight:1 }}>{monthC.length}</div>
        </div>
        <div style={{ fontSize:22 }}>📆</div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <span style={{ fontSize:12, fontWeight:700, color: monthDelta>0?"#34C759":monthDelta<0?"#FF3B30":"#AEAEB2" }}>
          {monthDelta>0?"+":""}{monthDelta !== 0 ? monthDelta : "="} vs mois préc.
        </span>
      </div>
      <div style={{ marginTop:10, display:"flex", gap:4, flexWrap:"wrap" }}>
        {topComs(monthC).slice(0,3).map(function(e){
          var col = comColor(e[0]);
          return <span key={e[0]} style={{ fontSize:11, fontWeight:700, color:col, background:col+"15", borderRadius:20, padding:"2px 8px" }}>{e[0].split(" ")[0]} {e[1]}</span>;
        })}
      </div>
    </Card>

    {/* Qualité */}
    <Card onClick={function(){ setView("quality"); }} style={{ cursor:"pointer", padding:20, border:"2px solid " + (pendingVTA.length > 0 ? "#FF9F0A30" : "transparent") }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:600, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>Qualité</div>
          <div style={{ fontSize:36, fontWeight:800, letterSpacing:-1.5, color:"#34C759", lineHeight:1 }}>{tauxBrancheOv}%</div>
        </div>
        <div style={{ fontSize:22 }}>✅</div>
      </div>
      <div style={{ fontSize:12, color:"#6E6E73", marginBottom:6 }}>Taux de branchement</div>
      <div style={{ display:"flex", gap:6 }}>
        {annulesOv > 0 && <span style={{ fontSize:11, fontWeight:700, color:"#FF3B30", background:"#FF3B3015", borderRadius:20, padding:"2px 8px" }}>{annulesOv} annulés</span>}
        {pendingVTA.length > 0 && <span style={{ fontSize:11, fontWeight:700, color:"#FF9F0A", background:"#FF9F0A15", borderRadius:20, padding:"2px 8px" }}>{pendingVTA.length} VTA?</span>}
      </div>
    </Card>

    {/* Récap Commercial */}
    <Card onClick={function(){ setView("commercial"); }} style={{ cursor:"pointer", padding:20, border:"2px solid transparent" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:600, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>Commerciaux</div>
          <div style={{ fontSize:36, fontWeight:800, letterSpacing:-1.5, color:"#FF9F0A", lineHeight:1 }}>{Array.from(new Set(contracts.map(function(c){ return c.commercial; }))).length}</div>
        </div>
        <div style={{ fontSize:22 }}>👤</div>
      </div>
      <div style={{ fontSize:12, color:"#6E6E73", marginBottom:6 }}>Récap par commercial</div>
      <div style={{ marginTop:4, display:"flex", gap:4, flexWrap:"wrap" }}>
        {topComs(monthC).slice(0,2).map(function(e){
          var col = comColor(e[0]);
          return <span key={e[0]} style={{ fontSize:11, fontWeight:700, color:col, background:col+"15", borderRadius:20, padding:"2px 8px" }}>{e[0].split(" ")[0]} {e[1]}</span>;
        })}
      </div>
    </Card>
  </div>

  {/* Date carousel */}
  <div style={{ display:"flex", gap:8, marginBottom:16, overflowX:"auto", paddingBottom:4 }}>
    <Card onClick={function(){ setFD(""); }} style={{ minWidth:68, padding:"10px 12px", textAlign:"center", cursor:"pointer", flexShrink:0, border: !fD?"2px solid #0071E3":"2px solid transparent", background: !fD?"#0071E308":"#fff" }}>
      <div style={{ fontSize:10, color: !fD?"#0071E3":"#AEAEB2", fontWeight:600, textTransform:"uppercase", letterSpacing:0.3 }}>Tous</div>
      <div style={{ fontSize:17, fontWeight:800, color: !fD?"#0071E3":"#1D1D1F", marginTop:2 }}>{total}</div>
    </Card>
    {dates.slice(0,10).map(function(d) {
      var dc = contracts.filter(function(c){ return c.date===d; }).length;
      var isTod = d === todayStr;
      var sel = fD===d;
      return (
        <Card key={d} onClick={function(){ setFD(d); }} style={{ minWidth:68, padding:"10px 12px", textAlign:"center", cursor:"pointer", flexShrink:0, border: sel?"2px solid #0071E3":"2px solid transparent", background: sel?"#0071E308":"#fff" }}>
          <div style={{ fontSize:10, color: sel?"#0071E3":"#AEAEB2", fontWeight:600, textTransform:"uppercase", letterSpacing:0.3 }}>
            {isTod?"Auj.":new Date(d+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"short"})}
          </div>
          <div style={{ fontSize:17, fontWeight:800, color: sel?"#0071E3":"#1D1D1F", marginTop:2 }}>{dc}</div>
          <div style={{ fontSize:10, color:"#AEAEB2", marginTop:1 }}>{new Date(d+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}</div>
        </Card>
      );
    })}
  </div>

  {/* Filters */}
  <Card style={{ marginBottom:16, padding:"12px 16px" }}>
    <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
      <Sel value={fC} onChange={setFC} placeholder="Tous les commerciaux" options={allComs.map(function(n){ return { value:n, label:n }; })} style={{ minWidth:180 }} />
      <Sel value={fO} onChange={setFO} placeholder="Opérateur" options={OPERATORS.map(function(o){ return { value:o, label:o }; })} style={{ minWidth:110 }} />
      <Sel value={fS} onChange={setFS} placeholder="Statut" options={statuses.map(function(s){ return { value:s, label:s }; })} style={{ minWidth:160 }} />
      {hasFilter && <Btn s="sm" v="ghost" onClick={function(){ setFD(""); setFC(""); setFO(""); setFS(""); }}>Réinitialiser</Btn>}
      <span style={{ marginLeft:"auto", fontSize:13, fontWeight:600, color:"#6E6E73" }}>{filtered.length} contrat{filtered.length>1?"s":""}</span>
    </div>
  </Card>

  {/* List */}
  {filtered.length === 0
    ? <Card><div style={{ textAlign:"center", padding:40, color:"#AEAEB2", fontSize:14 }}>Aucun contrat</div></Card>
    : grouped.map(function(group) {
        var dateLabel = new Date(group.date+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
        var displayItems = showAll || fD ? group.items : group.items.slice(0,30);
        return (
          <div key={group.date} style={{ marginBottom:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8, paddingLeft:4 }}>
              <span style={{ fontSize:13, fontWeight:700, color:"#1D1D1F", textTransform:"capitalize" }}>{dateLabel}</span>
              <span style={{ fontSize:12, color:"#AEAEB2" }}>{group.items.length} contrat{group.items.length>1?"s":""}</span>
            </div>
            {CList(displayItems)}
            {!fD && !showAll && group.items.length > 30 && (
              <div style={{ textAlign:"center", marginTop:8 }}>
                <Btn s="sm" v="ghost" onClick={function(){ setShowAll(true); }}>Voir tout ({group.items.length-30} de plus)</Btn>
              </div>
            )}
          </div>
        );
      })
  }
</div>
);
}

export { ContractsTab };
