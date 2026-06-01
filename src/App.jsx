import React, { useState, useEffect } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { db, store, AGENCY_CONFIG, STORAGE_KEYS, doc, getDoc, onSnapshot } from "./data/store.js";
import { DEMO_TEAM } from "./data/team.js";
import { DEMO_CARS } from "./data/team.js";
import { DEMO_CONTRACTS, carnetToContracts, bouyguesCarnetToContracts } from "./data/contracts.js";
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
import { normalizeCustomSectors } from "./helpers/import-parser.js";

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
var [tab, setTab] = useState("dashboard");
var [team, setTeam] = useState([]);
var [cars, setCars] = useState([]);
var [contracts, setContracts] = useState([]);
var [objectives, setObjectives] = useState({});
var [dailyPlan, setDailyPlan] = useState(null);
var [loading, setLoading] = useState(true);
var [scraperStatus, setScraperStatus] = useState(null);
var [scrapeAction, setScrapeAction] = useState("idle");
var [lastSync, setLastSync] = useState(null);
var [groups, setGroups] = useState([]);
var [proxadCreds, setProxadCreds] = useState(null);
var [customSectors, setCustomSectors] = useState({ stratygo: {}, talc: {} });
var skipNextContractSnap = React.useRef(false);
var navRefs = React.useRef({});
var scrapePollRef = React.useRef(null);
var baseContractsRef = React.useRef(DEMO_CONTRACTS);

function mergeContractsWithOverrides(baseContracts, savedResolutions) {
  var overrides = savedResolutions || {};
  var baseIds = new Set(baseContracts.map(function(c) { return c.id; }));
  var merged = baseContracts.map(function(c) {
    var saved = overrides[c.id];
    if (!saved) return c;
    var useCommercial = c.id.indexOf('byg-') === 0 ? c.commercial : (saved.commercial || c.commercial);
    return Object.assign({}, c, { commercial: useCommercial, vtaResolved: saved.vtaResolved !== undefined ? saved.vtaResolved : c.vtaResolved });
  });
  Object.keys(overrides).forEach(function(id) {
    if (!baseIds.has(id) && overrides[id].date && id.indexOf('byg-') !== 0) {
      merged.push(Object.assign({ id: id }, overrides[id]));
    }
  });
  return merged;
}

async function loadFreshBaseContracts() {
  var freeUrl = AGENCY_CONFIG.feeds && AGENCY_CONFIG.feeds.freeContracts;
  var bouyguesUrl = AGENCY_CONFIG.feeds && AGENCY_CONFIG.feeds.bouyguesContracts;
  if (!freeUrl || !bouyguesUrl) return null;
  var opts = { cache: "no-store", signal: AbortSignal.timeout(8000) };
  var responses = await Promise.all([fetch(freeUrl, opts), fetch(bouyguesUrl, opts)]);
  if (!responses[0].ok || !responses[1].ok) throw new Error("fresh_contracts_unavailable");
  var data = await Promise.all(responses.map(function(r) { return r.json(); }));
  var freeRows = data[0].rows || data[0] || [];
  var bouyguesRows = data[1].rows || [];
  return carnetToContracts(freeRows, data[0].scraped_at || null).concat(bouyguesCarnetToContracts(bouyguesRows));
}

