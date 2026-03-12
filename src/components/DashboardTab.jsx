import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Badge, Card, Btn, Sel, Modal, StatCard } from "./ui.jsx";
import { statusColor, isCaduque } from "../helpers/status.js";
import { resolveVTA, getPendingResolutions } from "../helpers/resolution.js";
import { ROLE_COLORS } from "../constants/roles.js";
import { localDateStr } from "../helpers/date.js";

// DASHBOARD
function DashboardTab({ team, contracts, saveContracts, dailyPlan, cars, lastSync, scraperStatus, objectives }) {
// ── Dates & données ────────────────────────────────────────────────────────────
var today    = localDateStr(new Date());
var _dp = dailyPlan ? (dailyPlan[today] || {}) : {};
var d3ago    = localDateStr(new Date(Date.now() - 3*86400000));
var weekStart = (function(){ var d = new Date(); d.setDate(d.getDate() - (d.getDay()||7) + 1); return localDateStr(d); })();
var moStart  = localDateStr(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
var todayC   = contracts.filter(function(c){ return c.date === today && !isCaduque(c); });
var weekC    = contracts.filter(function(c){ return c.date >= weekStart && c.date <= today && !isCaduque(c); });
var monthC   = contracts.filter(function(c){ return c.date >= moStart  && c.date <= today && !isCaduque(c); });
var brMois   = monthC.filter(function(c){ return c.status === "Branché"; });
var tauxBr   = monthC.length > 0 ? Math.round(brMois.length / monthC.length * 100) : 0;
var brColor  = tauxBr >= 60 ? "#34C759" : tauxBr >= 40 ? "#FF9F0A" : "#FF3B30";
var wBy = {};
weekC.forEach(function(c){ wBy[c.commercial] = (wBy[c.commercial] || 0) + 1; });
var ranking = Object.entries(wBy).sort(function(a, b) { return b[1] - a[1]; });

var pending = getPendingResolutions(contracts, team, dailyPlan, cars || []);
var manualPending = pending.filter(function(p) { return p.type === 'manual'; });
var autoPending = pending.filter(function(p) { return p.type === 'auto' && p.autoTo && p.contract.commercial !== p.autoTo.name; });

function resolveContract(contractId, memberName, isVta) {
  saveContracts(contracts.map(function(c) {
    if (c.id !== contractId) return c;
    return Object.assign({}, c, { commercial: memberName, vtaResolved: isVta ? true : c.vtaResolved });
  }));
}

function applyAutoResolutions() {
  var updated = contracts.slice();
  autoPending.forEach(function(p) {
    for (var i = 0; i < updated.length; i++) {
      if (updated[i].id === p.contract.id) {
        updated[i] = Object.assign({}, updated[i], { commercial: p.autoTo.name, vtaResolved: p.contract.vtaCode ? true : updated[i].vtaResolved });
        break;
      }
    }
  });
  saveContracts(updated);
}

var ResolutionWidget = (manualPending.length > 0 || autoPending.length > 0) ? (
  <Card style={{ borderLeft: "4px solid #FF9F0A" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <span style={{ fontSize: 18 }}>⚡</span>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#f0f0f5" }}>
        Résolutions en attente
      </h3>
      {manualPending.length > 0 && <span style={{ fontSize: 11, fontWeight: 700, background: "#FF3B30", color: "rgba(255,255,255,0.95)", borderRadius: 99, padding: "2px 7px" }}>{manualPending.length} à confirmer</span>}
      {autoPending.length > 0 && <span style={{ fontSize: 11, fontWeight: 700, background: "#34C759", color: "rgba(255,255,255,0.95)", borderRadius: 99, padding: "2px 7px" }}>{autoPending.length} auto</span>}
    </div>

    {manualPending.length > 0 && (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#FF3B30", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 }}>À confirmer</div>
        {manualPending.map(function(p, i) {
          var c = p.contract;
          return (
            <motion.div key={c.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(255,159,10,0.08)", borderRadius: 10, marginBottom: 6, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 120 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#f0f0f5" }}>{c.ville || '—'}</span>
                {c.rue && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginLeft: 6 }}>{c.rue}</span>}
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                  {c.heure || c.date} · {c.status} · <span style={{ color: "#FF9F0A" }}>{p.reason}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {p.candidates.map(function(m) {
                  return (
                    <button key={m.id} onClick={function() { resolveContract(c.id, m.name, !!c.vtaCode); }}
                      style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid " + ROLE_COLORS[m.role], background: "rgba(255,255,255,0.07)", color: ROLE_COLORS[m.role], fontSize: 12, fontWeight: 600, cursor: "pointer", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
                      {m.name.split(' ')[0]}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </div>
    )}

    {autoPending.length > 0 && (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#34C759", letterSpacing: 0.8, textTransform: "uppercase", flex: 1 }}>Résolutions automatiques</div>
          <button onClick={applyAutoResolutions} style={{ padding: "4px 12px", borderRadius: 8, border: "none", background: "#34C759", color: "rgba(255,255,255,0.95)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            Appliquer tout ({autoPending.length})
          </button>
        </div>
        {autoPending.map(function(p, i) {
          var c = p.contract;
          return (
            <motion.div key={c.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", background: "rgba(52,199,89,0.08)", borderRadius: 10, marginBottom: 5, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "#34C759", fontWeight: 700, minWidth: 16 }}>→</span>
              <div style={{ flex: 1, minWidth: 100 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#f0f0f5" }}>{c.ville || '—'}</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginLeft: 6 }}>{c.status}</span>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>{p.reason}</div>
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{c.commercial}</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>→</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#34C759" }}>{p.autoTo.name}</span>
              </div>
              <button onClick={function() { resolveContract(c.id, p.autoTo.name, !!c.vtaCode); }}
                style={{ padding: "3px 10px", borderRadius: 7, border: "1px solid #34C75950", background: "#34C75910", color: "#34C759", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                ✓
              </button>
            </motion.div>
          );
        })}
      </div>
    )}
  </Card>
) : null;

// ── Voitures du jour ──────────────────────────────────────────────────────────
var passengerIds = new Set();
(cars || []).forEach(function(car){
  var cp = _dp[car.id];
  if (cp && cp.members) cp.members.forEach(function(id){ passengerIds.add(id); });
});
function isCarInactive(car){ return car.driverId ? passengerIds.has(car.driverId) : false; }
var CAR_PALETTE = ["#0071E3","#34C759","#FF9F0A","#AF52DE","#FF2D55","#5AC8FA","#FF6B35"];
var activePlannedCars = (cars || []).filter(function(car){
  if (isCarInactive(car)) return false;
  var cp = _dp[car.id];
  return cp && (cp.sector || (cp.members && cp.members.length > 0));
});

// ── Tendance 7j ───────────────────────────────────────────────────────────────
var last7 = [];
for (var i7 = 6; i7 >= 0; i7--) {
  var d7 = new Date(Date.now() - i7 * 86400000);
  var ds7 = localDateStr(d7);
  last7.push({ date: ds7, label: d7.toLocaleDateString("fr-FR", { weekday:"short" }).slice(0,3), count: contracts.filter(function(c){ return c.date === ds7; }).length });
}
var maxDay = Math.max.apply(null, last7.map(function(d){ return d.count; }).concat([1]));

// ── Objectifs semaine ─────────────────────────────────────────────────────────
function getWkKey(ds){ var d = new Date(ds+"T12:00:00"); d.setDate(d.getDate()-(d.getDay()||7)+1); return localDateStr(d); }
var weekObjectives = ((objectives||{})[getWkKey(today)])||{};
var activeNM = team.filter(function(m){ return m.active && m.role !== "Manager"; });
var objMembers = activeNM.filter(function(m){ return (weekObjectives[m.name]||0)>0; })
  .sort(function(a,b){ return (weekObjectives[b.name]||0)-(weekObjectives[a.name]||0); });

// ── Alertes ───────────────────────────────────────────────────────────────────
var alertes = [];
activeNM.forEach(function(m){
  var sorted = contracts.filter(function(c){ return c.commercial === m.name; }).sort(function(a,b){ return b.date.localeCompare(a.date); });
  if (sorted.length === 0 || sorted[0].date < d3ago) alertes.push({ col:"#FF3B30", bg:"rgba(255,59,48,0.10)", icon:"🔴", text:m.name.split(" ")[0]+" — aucun contrat depuis +3j" });
});
var anMois = monthC.filter(function(c){ return c.status === "Résilié"; });
if (monthC.length >= 5 && anMois.length/monthC.length > 0.2) alertes.push({ col:"#FF9F0A", bg:"rgba(255,159,10,0.10)", icon:"🟠", text:"Annulations : "+Math.round(anMois.length/monthC.length*100)+"% ce mois ("+anMois.length+" contrats)" });
var totObj = activeNM.reduce(function(s,m){ return s+(weekObjectives[m.name]||0); },0);
var totReal = activeNM.reduce(function(s,m){ return s+(wBy[m.name]||0); },0);
if (totObj>0 && (new Date().getDay()===0||new Date().getDay()>=3) && totReal/totObj<0.5) alertes.push({ col:"#FF9F0A", bg:"rgba(255,159,10,0.10)", icon:"⚠️", text:"Objectif semaine à risque : "+totReal+"/"+totObj+" ("+Math.round(totReal/totObj*100)+"%)" });
var attenteOld = contracts.filter(function(c){ return c.status === "En attente RDV" && c.date < d3ago; });
if (attenteOld.length > 0) alertes.push({ col:"#0071E3", bg:"rgba(0,113,227,0.10)", icon:"🔵", text:attenteOld.length+" contrat"+(attenteOld.length>1?"s":"")+" en attente RDV depuis +3j" });

var medals = ["🥇","🥈","🥉"];

return (
<div style={{ display:"flex", flexDirection:"column", gap:24 }}>
{ResolutionWidget}

{/* ── Stat cards ── */}
<div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
  <StatCard label="Aujourd'hui" value={todayC.length} color="#0071E3" />
  <StatCard label="Cette semaine" value={weekC.length} color="#34C759" />
  <StatCard label="Ce mois" value={monthC.length} color="#FF9F0A" />
  <StatCard label="Branchement mois" value={tauxBr+"%"} color={brColor} sub={brMois.length+"/"+monthC.length+" branchés"} />
</div>

{/* ── Voitures + Tendance ── */}
<div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:16 }}>
  <Card>
    <h3 style={{ margin:"0 0 14px", fontSize:14, fontWeight:700, color:"#f0f0f5", letterSpacing:-0.3 }}>🚗 Voitures du jour</h3>
    {!dailyPlan ? (
      <p style={{ color:"rgba(255,255,255,0.35)", fontSize:13, margin:0 }}>Plan voitures non configuré</p>
    ) : activePlannedCars.length === 0 ? (
      <p style={{ color:"rgba(255,255,255,0.35)", fontSize:13, margin:0 }}>Aucune voiture planifiée</p>
    ) : (
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {activePlannedCars.map(function(car, idx){
          var cp = _dp[car.id] || {};
          var color = CAR_PALETTE[idx % CAR_PALETTE.length];
          var driver = team.find(function(m){ return m.id === car.driverId; });
          var passengers = (cp.members||[]).map(function(id){ return team.find(function(m){ return m.id===id; }); }).filter(Boolean).filter(function(m){ return !driver || m.id!==driver.id; });
          var allMembers = driver ? [driver].concat(passengers) : passengers;
          return (
            <div key={car.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:color+"12", borderRadius:10, borderLeft:"3px solid "+color }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:700, color:color, marginBottom:4 }}>
                  {cp.sector || <span style={{ color:"rgba(255,255,255,0.35)", fontWeight:400 }}>Secteur non défini</span>}
                  {cp.zoneType === "talc" && <span style={{ fontSize:10, background:color, color:"rgba(255,255,255,0.95)", borderRadius:4, padding:"1px 5px", marginLeft:6 }}>TALC</span>}
                </div>
                <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                  {allMembers.map(function(m, mi){
                    return <span key={m.id} style={{ fontSize:11, fontWeight:mi===0?700:500, color:"#f0f0f5", background:"rgba(255,255,255,0.10)", borderRadius:20, padding:"2px 8px", border:"1px solid "+color+"50" }}>{mi===0?"🚗 ":""}{m.name.split(" ")[0]}</span>;
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </Card>

  <Card>
    <h3 style={{ margin:"0 0 14px", fontSize:14, fontWeight:700, color:"#f0f0f5", letterSpacing:-0.3 }}>Tendance 7j</h3>
    <div style={{ display:"flex", gap:4, alignItems:"flex-end", height:90, paddingTop:8 }}>
      {last7.map(function(d){
        var h = Math.max(4, Math.round(d.count/maxDay*70));
        var isToday = d.date === today;
        return (
          <div key={d.date} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
            {d.count > 0 && <div style={{ fontSize:10, fontWeight:700, color:isToday?"#0071E3":"rgba(255,255,255,0.55)" }}>{d.count}</div>}
            <div style={{ flex:1, display:"flex", alignItems:"flex-end", width:"100%" }}>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: d.count>0?h:4 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                style={{ width:"100%", borderRadius:4, background:isToday?"#0071E3":d.count>0?"rgba(0,113,227,0.25)":"rgba(255,255,255,0.05)" }} />
            </div>
            <div style={{ fontSize:9, color:isToday?"#0071E3":"rgba(255,255,255,0.35)", fontWeight:isToday?700:400 }}>{d.label}</div>
          </div>
        );
      })}
    </div>
  </Card>
</div>

{/* ── Classement + Objectifs ── */}
<div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
  <Card>
    <h3 style={{ margin:"0 0 14px", fontSize:14, fontWeight:600, color:"#f0f0f5", letterSpacing:-0.3 }}>Classement semaine</h3>
    {ranking.length === 0 ? <p style={{ color:"rgba(255,255,255,0.35)", fontSize:13, margin:0 }}>Aucun contrat cette semaine</p> : ranking.slice(0,6).map(function(entry, i){
      return (
        <motion.div key={entry[0]}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.04, duration: 0.3 }}
          style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
          <div style={{ width:22, textAlign:"center", fontSize:i<3?16:11, color:i>=3?"rgba(255,255,255,0.35)":undefined }}>{i<3?medals[i]:i+1}</div>
          <div style={{ flex:1, fontSize:13, fontWeight:500, color:"#f0f0f5" }}>{entry[0]}</div>
          <span style={{ fontSize:14, fontWeight:700, color:"#f0f0f5" }}>{entry[1]}</span>
        </motion.div>
      );
    })}
  </Card>

  <Card>
    <h3 style={{ margin:"0 0 14px", fontSize:14, fontWeight:600, color:"#f0f0f5", letterSpacing:-0.3 }}>Objectifs semaine</h3>
    {objMembers.length === 0 ? (
      <p style={{ color:"rgba(255,255,255,0.35)", fontSize:13, margin:0 }}>Aucun objectif fixé pour cette semaine</p>
    ) : objMembers.map(function(m){
      var obj = weekObjectives[m.name]||0;
      var real = wBy[m.name]||0;
      var pct = obj>0 ? Math.min(100, Math.round(real/obj*100)) : 0;
      var col = pct>=100?"#34C759":pct>=60?"#FF9F0A":"#FF3B30";
      return (
        <div key={m.name} style={{ marginBottom:10 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
            <span style={{ fontSize:12, fontWeight:500, color:"#f0f0f5" }}>{m.name.split(" ")[0]}</span>
            <span style={{ fontSize:12, fontWeight:700, color:col }}>{real}<span style={{ color:"rgba(255,255,255,0.35)", fontWeight:400 }}>/{obj}</span></span>
          </div>
          <div style={{ height:4, background:"rgba(255,255,255,0.08)", borderRadius:99, overflow:"hidden" }}>
            <div style={{ width:pct+"%", height:"100%", background:col, borderRadius:99 }} />
          </div>
        </div>
      );
    })}
  </Card>
</div>

{/* ── Alertes ── */}
{alertes.length > 0 && (
  <Card>
    <h3 style={{ margin:"0 0 12px", fontSize:14, fontWeight:700, color:"#f0f0f5", letterSpacing:-0.3 }}>Alertes</h3>
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {alertes.map(function(a, i){
        return (
          <motion.div key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.3 }}
            style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:a.bg, borderRadius:8 }}>
            <span style={{ fontSize:13 }}>{a.icon}</span>
            <span style={{ fontSize:12, color:a.col, fontWeight:600 }}>{a.text}</span>
          </motion.div>
        );
      })}
    </div>
  </Card>
)}
</div>
);
}


export { DashboardTab };
