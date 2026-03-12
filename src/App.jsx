import React, { useState, useEffect } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { db, store, STORAGE_KEYS, doc, getDoc, onSnapshot } from "./data/store.js";
import { DEMO_TEAM } from "./data/team.js";
import { DEMO_CARS } from "./data/team.js";
import { DEMO_CONTRACTS } from "./data/contracts.js";
import { DashboardTab } from "./components/DashboardTab.jsx";
import { TeamTab } from "./components/TeamTab.jsx";
import { CarsTab } from "./components/CarsTab.jsx";
import { ContractsTab } from "./components/ContractsTab.jsx";
import { MapTab } from "./components/MapTab.jsx";
import { SecteursTab } from "./components/SecteursTab.jsx";
import { ClocheTab } from "./components/ClocheTab.jsx";
import { ObjectifsTab } from "./components/ObjectifsTab.jsx";
import { ImportTab } from "./components/ImportTab.jsx";
import { CarnetTab } from "./components/CarnetTab.jsx";
import { localDateStr } from "./helpers/date.js";

var TABS = [
{ id: "cloche", label: "\u{1F514}" },
{ id: "dashboard", label: "Dashboard" },
{ id: "contracts", label: "Contrats" },
{ id: "objectifs", label: "Objectifs" },
{ id: "cars", label: "Voitures" },
{ id: "team", label: "\u00C9quipe" },
{ id: "map", label: "Carte" },
{ id: "secteurs", label: "Secteurs" },
{ id: "import", label: "Import" },
{ id: "carnet", label: "Carnet" },
];