useEffect(function() {
var unsubPlan, unsubObj, unsubContracts;
(async function() {
try {
  var dpLs = localStorage.getItem(STORAGE_KEYS.dailyPlan);
  if (dpLs) { var dpSnap = await getDoc(doc(db, AGENCY_CONFIG.firestoreCollection, STORAGE_KEYS.dailyPlan)); if (!dpSnap.exists()) await store.set(STORAGE_KEYS.dailyPlan, JSON.parse(dpLs)); }
  var obLs = localStorage.getItem(STORAGE_KEYS.objectives);
  if (obLs) { var obSnap = await getDoc(doc(db, AGENCY_CONFIG.firestoreCollection, STORAGE_KEYS.objectives)); if (!obSnap.exists()) await store.set(STORAGE_KEYS.objectives, JSON.parse(obLs)); }
} catch(e) {}
unsubPlan = onSnapshot(doc(db, AGENCY_CONFIG.firestoreCollection, STORAGE_KEYS.dailyPlan), function(snap) {
  var raw = snap.exists() ? (snap.data().data || null) : null;
  if (raw && Object.keys(raw).length > 0 && !Object.keys(raw).some(function(k) { return /^\d{4}-\d{2}-\d{2}$/.test(k); })) {
    var migrated = {}; migrated[localDateStr(new Date())] = raw;
    store.set(STORAGE_KEYS.dailyPlan, migrated);
    raw = migrated;
  }
  setDailyPlan(raw);
});
unsubObj = onSnapshot(doc(db, AGENCY_CONFIG.firestoreCollection, STORAGE_KEYS.objectives), function(snap) {
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
setContracts(mergeContractsWithOverrides(baseContractsRef.current, savedResolutions));
loadFreshBaseContracts().then(function(freshBaseContracts) {
  if (!freshBaseContracts || freshBaseContracts.length === 0) return;
  baseContractsRef.current = freshBaseContracts;
  setContracts(mergeContractsWithOverrides(freshBaseContracts, savedResolutions));
}).catch(function() {});
unsubContracts = onSnapshot(doc(db, AGENCY_CONFIG.firestoreCollection, STORAGE_KEYS.contracts), function(snap) {
  if (skipNextContractSnap.current) { skipNextContractSnap.current = false; return; }
  var overrides = snap.exists() ? (snap.data().data || {}) : {};
  setContracts(mergeContractsWithOverrides(baseContractsRef.current, overrides));
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
var loadedSectors = await store.get(STORAGE_KEYS.jacheres);
if (!loadedSectors) { try { var lsJ = localStorage.getItem(STORAGE_KEYS.jacheres); if (lsJ) { loadedSectors = JSON.parse(lsJ); await store.set(STORAGE_KEYS.jacheres, loadedSectors); } } catch(e) {} }
setCustomSectors(normalizeCustomSectors(loadedSectors));
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
          var orig = baseContractsRef.current.find(function(d) { return d.id === contract.id; });
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

useEffect(function() {
  return function() {
    if (scrapePollRef.current) clearInterval(scrapePollRef.current);
  };
}, []);

useEffect(function() {
  var activeButton = navRefs.current[tab];
  if (activeButton && activeButton.scrollIntoView) {
    activeButton.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }
}, [tab]);

var saveTeam = function(t) { setTeam(t); store.set(STORAGE_KEYS.team, t); };
var saveCars = function(c) { setCars(c); store.set(STORAGE_KEYS.cars, c); };
var saveContracts = function(c) {
  setContracts(c);
  skipNextContractSnap.current = true;
  store.get(STORAGE_KEYS.contracts).then(function(existing) {
    var overrides = existing || {};
    c.forEach(function(contract) {
      var orig = baseContractsRef.current.find(function(d) { return d.id === contract.id; });
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
var saveCustomSectors = function(s) { var normalized = normalizeCustomSectors(s); setCustomSectors(normalized); store.set(STORAGE_KEYS.jacheres, normalized); };
var pollScrapeStatus = async function(startedAt) {
  try {
    var response = await fetch("/api/scrape-status?since=" + encodeURIComponent(startedAt));
    if (!response.ok) throw new Error("HTTP " + response.status);
    var data = await response.json();
    var run = data.run;
    if (!run) {
      setScrapeAction("queued");
      return;
    }
    if (run.status === "completed") {
      setScrapeAction(run.conclusion === "success" ? "done" : "failed");
      if (scrapePollRef.current) clearInterval(scrapePollRef.current);
      scrapePollRef.current = null;
      setTimeout(function() { setScrapeAction("idle"); }, 12000);
      return;
    }
    setScrapeAction(run.status === "queued" ? "queued" : "running");
  } catch(e) {
    setScrapeAction("error");
    if (scrapePollRef.current) clearInterval(scrapePollRef.current);
    scrapePollRef.current = null;
    setTimeout(function() { setScrapeAction("idle"); }, 7000);
  }
};
var triggerScrape = async function() {
  if (scrapeAction === "loading" || scrapeAction === "queued" || scrapeAction === "running") return;
  var startedAt = new Date().toISOString();
  setScrapeAction("loading");
  try {
    var response = await fetch("/api/scrape", { method: "POST" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    setScrapeAction("queued");
    if (scrapePollRef.current) clearInterval(scrapePollRef.current);
    await pollScrapeStatus(startedAt);
    scrapePollRef.current = setInterval(function() { pollScrapeStatus(startedAt); }, 8000);
  } catch(e) {
    setScrapeAction("error");
    setTimeout(function() { setScrapeAction("idle"); }, 7000);
  }
};

if (loading) return (
  <div className="territory-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
    <motion.div
      animate={{ scale: [1, 1.1, 1] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}>
      <div style={{ width: 48, height: 48, borderRadius: 10, background: "#4C5760", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, color: "#fffdf7", boxShadow: "0 18px 48px rgba(76,87,96,0.18)" }}>LO</div>
    </motion.div>
  </div>
);

var tabContent = null;
if (tab === "dashboard") tabContent = <DashboardTab team={team} contracts={contracts} saveContracts={saveContracts} dailyPlan={dailyPlan} cars={cars} lastSync={lastSync} scraperStatus={scraperStatus} objectives={objectives} />;
else if (tab === "team") tabContent = <TeamTab team={team} saveTeam={saveTeam} contracts={contracts} saveContracts={saveContracts} groups={groups} saveGroups={saveGroups} />;
else if (tab === "cars") tabContent = <CarsTab team={team} cars={cars} saveCars={saveCars} dailyPlan={dailyPlan} saveDailyPlan={saveDailyPlan} groups={groups} proxadCredentials={proxadCreds} saveProxadCreds={saveProxadCreds} contracts={contracts} customSectors={customSectors} />;
else if (tab === "contracts") tabContent = <ContractsTab contracts={contracts} team={team} dailyPlan={dailyPlan} cars={cars} saveContracts={saveContracts} />;
else if (tab === "map") tabContent = <MapTab customSectors={customSectors} />;
else if (tab === "secteurs") tabContent = <SecteursTab customSectors={customSectors} />;
else if (tab === "objectifs") tabContent = <ObjectifsTab team={team} contracts={contracts} objectives={objectives} saveObjectives={saveObjectives} />;
else if (tab === "cloche") tabContent = <ClocheTab team={team} contracts={contracts} />;
else if (tab === "import") tabContent = <ImportTab team={team} saveTeam={saveTeam} contracts={contracts} saveContracts={saveContracts} customSectors={customSectors} saveCustomSectors={saveCustomSectors} />;
else if (tab === "carnet") tabContent = <CarnetTab />;

return (

<div className="territory-shell" style={{ fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

  <header className="app-header" style={{ background: "rgba(255,253,247,0.78)", backdropFilter: "blur(24px) saturate(140%)", WebkitBackdropFilter: "blur(24px) saturate(140%)", borderBottom: "1px solid rgba(76,87,96,0.14)", padding: "0 32px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 32, height: 32, borderRadius: 9, background: "#4C5760", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: "#fffdf7", letterSpacing: 0, boxShadow: "0 10px 24px rgba(76,87,96,0.16)" }}>LO</div>
      <div>
        <span className="header-brand-text" style={{ display: "block", fontWeight: 800, fontSize: 14, color: "#2f363b", letterSpacing: 0 }}>La Ouirinance</span>
        <span className="header-brand-text" style={{ display: "block", fontWeight: 700, fontSize: 10, color: "#8d887b", letterSpacing: 0, textTransform: "uppercase" }}>Territory desk</span>
      </div>
    </div>
    <div className="header-right" style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <button
        onClick={triggerScrape}
        disabled={scrapeAction === "loading" || scrapeAction === "queued" || scrapeAction === "running"}
        title={scrapeAction === "done" ? "Scraping termin\u00E9" : scrapeAction === "failed" ? "Scraping termin\u00E9 en erreur" : scrapeAction === "error" ? "Impossible de suivre la mise \u00E0 jour" : "Lancer une mise \u00E0 jour des contrats"}
        style={{ height: 28, borderRadius: 99, padding: "0 12px", border: "1px solid " + (scrapeAction === "error" || scrapeAction === "failed" ? "rgba(102,99,91,0.26)" : "rgba(76,87,96,0.18)"), background: scrapeAction === "loading" || scrapeAction === "queued" || scrapeAction === "running" ? "rgba(147,168,172,0.22)" : scrapeAction === "done" ? "rgba(147,168,172,0.24)" : scrapeAction === "error" || scrapeAction === "failed" ? "rgba(102,99,91,0.14)" : "rgba(255,253,247,0.78)", color: scrapeAction === "error" || scrapeAction === "failed" ? "var(--lo-danger)" : "#4C5760", fontSize: 11, fontWeight: 900, fontFamily: "inherit", cursor: scrapeAction === "loading" || scrapeAction === "queued" || scrapeAction === "running" ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", opacity: scrapeAction === "loading" || scrapeAction === "queued" || scrapeAction === "running" ? 0.85 : 1 }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: scrapeAction === "error" || scrapeAction === "failed" ? "var(--lo-danger)" : scrapeAction === "done" ? "#93A8AC" : "#4C5760", display: "inline-block" }} />
        {scrapeAction === "loading" ? "Mise \u00E0 jour\u2026" : scrapeAction === "queued" ? "En file" : scrapeAction === "running" ? "En cours" : scrapeAction === "done" ? "Termin\u00E9e" : scrapeAction === "failed" ? "\u00C9chec" : scrapeAction === "error" ? "Erreur" : "Mise \u00E0 jour"}
      </button>
      {scraperStatus !== null ? (
        <span title={"Derni\u00E8re sync : " + (lastSync ? new Date(lastSync).toLocaleTimeString("fr-FR") : "\u2014")}
          style={{ fontSize: 11, fontWeight: 800, color: scraperStatus.ok ? "#4C5760" : "#66635B",
            background: scraperStatus.ok ? "rgba(147,168,172,0.20)" : "rgba(102,99,91,0.14)", borderRadius: 99, padding: "4px 10px",
            display: "flex", alignItems: "center", gap: 5, cursor: "default", border: "1px solid " + (scraperStatus.ok ? "rgba(147,168,172,0.36)" : "rgba(102,99,91,0.24)") }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: scraperStatus.ok ? "#93A8AC" : "#66635B", display: "inline-block" }} />
          {scraperStatus.syncing ? "Sync\u2026" : scraperStatus.ok ? "Live" : "Erreur"}
        </span>
      ) : (
        <span title="Serveur Flask non d\u00E9marr\u00E9 \u2014 voir README"
          style={{ fontSize: 11, fontWeight: 800, color: "#8d887b", background: "rgba(255,253,247,0.70)", borderRadius: 99, padding: "4px 10px",
            display: "flex", alignItems: "center", gap: 5, cursor: "default", border: "1px solid rgba(76,87,96,0.12)" }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: "#A59E8C", display: "inline-block" }} />
          Offline
        </span>
      )}
      <span className="header-stat" style={{ fontSize: 12, fontWeight: 800, color: "#4C5760", background: "rgba(255,253,247,0.70)", borderRadius: 99, padding: "4px 10px", border: "1px solid rgba(76,87,96,0.12)" }}>{team.filter(function(m) { return m.active; }).length} actifs</span>
      <span className="header-stat" style={{ fontSize: 12, fontWeight: 800, color: "#4C5760", background: "rgba(255,253,247,0.70)", borderRadius: 99, padding: "4px 10px", border: "1px solid rgba(76,87,96,0.12)" }}>{cars.length} voitures</span>
    </div>
  </header>

  <LayoutGroup>
  <nav className="app-nav" style={{ display: "flex", gap: 6, padding: "8px 24px", background: "rgba(255,253,247,0.52)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", borderBottom: "1px solid rgba(76,87,96,0.10)", overflowX: "auto", position: "sticky", top: 58, zIndex: 90 }}>
    {TABS.map(function(t) {
      var active = tab === t.id;
      return (
        <button key={t.id} ref={function(node) { if (node) navRefs.current[t.id] = node; }} className={active ? "app-nav-button app-nav-button-active" : "app-nav-button"} onClick={function() { setTab(t.id); }} style={{
          display: "flex", alignItems: "center", gap: 5, padding: "0 14px", height: 34,
          border: "1px solid " + (active ? "rgba(76,87,96,0.28)" : "transparent"), background: active ? "rgba(255,253,247,0.86)" : "transparent", cursor: "pointer", fontSize: 13,
          fontWeight: active ? 800 : 700, color: active ? "#2f363b" : "#66635B",
          borderRadius: 99,
          whiteSpace: "nowrap", transition: "color 0.15s",
          letterSpacing: 0, position: "relative",
        }}>
          {t.label}
          {active && (
            <motion.div
              layoutId="tab-indicator"
              style={{ position: "absolute", bottom: 5, left: 12, right: 12, height: 2, background: "#93A8AC", borderRadius: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
        </button>
      );
    })}
  </nav>
  </LayoutGroup>

  <main className="app-main" style={{ padding: "32px 32px 44px", maxWidth: 1160, margin: "0 auto" }}>
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