export default function App() {
var [tab, setTab] = useState("cloche");
var [team, setTeam] = useState([]);
var [cars, setCars] = useState([]);
var [contracts, setContracts] = useState([]);
var [objectives, setObjectives] = useState({});
var [dailyPlan, setDailyPlan] = useState(null);
var [loading, setLoading] = useState(true);
var [scraperStatus, setScraperStatus] = useState(null);
var [lastSync, setLastSync] = useState(null);
var [groups, setGroups] = useState([]);
var [proxadCreds, setProxadCreds] = useState(null);
var skipNextContractSnap = React.useRef(false);

useEffect(function() {
var unsubPlan, unsubObj, unsubContracts;
(async function() {
try {
  var dpLs = localStorage.getItem(STORAGE_KEYS.dailyPlan);
  if (dpLs) { var dpSnap = await getDoc(doc(db, "agency", STORAGE_KEYS.dailyPlan)); if (!dpSnap.exists()) await store.set(STORAGE_KEYS.dailyPlan, JSON.parse(dpLs)); }
  var obLs = localStorage.getItem(STORAGE_KEYS.objectives);
  if (obLs) { var obSnap = await getDoc(doc(db, "agency", STORAGE_KEYS.objectives)); if (!obSnap.exists()) await store.set(STORAGE_KEYS.objectives, JSON.parse(obLs)); }
} catch(e) {}
unsubPlan = onSnapshot(doc(db, "agency", STORAGE_KEYS.dailyPlan), function(snap) {
  var raw = snap.exists() ? (snap.data().data || null) : null;
  if (raw && Object.keys(raw).length > 0 && !Object.keys(raw).some(function(k) { return /^\d{4}-\d{2}-\d{2}$/.test(k); })) {
    var migrated = {}; migrated[localDateStr(new Date())] = raw;
    store.set(STORAGE_KEYS.dailyPlan, migrated);
    raw = migrated;
  }
  setDailyPlan(raw);
});
unsubObj = onSnapshot(doc(db, "agency", STORAGE_KEYS.objectives), function(snap) {
  setObjectives(snap.exists() ? (snap.data().data || {}) : {});
});
var oldKeys = ["agency-team-v1","agency-cars-v1","agency-contracts-v1","agency-daily-plan-v1","agency-objectives-v1","agency-team-v2","agency-cars-v2","agency-contracts-v2","agency-daily-plan-v2","agency-objectives-v2"];
for (var k of oldKeys) { try { await store.delete(k); } catch(e) {} }

var teamData = await store.get(STORAGE_KEYS.team);
if (!teamData) { try { var lsT = localStorage.getItem(STORAGE_KEYS.team); if (lsT) { teamData = JSON.parse(lsT); await store.set(STORAGE_KEYS.team, teamData); } } catch(e) {} }
if (!teamData) { teamData = await store.get("agency-team-v3") || null; }
if (teamData) {
  var needsSave = false;
  teamData = teamData.map(function(m) {
    var demo = DEMO_TEAM.find(function(d) { return d.id === m.id || d.name === m.name; });
    var needsVst = !m.vstCodes || m.vstCodes.length === 0;
    var needsLent = !m.lentCodes;
    if (!needsVst && !needsLent) return m;
    needsSave = true;
    return Object.assign({}, m, {
      vstCodes: needsVst ? ((demo && demo.vstCodes) || []) : m.vstCodes,
      lentCodes: needsLent ? [] : m.lentCodes,
    });
  });
  if (needsSave) store.set(STORAGE_KEYS.team, teamData);
}
setTeam(teamData || DEMO_TEAM);
var carsData = await store.get(STORAGE_KEYS.cars);
if (!carsData) { try { var lsC = localStorage.getItem(STORAGE_KEYS.cars); if (lsC) { carsData = JSON.parse(lsC); await store.set(STORAGE_KEYS.cars, carsData); } } catch(e) {} }
setCars(carsData || DEMO_CARS);
var savedResolutions = await store.get(STORAGE_KEYS.contracts);
if (!savedResolutions) { try { var lsCo = localStorage.getItem(STORAGE_KEYS.contracts); if (lsCo) { savedResolutions = JSON.parse(lsCo); await store.set(STORAGE_KEYS.contracts, savedResolutions); } } catch(e) {} }
savedResolutions = savedResolutions || {};
var demoIds = new Set(DEMO_CONTRACTS.map(function(c) { return c.id; }));
var mergedContracts = DEMO_CONTRACTS.map(function(c) {
  var saved = savedResolutions[c.id];
  if (!saved) return c;
  var useCommercial = c.id.indexOf('byg-') === 0 ? c.commercial : (saved.commercial || c.commercial);
  return Object.assign({}, c, { commercial: useCommercial, vtaResolved: saved.vtaResolved !== undefined ? saved.vtaResolved : c.vtaResolved });
});
Object.keys(savedResolutions).forEach(function(id) {
  if (!demoIds.has(id) && savedResolutions[id].date && id.indexOf('byg-') !== 0) {
    mergedContracts.push(Object.assign({ id: id }, savedResolutions[id]));
  }
});
setContracts(mergedContracts);
unsubContracts = onSnapshot(doc(db, "agency", STORAGE_KEYS.contracts), function(snap) {
  if (skipNextContractSnap.current) { skipNextContractSnap.current = false; return; }
  var overrides = snap.exists() ? (snap.data().data || {}) : {};
  var dIds = new Set(DEMO_CONTRACTS.map(function(c) { return c.id; }));
  var merged = DEMO_CONTRACTS.map(function(c) {
    var saved = overrides[c.id];
    if (!saved) return c;
    var useCommercial = c.id.indexOf('byg-') === 0 ? c.commercial : (saved.commercial || c.commercial);
    return Object.assign({}, c, { commercial: useCommercial, vtaResolved: saved.vtaResolved !== undefined ? saved.vtaResolved : c.vtaResolved });
  });
  Object.keys(overrides).forEach(function(id) {
    if (!dIds.has(id) && overrides[id].date && id.indexOf('byg-') !== 0) {
      merged.push(Object.assign({ id: id }, overrides[id]));
    }
  });
  setContracts(merged);
});
var loadedTeam = await store.get(STORAGE_KEYS.team) || DEMO_TEAM;
var loadedGroups = await store.get(STORAGE_KEYS.groups);
if (!loadedGroups) { try { var lsG = localStorage.getItem(STORAGE_KEYS.groups); if (lsG) { loadedGroups = JSON.parse(lsG); await store.set(STORAGE_KEYS.groups, loadedGroups); } } catch(e) {} }
loadedGroups = loadedGroups || [];
var renamedGroups = loadedGroups.map(function(g) {
  if (g.memberIds.length > 0) {
    var leader = loadedTeam.find(function(m) { return m.id === g.memberIds[0]; });
    if (leader) return Object.assign({}, g, { name: "\u00C9quipe de " + leader.name.split(' ')[0] });
  }
  return g;
});
store.set(STORAGE_KEYS.groups, renamedGroups);
setGroups(renamedGroups);
setProxadCreds(await store.get(STORAGE_KEYS.proxadCredentials) || null);
setLoading(false);
})();
return function() { if (unsubPlan) unsubPlan(); if (unsubObj) unsubObj(); if (unsubContracts) unsubContracts(); };
}, []);

useEffect(function() {
  var FLASK = "http://localhost:5001";

  async function pollFlask() {
    try {
      var sr = await fetch(FLASK + "/status", { signal: AbortSignal.timeout(3000) });
      if (!sr.ok) throw new Error("HTTP " + sr.status);
      var status = await sr.json();
      setScraperStatus(status);
      setLastSync(status.last_sync);

      var cr = await fetch(FLASK + "/contracts/new", { signal: AbortSignal.timeout(5000) });
      var data = await cr.json();

      if (data.contracts && data.contracts.length > 0) {
        setContracts(function(prev) {
          var existingIds = new Set(prev.map(function(c) { return c.id; }));
          var added = data.contracts.filter(function(c) { return !existingIds.has(c.id); });
          if (added.length === 0) return prev;
          console.log("[Flask] " + added.length + " nouveaux contrats re\u00E7us.");
          var merged = prev.concat(added);
          store.get(STORAGE_KEYS.contracts).then(function(existing) {
            var overrides = existing || {};
            merged.forEach(function(contract) {
              var orig = DEMO_CONTRACTS.find(function(d) { return d.id === contract.id; });
              if (!orig) overrides[contract.id] = { commercial: contract.commercial, vtaResolved: contract.vtaResolved, date: contract.date, heure: contract.heure, ville: contract.ville, rue: contract.rue, status: contract.status };
            });
            store.set(STORAGE_KEYS.contracts, overrides);
          });
          return merged;
        });
      }
    } catch (e) {
      setScraperStatus(null);
    }
  }

  pollFlask();
  var interval = setInterval(pollFlask, 60000);
  return function() { clearInterval(interval); };
}, []);

var saveTeam = function(t) { setTeam(t); store.set(STORAGE_KEYS.team, t); };
var saveCars = function(c) { setCars(c); store.set(STORAGE_KEYS.cars, c); };
var saveContracts = function(c) {
  setContracts(c);
  skipNextContractSnap.current = true;
  store.get(STORAGE_KEYS.contracts).then(function(existing) {
    var overrides = existing || {};
    c.forEach(function(contract) {
      var orig = DEMO_CONTRACTS.find(function(d) { return d.id === contract.id; });
      if (!orig || contract.commercial !== orig.commercial || contract.vtaResolved !== orig.vtaResolved) {
        var entry = { commercial: contract.commercial };
        if (contract.vtaResolved !== undefined) entry.vtaResolved = contract.vtaResolved;
        overrides[contract.id] = entry;
      }
    });
    store.set(STORAGE_KEYS.contracts, overrides);
  });
};
var saveDailyPlan = function(todayPlan) {
  var todayKey = localDateStr(new Date());
  var full = Object.assign({}, dailyPlan || {});
  full[todayKey] = todayPlan;
  setDailyPlan(full);
  store.set(STORAGE_KEYS.dailyPlan, full);
};
var saveObjectives = function(o) { setObjectives(o); store.set(STORAGE_KEYS.objectives, o); };
var saveGroups = function(g) { setGroups(g); store.set(STORAGE_KEYS.groups, g); };
var saveProxadCreds = function(c) { setProxadCreds(c); store.set(STORAGE_KEYS.proxadCredentials, c); };

if (loading) return (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "linear-gradient(-45deg, #0f0b1e, #1a1145, #0c2340)", fontFamily: "-apple-system, sans-serif" }}>
    <motion.div
      animate={{ scale: [1, 1.1, 1] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(145deg, #0071E3, #34C759)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, color: "#fff", boxShadow: "0 0 30px rgba(0,113,227,0.4)" }}>A</div>
    </motion.div>
  </div>
);

var tabContent = null;
if (tab === "dashboard") tabContent = <DashboardTab team={team} contracts={contracts} saveContracts={saveContracts} dailyPlan={dailyPlan} cars={cars} lastSync={lastSync} scraperStatus={scraperStatus} objectives={objectives} />;
else if (tab === "team") tabContent = <TeamTab team={team} saveTeam={saveTeam} contracts={contracts} saveContracts={saveContracts} groups={groups} saveGroups={saveGroups} />;
else if (tab === "cars") tabContent = <CarsTab team={team} cars={cars} saveCars={saveCars} dailyPlan={dailyPlan} saveDailyPlan={saveDailyPlan} groups={groups} proxadCredentials={proxadCreds} saveProxadCreds={saveProxadCreds} />;
else if (tab === "contracts") tabContent = <ContractsTab contracts={contracts} team={team} dailyPlan={dailyPlan} cars={cars} saveContracts={saveContracts} />;
else if (tab === "map") tabContent = <MapTab />;
else if (tab === "secteurs") tabContent = <SecteursTab />;
else if (tab === "objectifs") tabContent = <ObjectifsTab team={team} contracts={contracts} objectives={objectives} saveObjectives={saveObjectives} />;
else if (tab === "cloche") tabContent = <ClocheTab team={team} contracts={contracts} />;
else if (tab === "import") tabContent = <ImportTab team={team} saveTeam={saveTeam} contracts={contracts} saveContracts={saveContracts} />;
else if (tab === "carnet") tabContent = <CarnetTab />;

return (

<div style={{ fontFamily: "-apple-system, 'SF Pro Display', 'SF Pro Text', BlinkMacSystemFont, sans-serif", background: "linear-gradient(-45deg, #0f0b1e, #1a1145, #0c2340, #0f0b1e)", backgroundSize: "400% 400%", animation: "gradient-shift 15s ease infinite", minHeight: "100vh", color: "#f0f0f5" }}>

  <header style={{ background: "rgba(15,11,30,0.7)", backdropFilter: "blur(40px) saturate(180%)", WebkitBackdropFilter: "blur(40px) saturate(180%)", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "0 32px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(145deg, #0071E3 0%, #34C759 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: -0.5, boxShadow: "0 0 12px rgba(0,113,227,0.3)" }}>A</div>
      <span style={{ fontWeight: 600, fontSize: 15, color: "#f0f0f5", letterSpacing: -0.3 }}>Agence</span>
    </div>
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {scraperStatus !== null ? (
        <span title={"Derni\u00E8re sync : " + (lastSync ? new Date(lastSync).toLocaleTimeString("fr-FR") : "\u2014")}
          style={{ fontSize: 11, fontWeight: 500, color: scraperStatus.ok ? "#34C759" : "#FF3B30",
            background: scraperStatus.ok ? "rgba(52,199,89,0.15)" : "rgba(255,59,48,0.15)", borderRadius: 99, padding: "3px 10px",
            display: "flex", alignItems: "center", gap: 4, cursor: "default", border: "1px solid " + (scraperStatus.ok ? "rgba(52,199,89,0.25)" : "rgba(255,59,48,0.25)") }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: scraperStatus.ok ? "#34C759" : "#FF3B30", display: "inline-block", boxShadow: "0 0 6px " + (scraperStatus.ok ? "rgba(52,199,89,0.5)" : "rgba(255,59,48,0.5)") }} />
          {scraperStatus.syncing ? "Sync\u2026" : scraperStatus.ok ? "Live" : "Erreur"}
        </span>
      ) : (
        <span title="Serveur Flask non d\u00E9marr\u00E9 \u2014 voir README"
          style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.05)", borderRadius: 99, padding: "3px 10px",
            display: "flex", alignItems: "center", gap: 4, cursor: "default", border: "1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: "rgba(255,255,255,0.35)", display: "inline-block" }} />
          Offline
        </span>
      )}
      <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.55)", background: "rgba(255,255,255,0.05)", borderRadius: 99, padding: "3px 10px", border: "1px solid rgba(255,255,255,0.08)" }}>{team.filter(function(m) { return m.active; }).length} actifs</span>
      <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.55)", background: "rgba(255,255,255,0.05)", borderRadius: 99, padding: "3px 10px", border: "1px solid rgba(255,255,255,0.08)" }}>{cars.length} voitures</span>
    </div>
  </header>

  <LayoutGroup>
  <nav style={{ display: "flex", gap: 0, padding: "0 24px", background: "rgba(15,11,30,0.5)", backdropFilter: "blur(40px)", WebkitBackdropFilter: "blur(40px)", borderBottom: "1px solid rgba(255,255,255,0.08)", overflowX: "auto", position: "relative" }}>
    {TABS.map(function(t) {
      var active = tab === t.id;
      return (
        <button key={t.id} onClick={function() { setTab(t.id); }} style={{
          display: "flex", alignItems: "center", gap: 5, padding: "0 16px", height: 44,
          border: "none", background: "none", cursor: "pointer", fontSize: 13,
          fontWeight: active ? 600 : 400, color: active ? "#0071E3" : "rgba(255,255,255,0.45)",
          borderBottom: "2px solid transparent",
          whiteSpace: "nowrap", transition: "color 0.15s",
          letterSpacing: -0.1, position: "relative",
        }}>
          {t.label}
          {active && (
            <motion.div
              layoutId="tab-indicator"
              style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: "#0071E3", borderRadius: 1, boxShadow: "0 0 8px rgba(0,113,227,0.5)" }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
        </button>
      );
    })}
  </nav>
  </LayoutGroup>

  <main style={{ padding: "28px 32px", maxWidth: 1100, margin: "0 auto" }}>
    <AnimatePresence mode="wait">
      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25, ease: "easeOut" }}>
        {tabContent}
      </motion.div>
    </AnimatePresence>
  </main>
</div>
);
}
