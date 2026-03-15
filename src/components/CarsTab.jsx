import React, { useState, useRef } from "react";
import { Badge, Card, Btn, Sel, Inp, Modal, StatCard } from "./ui.jsx";
import { ROLES, ROLE_LABELS, ROLE_COLORS, OPERATORS, OP_COLORS } from "../constants/roles.js";
import { VTA_GROUPS } from "../constants/vta.js";
import { CommuneAutocomplete } from "./SectorAutocomplete.jsx";
import { localDateStr } from "../helpers/date.js";
import { isCaduque } from "../helpers/status.js";
import { searchCommune, getProxadUsers, affectCommune, matchMemberToProxadUser } from "../data/proxad.js";
import { getDormantCommunes, suggestCluster, haversine } from "../helpers/suggestions.js";

function CarsTab({ team, cars, saveCars, dailyPlan, saveDailyPlan, groups, proxadCredentials, saveProxadCreds, contracts }) {
  var CAR_PALETTE = ["#0071E3","#34C759","#FF9F0A","#AF52DE","#FF2D55","#5AC8FA","#FF6B35","#00B4D8"];
  var _todayKey = localDateStr(new Date());

  // --- Historique veille ---
  var _today = new Date();
  var _dayOfWeek = _today.getDay();
  var _veilleDates = [];
  if (_dayOfWeek === 1) {
    var _fri = new Date(_today); _fri.setDate(_today.getDate() - 3);
    var _sat = new Date(_today); _sat.setDate(_today.getDate() - 2);
    _veilleDates.push(localDateStr(_fri));
    _veilleDates.push(localDateStr(_sat));
  } else if (_dayOfWeek === 0) {
    var _fri2 = new Date(_today); _fri2.setDate(_today.getDate() - 2);
    var _sat2 = new Date(_today); _sat2.setDate(_today.getDate() - 1);
    _veilleDates.push(localDateStr(_fri2));
    _veilleDates.push(localDateStr(_sat2));
  } else {
    var _yesterday = new Date(_today); _yesterday.setDate(_today.getDate() - 1);
    _veilleDates.push(localDateStr(_yesterday));
  }

  var _veilleLabel = _veilleDates.length === 2
    ? new Date(_veilleDates[0] + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
      + " & " + new Date(_veilleDates[1] + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
    : new Date(_veilleDates[0] + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  var _veillePlans = _veilleDates.map(function(d) { return { date: d, plan: (dailyPlan && dailyPlan[d]) || null }; });
  var _hasVeillePlan = _veillePlans.some(function(vp) { return vp.plan !== null; });

  var _veilleCounts = {};
  if (contracts) {
    contracts.forEach(function(c) {
      if (_veilleDates.indexOf(c.date) >= 0 && !isCaduque(c)) {
        _veilleCounts[c.commercial] = (_veilleCounts[c.commercial] || 0) + 1;
      }
    });
  }
  var _veilleTotal = 0;
  var _veilleActifs = 0;
  Object.keys(_veilleCounts).forEach(function(k) { _veilleTotal += _veilleCounts[k]; if (_veilleCounts[k] > 0) _veilleActifs++; });
  var _veilleMoy = _veilleActifs > 0 ? (_veilleTotal / _veilleActifs).toFixed(1) : "0";

  const [plan, setPlan] = useState((dailyPlan && dailyPlan[_todayKey]) || {});
  const [dragging, setDragging] = useState(null); // { memberId, fromCarId }
  const [dropTarget, setDropTarget] = useState(null); // carId or "pool"
  const [picker, setPicker] = useState(null); // carId
  const [mo, setMo] = useState(false);
  const [ec, setEc] = useState(null);
  const [cf, setCf] = useState({ name: "", seats: 5, driverId: null });
  const [unlockStates, setUnlockStates] = useState({});
  const [showProxadConfig, setShowProxadConfig] = useState(false);
  const [proxadForm, setProxadForm] = useState({ login: "", password: "" });
  var proxadUsersRef = useRef(null);
  const [suggestions, setSuggestions] = useState({});
  var suggestionSkipRef = useRef({});

  var at = team.filter(function(m) { return m.active; });

  // Passengers first: all members explicitly added to a car
  var passengerIds = new Set();
  cars.forEach(function(car) {
    var cp = plan[car.id];
    if (cp && cp.members) cp.members.forEach(function(id) { passengerIds.add(id); });
  });

  // A car is inactive today if its driver is riding as passenger in another car
  function isCarInactive(car) { return car.driverId ? passengerIds.has(car.driverId) : false; }

  // inCar = passengers + drivers of ACTIVE cars only
  var inCar = new Set(passengerIds);
  cars.forEach(function(car) {
    if (car.driverId && !isCarInactive(car)) inCar.add(car.driverId);
  });
  var unassigned = at.filter(function(m) { return !inCar.has(m.id); });

  function updatePlan(np) { setPlan(np); saveDailyPlan(np); }

  function addPassenger(cid, mid) {
    var u = JSON.parse(JSON.stringify(plan));
    if (!u[cid]) u[cid] = { members: [], sector: "", zoneType: "stratygo", vtaCode: "" };
    if (u[cid].members.indexOf(mid) < 0) u[cid].members.push(mid);
    updatePlan(u);
  }

  function removePassenger(cid, mid) {
    var u = JSON.parse(JSON.stringify(plan));
    if (!u[cid]) return;
    u[cid].members = u[cid].members.filter(function(i) { return i !== mid; });
    updatePlan(u);
  }

  function moveToPool(mid, fromCarId) {
    var u = JSON.parse(JSON.stringify(plan));
    if (fromCarId && u[fromCarId]) {
      u[fromCarId].members = u[fromCarId].members.filter(function(i) { return i !== mid; });
    }
    updatePlan(u);
  }

  function movePassenger(mid, fromCarId, toCarId) {
    var u = JSON.parse(JSON.stringify(plan));
    if (fromCarId && u[fromCarId]) {
      u[fromCarId].members = u[fromCarId].members.filter(function(i) { return i !== mid; });
    }
    if (!u[toCarId]) u[toCarId] = { members: [], sector: "", zoneType: "stratygo", vtaCode: "" };
    if (u[toCarId].members.indexOf(mid) < 0) u[toCarId].members.push(mid);
    updatePlan(u);
  }

  function setZoneType(cid, z) {
    var u = JSON.parse(JSON.stringify(plan));
    if (!u[cid]) u[cid] = { members: [], sector: "", zoneType: "stratygo", vtaCode: "" };
    u[cid].zoneType = z; if (z === "stratygo") u[cid].vtaCode = "";
    if (!u[cid].memberZoneTypes) u[cid].memberZoneTypes = {};
    var car = cars.find(function(c) { return c.id === cid; });
    var allIds = (u[cid].members || []).slice();
    if (car && car.driverId) allIds.push(car.driverId);
    allIds.forEach(function(mid) { u[cid].memberZoneTypes[mid] = z; });
    updatePlan(u);
  }

  function setMemberCommune(cid, mid, commune) {
    var u = JSON.parse(JSON.stringify(plan));
    if (!u[cid]) u[cid] = { members: [], sector: "", zoneType: "stratygo", vtaCode: "" };
    if (!u[cid].memberCommunes) u[cid].memberCommunes = {};
    u[cid].memberCommunes[mid] = commune;
    updatePlan(u);
  }

  function setMemberVtaCode(cid, mid, code) {
    var u = JSON.parse(JSON.stringify(plan));
    if (!u[cid]) u[cid] = { members: [], sector: "", zoneType: "stratygo", vtaCode: "" };
    if (!u[cid].memberVtaCodes) u[cid].memberVtaCodes = {};
    u[cid].memberVtaCodes[mid] = code;
    updatePlan(u);
  }

  function setMemberZoneType(cid, mid, zone) {
    var u = JSON.parse(JSON.stringify(plan));
    if (!u[cid]) u[cid] = { members: [], sector: "", zoneType: "stratygo", vtaCode: "" };
    if (!u[cid].memberZoneTypes) u[cid].memberZoneTypes = {};
    u[cid].memberZoneTypes[mid] = zone;
    updatePlan(u);
  }

  function getMemberZone(cp, memberId) {
    return (cp.memberZoneTypes && cp.memberZoneTypes[memberId]) || cp.zoneType || "stratygo";
  }

  function computeSuggestion(carId) {
    var cp = plan[carId] || { members: [], zoneType: "stratygo" };
    var car = cars.find(function(c) { return c.id === carId; });
    if (!car) return;
    var memberIds = (cp.members || []).slice();
    if (car.driverId) memberIds.push(car.driverId);
    var numPersonnes = memberIds.length;
    if (numPersonnes === 0) return;

    var zt = cp.zoneType || "stratygo";
    var dormant = getDormantCommunes(2).filter(function(c) { return c.zoneType === zt; });

    var assignedCommunes = {};
    Object.keys(plan).forEach(function(cid) {
      var p = plan[cid];
      if (p && p.memberCommunes) {
        Object.keys(p.memberCommunes).forEach(function(mid) {
          var v = p.memberCommunes[mid];
          if (v) assignedCommunes[v.toUpperCase()] = true;
        });
      }
    });

    var filtered = dormant.filter(function(c) { return !assignedCommunes[c.v]; });
    var skip = suggestionSkipRef.current[carId] || 0;
    var result = suggestCluster(filtered, numPersonnes, 20, skip);
    suggestionSkipRef.current[carId] = skip + 1;
    setSuggestions(function(prev) { return Object.assign({}, prev, { [carId]: result }); });
  }

  function applySuggestion(carId) {
    var sug = suggestions[carId];
    if (!sug || !sug.communes || sug.communes.length === 0) return;
    var car = cars.find(function(c) { return c.id === carId; });
    if (!car) return;
    var cp = plan[carId] || { members: [], zoneType: "stratygo" };
    var memberIds = [];
    if (car.driverId) memberIds.push(car.driverId);
    (cp.members || []).forEach(function(id) { memberIds.push(id); });
    if (memberIds.length === 0) return;

    var big = sug.communes.filter(function(c) { return c.p >= 1000; }).sort(function(a, b) { return b.p - a.p; });
    var small = sug.communes.filter(function(c) { return c.p < 1000; }).sort(function(a, b) { return b.p - a.p; });
    var mixed = [];
    var bi = 0, si = 0;
    while (mixed.length < memberIds.length && (bi < big.length || si < small.length)) {
      if (bi < big.length) mixed.push(big[bi++]);
      if (mixed.length < memberIds.length && si < small.length) mixed.push(small[si++]);
    }

    var u = JSON.parse(JSON.stringify(plan));
    if (!u[carId]) u[carId] = { members: cp.members || [], sector: "", zoneType: cp.zoneType || "stratygo", vtaCode: "" };
    if (!u[carId].memberCommunes) u[carId].memberCommunes = {};

    for (var i = 0; i < memberIds.length && i < mixed.length; i++) {
      u[carId].memberCommunes[memberIds[i]] = mixed[i].v;
    }

    var allSameSector = mixed.length > 0 && mixed.every(function(c) { return c.sector === mixed[0].sector; });
    if (allSameSector && mixed.length > 0) {
      u[carId].sector = mixed[0].sector;
    }

    updatePlan(u);
  }

  function setVtaCode(cid, v) {
    var u = JSON.parse(JSON.stringify(plan));
    if (!u[cid]) u[cid] = { members: [], sector: "", zoneType: "talc", vtaCode: "" };
    u[cid].vtaCode = v; updatePlan(u);
  }

  function saveCar() {
    if (!cf.name.trim()) return;
    if (ec) saveCars(cars.map(function(c) { return c.id === ec.id ? Object.assign({}, c, cf) : c; }));
    else saveCars([...cars, { id: Date.now(), ...cf }]);
    setMo(false); setEc(null);
  }

  function resetDay() {
    var np = {};
    cars.forEach(function(car) {
      var old = plan[car.id] || {};
      np[car.id] = { members: [], sector: old.sector || "", zoneType: old.zoneType || "stratygo", vtaCode: old.vtaCode || "" };
    });
    updatePlan(np);
  }

  function openProxadConfig() {
    setProxadForm(proxadCredentials || { login: "", password: "" });
    setShowProxadConfig(true);
  }
  function saveProxadConfig() {
    if (!proxadForm.login.trim() || !proxadForm.password.trim()) return;
    saveProxadCreds({ login: proxadForm.login.trim(), password: proxadForm.password.trim() });
    proxadUsersRef.current = null;
    setShowProxadConfig(false);
  }

  function handleUnlock(carId, memberId) {
    var cp = plan[carId] || {};
    var commune = (cp.memberCommunes && cp.memberCommunes[memberId]) || "";
    if (!commune.trim() || !proxadCredentials) return;
    var key = carId + "-" + memberId;
    setUnlockStates(function(prev) { return Object.assign({}, prev, { [key]: "loading" }); });
    var usersPromise = proxadUsersRef.current
      ? Promise.resolve(proxadUsersRef.current)
      : getProxadUsers(proxadCredentials).then(function(users) { proxadUsersRef.current = users; return users; });
    usersPromise.then(function(users) {
      return searchCommune(commune, proxadCredentials).then(function(communes) {
        if (!communes || communes.length === 0) throw new Error("Commune introuvable: " + commune);
        var communeId = communes[0].id;
        var member = team.find(function(m) { return m.id === memberId; });
        if (!member) throw new Error("Membre introuvable");
        var match = matchMemberToProxadUser(member, users);
        if (!match) throw new Error("Utilisateur Proxad introuvable pour " + member.name);
        return affectCommune([communeId], [match.user_id], proxadCredentials);
      });
    }).then(function() {
      setUnlockStates(function(prev) { return Object.assign({}, prev, { [key]: "success" }); });
      setTimeout(function() { setUnlockStates(function(prev) { return Object.assign({}, prev, { [key]: "idle" }); }); }, 3000);
    }).catch(function(err) {
      console.error("Proxad unlock error:", err);
      var msg = (err.message && err.message.indexOf("Failed to fetch") >= 0) ? "cors" : "error";
      setUnlockStates(function(prev) { return Object.assign({}, prev, { [key]: msg }); });
    });
  }

  // Reverse map: person name → VTA code
  var VTA_PERSON_MAP = {};
  Object.keys(VTA_GROUPS).forEach(function(code) {
    VTA_GROUPS[code].forEach(function(name) {
      if (!VTA_PERSON_MAP[name]) VTA_PERSON_MAP[name] = code;
    });
  });

  function initials(name) { var p = name.split(' '); return (p[0][0] + (p[p.length-1][0] || '')).toUpperCase(); }

  function Avatar({ name, role, size }) {
    var sz = size || 40;
    return (
      <div style={{ width: sz, height: sz, borderRadius: sz, background: ROLE_COLORS[role] + "22", border: "2px solid " + ROLE_COLORS[role] + "55", display: "flex", alignItems: "center", justifyContent: "center", fontSize: sz * 0.33, fontWeight: 700, color: ROLE_COLORS[role], flexShrink: 0 }}>
        {initials(name)}
      </div>
    );
  }

  function MemberTile({ m, onRemove, isDriver, accent, isDrag, fromCarId, vtaCode }) {
    var ops = Array.isArray(m.operators) ? m.operators : [m.operator].filter(Boolean);
    return (
      <div
        draggable={isDrag}
        onDragStart={isDrag ? function(e) { e.dataTransfer.effectAllowed = "move"; setDragging({ memberId: m.id, fromCarId: fromCarId }); } : undefined}
        onDragEnd={function() { setDragging(null); setDropTarget(null); }}
        style={{ background: "rgba(255,255,255,0.07)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderRadius: 14, padding: isDriver ? "14px 16px" : "10px 14px", boxShadow: "0 4px 16px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 10, position: "relative", borderLeft: "3px solid " + accent + (isDriver ? "" : "99"), minWidth: isDriver ? 185 : 160, opacity: dragging && dragging.memberId === m.id ? 0.4 : 1, cursor: isDrag ? "grab" : "default", transition: "opacity 0.15s", flexShrink: 0 }}>
        <Avatar name={m.name} role={m.role} size={isDriver ? 44 : 38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: isDriver ? 14 : 13, fontWeight: 600, color: "#f0f0f5", letterSpacing: -0.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
          <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: ROLE_COLORS[m.role], background: ROLE_COLORS[m.role] + "20", padding: "1px 6px", borderRadius: 99 }}>{ROLE_LABELS[m.role]}</span>
            {ops.map(function(op) { return <span key={op} style={{ fontSize: 10, fontWeight: 700, color: OP_COLORS[op], background: OP_COLORS[op] + "20", padding: "1px 6px", borderRadius: 99 }}>{op}</span>; })}
            {m.permis && <span style={{ fontSize: 10, fontWeight: 600, color: "#34C759", background: "#34C75920", padding: "1px 6px", borderRadius: 99 }}>Permis</span>}
            {vtaCode && <span style={{ fontSize: 10, fontWeight: 700, color: "#FF3B30", background: "#FF3B3012", padding: "1px 6px", borderRadius: 99, letterSpacing: 0.2 }}>{vtaCode}</span>}
          </div>
        </div>
        {onRemove && <button onClick={onRemove} style={{ position: "absolute", top: 5, right: 5, background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.25)", fontSize: 16, lineHeight: 1, padding: 2 }}>×</button>}
      </div>
    );
  }

  function PickerModal({ car, available, onClose }) {
    var [search, setSearch] = useState("");
    var driver = car.driverId ? team.find(function(m) { return m.id === car.driverId; }) : null;
    var driverOps = driver ? (Array.isArray(driver.operators) ? driver.operators : [driver.operator].filter(Boolean)) : [];
    var driverGroup = groups ? groups.find(function(g) { return driver && g.memberIds.indexOf(car.driverId) >= 0; }) : null;

    function score(m) {
      var s = 0;
      if (driverGroup && driverGroup.memberIds.indexOf(m.id) >= 0) s += 2;
      var mOps = Array.isArray(m.operators) ? m.operators : [m.operator].filter(Boolean);
      if (driverOps.some(function(op) { return mOps.indexOf(op) >= 0; })) s += 1;
      return s;
    }

    var sorted = available.slice().sort(function(a, b) { return score(b) - score(a); });
    var filtered = sorted.filter(function(m) { return m.name.toLowerCase().indexOf(search.toLowerCase()) >= 0; });

    return (
      <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
        <div className="picker-modal-content" style={{ background: "rgba(30,25,50,0.95)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 20, padding: 24, width: 380, maxHeight: "72vh", display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)" }} onClick={function(e) { e.stopPropagation(); }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#f0f0f5" }}>Ajouter dans {car.name}</div>
          <input autoFocus value={search} onChange={function(e) { setSearch(e.target.value); }} placeholder="Rechercher..." style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.05)", fontSize: 13, outline: "none", fontFamily: "inherit", color: "#f0f0f5" }} />
          <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {filtered.length === 0 && <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, textAlign: "center", padding: 20 }}>Aucun membre disponible</div>}
            {filtered.map(function(m) {
              var s = score(m);
              var ops = Array.isArray(m.operators) ? m.operators : [m.operator].filter(Boolean);
              return (
                <div key={m.id} onClick={function() { addPassenger(car.id, m.id); onClose(); }}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12, cursor: "pointer", background: s >= 2 ? "rgba(52,199,89,0.08)" : s >= 1 ? "rgba(0,113,227,0.08)" : "rgba(255,255,255,0.05)", border: s >= 2 ? "1px solid rgba(52,199,89,0.15)" : s >= 1 ? "1px solid rgba(0,113,227,0.15)" : "1px solid transparent", transition: "filter 0.1s" }}
                  onMouseEnter={function(e) { e.currentTarget.style.filter = "brightness(1.15)"; }}
                  onMouseLeave={function(e) { e.currentTarget.style.filter = ""; }}>
                  <Avatar name={m.name} role={m.role} size={36} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#f0f0f5" }}>{m.name}</div>
                    <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: ROLE_COLORS[m.role] }}>{ROLE_LABELS[m.role]}</span>
                      {ops.map(function(op) { return <span key={op} style={{ fontSize: 10, color: OP_COLORS[op], fontWeight: 600 }}>{op}</span>; })}
                    </div>
                  </div>
                  {s >= 2 && <span style={{ fontSize: 10, fontWeight: 700, color: "#34C759", background: "rgba(52,199,89,0.08)", padding: "2px 7px", borderRadius: 99, flexShrink: 0 }}>Équipe</span>}
                  {s === 1 && <span style={{ fontSize: 10, fontWeight: 700, color: "#0071E3", background: "rgba(0,113,227,0.08)", padding: "2px 7px", borderRadius: 99, flexShrink: 0 }}>Opérateur</span>}
                </div>
              );
            })}
          </div>
          <Btn v="secondary" onClick={onClose}>Fermer</Btn>
        </div>
      </div>
    );
  }

  var pickerCar = picker ? cars.find(function(c) { return c.id === picker; }) : null;

  return (
    <div>
      {pickerCar && (
        <PickerModal
          car={pickerCar}
          available={at.filter(function(m) {
            // Not the driver of this car
            if (pickerCar.driverId === m.id) return false;
            // Not already a passenger in this car
            var cp = plan[pickerCar.id];
            if (cp && cp.members && cp.members.indexOf(m.id) >= 0) return false;
            // Not already a passenger in another car
            if (passengerIds.has(m.id)) return false;
            return true;
          })}
          onClose={function() { setPicker(null); }}
        />
      )}

      {/* Historique veille */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#f0f0f5", letterSpacing: -0.3 }}>Historique veille</h3>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>{_veilleLabel}</span>
        </div>

        <div className="stat-row" style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <StatCard label="Contrats veille" value={_veilleTotal} color="#34C759" />
          <StatCard label="Commerciaux actifs" value={_veilleActifs} color="#0071E3" />
          <StatCard label="Moy / commercial" value={_veilleMoy} color="#AF52DE" />
        </div>

        {!_hasVeillePlan && (
          <Card style={{ padding: "20px 24px", textAlign: "center" }}>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>Aucun historique pour cette date</span>
          </Card>
        )}

        {_veillePlans.filter(function(vp) { return vp.plan !== null; }).map(function(vp, vpIdx) {
          var dayLabel = new Date(vp.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
          return (
            <div key={vp.date}>
              {_veilleDates.length === 2 && (
                <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.55)", marginBottom: 10, marginTop: vpIdx > 0 ? 16 : 0, textTransform: "capitalize" }}>{dayLabel}</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {cars.map(function(car, ci) {
                  var accent = CAR_PALETTE[ci % CAR_PALETTE.length];
                  var vcp = vp.plan[car.id];
                  if (!vcp) return null;
                  var vDriver = car.driverId ? team.find(function(m) { return m.id === car.driverId; }) : null;
                  var vPassengers = (vcp.members || []).map(function(id) { return team.find(function(m) { return m.id === id; }); }).filter(Boolean);
                  if (!vDriver && vPassengers.length === 0) return null;
                  var allMembers = [vDriver].concat(vPassengers).filter(Boolean);
                  var sectorLabel = vcp.sector || (vcp.zoneType === "talc" ? "TALC" : "");
                  return (
                    <div key={car.id} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 99, background: accent, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#f0f0f5", letterSpacing: -0.3 }}>{car.name}</span>
                        {sectorLabel && <span style={{ fontSize: 10, fontWeight: 700, color: accent, background: accent + "15", padding: "2px 8px", borderRadius: 99 }}>{sectorLabel}</span>}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {allMembers.map(function(m) {
                          var isDriver = vDriver && m.id === vDriver.id;
                          var commune = (vcp.memberCommunes && vcp.memberCommunes[m.id]) || "";
                          var count = _veilleCounts[m.name] || 0;
                          return (
                            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "8px 12px", borderLeft: "3px solid " + accent + (isDriver ? "" : "77") }}>
                              <Avatar name={m.name} role={m.role} size={32} />
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: "#f0f0f5", letterSpacing: -0.2 }}>{m.name}</div>
                                <div style={{ display: "flex", gap: 4, marginTop: 2, flexWrap: "wrap" }}>
                                  <span style={{ fontSize: 9, fontWeight: 700, color: isDriver ? accent : "rgba(255,255,255,0.45)", background: isDriver ? accent + "20" : "rgba(255,255,255,0.08)", padding: "1px 5px", borderRadius: 99 }}>{isDriver ? "Conducteur" : "Passager"}</span>
                                  {contracts && <span style={{ fontSize: 9, fontWeight: 700, color: count > 0 ? "#34C759" : "rgba(255,255,255,0.35)", background: count > 0 ? "#34C75915" : "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 99 }}>{count} contrat{count !== 1 ? "s" : ""}</span>}
                                  {commune && <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 99 }}>{commune}</span>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }).filter(Boolean)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="car-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: -0.4, color: "#f0f0f5" }}>Voitures</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{unassigned.length} non assignés · {cars.length} voitures</p>
        </div>
        <div className="car-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn v="secondary" onClick={resetDay}>Réinitialiser la journée</Btn>
          <Btn v={proxadCredentials ? "secondary" : "primary"} onClick={openProxadConfig}>{proxadCredentials ? "Proxad ✓" : "Proxad"}</Btn>
          <Btn onClick={function() { setEc(null); setCf({ name: "", seats: 5, driverId: null }); setMo(true); }}>+ Voiture</Btn>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {cars.map(function(car, ci) {
          var accent = CAR_PALETTE[ci % CAR_PALETTE.length];
          var cp = plan[car.id] || { members: [], sector: "", zoneType: "stratygo", vtaCode: "" };
          var driver = car.driverId ? team.find(function(m) { return m.id === car.driverId; }) : null;
          var passengers = (cp.members || []).map(function(id) { return team.find(function(m) { return m.id === id; }); }).filter(Boolean);
          var maxPass = car.seats - (driver ? 1 : 0);
          var canAdd = passengers.length < maxPass;
          var isDrop = dropTarget === car.id;
          var inactive = isCarInactive(car);

          // Find which car the driver is riding in today
          var driverRidingIn = inactive && driver ? cars.find(function(c) {
            var cp2 = plan[c.id];
            return cp2 && cp2.members && cp2.members.indexOf(car.driverId) >= 0;
          }) : null;

          return (
            <div key={car.id}
              style={{ background: inactive ? "rgba(255,255,255,0.02)" : isDrop ? accent + "07" : "rgba(255,255,255,0.03)", borderRadius: 18, border: inactive ? "1px solid rgba(255,255,255,0.06)" : isDrop ? "2px solid " + accent + "55" : "1px solid rgba(255,255,255,0.08)", transition: "background 0.15s, border-color 0.15s", opacity: inactive ? 0.6 : 1 }}
              onDragOver={inactive ? undefined : function(e) { e.preventDefault(); setDropTarget(car.id); }}
              onDragLeave={inactive ? undefined : function(e) { if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null); }}
              onDrop={inactive ? undefined : function(e) {
                e.preventDefault(); setDropTarget(null);
                if (!dragging) return;
                if (dragging.fromCarId === car.id) return;
                if (driver && dragging.memberId === car.driverId) return;
                if (passengers.length >= maxPass) return;
                movePassenger(dragging.memberId, dragging.fromCarId, car.id);
                setDragging(null);
              }}>

              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: inactive ? "rgba(255,255,255,0.04)" : accent + "08", flexWrap: "wrap", borderRadius: "17px 17px 0 0" }}>
                <div style={{ width: 10, height: 10, borderRadius: 99, background: inactive ? "rgba(255,255,255,0.35)" : accent, flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: inactive ? "rgba(255,255,255,0.35)" : "#f0f0f5", letterSpacing: -0.3, flex: 1 }}>{car.name}</span>
                {inactive
                  ? <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.08)", padding: "2px 8px", borderRadius: 99 }}>
                      {driver ? driver.name.split(' ')[0] : "Conducteur"} est en voiture avec {driverRidingIn ? driverRidingIn.name.replace("Voiture de ", "").replace("Voiture d'", "") : "quelqu'un"}
                    </span>
                  : <>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontWeight: 500 }}>{passengers.length + (driver ? 1 : 0)}/{car.seats}</span>
                      <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
                        <button onClick={function() { setZoneType(car.id, "stratygo"); }} style={{ padding: "3px 8px", fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer", background: cp.zoneType !== "talc" ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)", color: cp.zoneType !== "talc" ? "#fff" : "rgba(255,255,255,0.35)", fontFamily: "inherit" }}>Stratygo</button>
                        <button onClick={function() { setZoneType(car.id, "talc"); }} style={{ padding: "3px 8px", fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer", background: cp.zoneType === "talc" ? "#FF3B30" : "rgba(255,255,255,0.05)", color: cp.zoneType === "talc" ? "#fff" : "rgba(255,255,255,0.35)", fontFamily: "inherit" }}>TALC</button>
                      </div>
                    </>
                }
                <button onClick={function() { setEc(car); setCf({ name: car.name, seats: car.seats, driverId: car.driverId || null }); setMo(true); }} style={{ background: "rgba(255,255,255,0.08)", border: "none", cursor: "pointer", fontSize: 11, color: "rgba(255,255,255,0.55)", padding: "3px 8px", borderRadius: 6, fontFamily: "inherit" }}>Éditer</button>
              </div>

              {/* Body: horizontal layout — only if active */}
              {!inactive && <div className="car-body" style={{ padding: "16px 18px", display: "flex", alignItems: "flex-start", gap: 0 }}>
                {/* Driver */}
                <div className="car-driver-col" style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start", flexShrink: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: accent, letterSpacing: 0.8, textTransform: "uppercase" }}>Conducteur</span>
                  {driver
                    ? <>
                        <MemberTile m={driver} isDriver={true} accent={accent} isDrag={false} fromCarId={car.id} vtaCode={getMemberZone(cp, driver.id) === "talc" ? ((cp.memberVtaCodes && cp.memberVtaCodes[driver.id]) || VTA_PERSON_MAP[driver.name] || null) : null} />
                        <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", alignSelf: "flex-start" }}>
                          <button onClick={function() { setMemberZoneType(car.id, driver.id, "stratygo"); }} style={{ padding: "2px 6px", fontSize: 9, fontWeight: 700, border: "none", cursor: "pointer", background: getMemberZone(cp, driver.id) !== "talc" ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)", color: getMemberZone(cp, driver.id) !== "talc" ? "#fff" : "rgba(255,255,255,0.35)", fontFamily: "inherit" }}>Stratygo</button>
                          <button onClick={function() { setMemberZoneType(car.id, driver.id, "talc"); }} style={{ padding: "2px 6px", fontSize: 9, fontWeight: 700, border: "none", cursor: "pointer", background: getMemberZone(cp, driver.id) === "talc" ? "#FF3B30" : "rgba(255,255,255,0.05)", color: getMemberZone(cp, driver.id) === "talc" ? "#fff" : "rgba(255,255,255,0.35)", fontFamily: "inherit" }}>TALC</button>
                        </div>
                        {getMemberZone(cp, driver.id) === "talc" && <Sel value={(cp.memberVtaCodes && cp.memberVtaCodes[driver.id]) || ""} onChange={function(v) { setMemberVtaCode(car.id, driver.id, v); }} placeholder="Code VTA..." options={Object.keys(VTA_GROUPS).map(function(code) { return { value: code, label: code }; })} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 8, width: 160 }} />}
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <CommuneAutocomplete value={(cp.memberCommunes && cp.memberCommunes[driver.id]) || ""} onChange={function(v) { setMemberCommune(car.id, driver.id, v); }} />
                          {getMemberZone(cp, driver.id) !== "talc" && (function() { var uk = car.id + "-" + driver.id; var us = unlockStates[uk] || "idle"; var noC = !(cp.memberCommunes && cp.memberCommunes[driver.id]); var dis = noC || !proxadCredentials || us === "loading"; var lbl = us === "loading" ? "⏳" : us === "success" ? "✅" : us === "error" || us === "cors" ? "❌" : "🔓"; var bg = us === "success" ? "rgba(52,199,89,0.12)" : us === "error" || us === "cors" ? "rgba(255,59,48,0.12)" : us === "loading" ? "rgba(255,159,10,0.12)" : dis ? "rgba(255,255,255,0.05)" : "rgba(0,113,227,0.12)"; var col = us === "success" ? "#34C759" : us === "error" || us === "cors" ? "#FF3B30" : us === "loading" ? "#9A5200" : dis ? "rgba(255,255,255,0.35)" : "#0071E3"; var tip = us === "cors" ? "CORS bloqué" : us === "error" ? "Erreur Proxad" : us === "success" ? "Débloqué !" : !proxadCredentials ? "Configurer Proxad" : noC ? "Saisir une commune" : "Débloquer sur Proxad"; return <button onClick={function() { handleUnlock(car.id, driver.id); }} disabled={dis} title={tip} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: bg, color: col, fontSize: 12, fontWeight: 600, cursor: dis ? "default" : "pointer", opacity: dis ? 0.5 : 1, transition: "all 0.2s", whiteSpace: "nowrap", flexShrink: 0 }}>{lbl}</button>; })()}
                        </div>
                      </>
                    : <div style={{ width: 185, height: 70, border: "2px dashed " + accent + "44", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", color: accent + "88", fontSize: 12 }}>Aucun conducteur</div>
                  }
                </div>

                {/* Connector */}
                <div className="car-connector" style={{ display: "flex", alignItems: "center", padding: "0 10px", marginTop: 26 }}>
                  <svg width="28" height="2" style={{ flexShrink: 0 }}><line x1="0" y1="1" x2="28" y2="1" stroke={accent} strokeWidth="2" strokeDasharray="4 3" /></svg>
                </div>

                {/* Passengers */}
                <div className="car-passengers" style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: 0.8, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Passagers ({passengers.length}/{maxPass})</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    {passengers.map(function(m) {
                      return (
                        <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <MemberTile m={m} onRemove={function() { removePassenger(car.id, m.id); }} isDriver={false} accent={accent} isDrag={true} fromCarId={car.id} vtaCode={getMemberZone(cp, m.id) === "talc" ? ((cp.memberVtaCodes && cp.memberVtaCodes[m.id]) || VTA_PERSON_MAP[m.name] || null) : null} />
                          <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", alignSelf: "flex-start" }}>
                            <button onClick={function() { setMemberZoneType(car.id, m.id, "stratygo"); }} style={{ padding: "2px 6px", fontSize: 9, fontWeight: 700, border: "none", cursor: "pointer", background: getMemberZone(cp, m.id) !== "talc" ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)", color: getMemberZone(cp, m.id) !== "talc" ? "#fff" : "rgba(255,255,255,0.35)", fontFamily: "inherit" }}>Stratygo</button>
                            <button onClick={function() { setMemberZoneType(car.id, m.id, "talc"); }} style={{ padding: "2px 6px", fontSize: 9, fontWeight: 700, border: "none", cursor: "pointer", background: getMemberZone(cp, m.id) === "talc" ? "#FF3B30" : "rgba(255,255,255,0.05)", color: getMemberZone(cp, m.id) === "talc" ? "#fff" : "rgba(255,255,255,0.35)", fontFamily: "inherit" }}>TALC</button>
                          </div>
                          {getMemberZone(cp, m.id) === "talc" && <Sel value={(cp.memberVtaCodes && cp.memberVtaCodes[m.id]) || ""} onChange={function(v) { setMemberVtaCode(car.id, m.id, v); }} placeholder="Code VTA..." options={Object.keys(VTA_GROUPS).map(function(code) { return { value: code, label: code }; })} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 8, width: 160 }} />}
                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            <CommuneAutocomplete value={(cp.memberCommunes && cp.memberCommunes[m.id]) || ""} onChange={function(v) { setMemberCommune(car.id, m.id, v); }} />
                            {getMemberZone(cp, m.id) !== "talc" && (function() { var uk = car.id + "-" + m.id; var us = unlockStates[uk] || "idle"; var noC = !(cp.memberCommunes && cp.memberCommunes[m.id]); var dis = noC || !proxadCredentials || us === "loading"; var lbl = us === "loading" ? "⏳" : us === "success" ? "✅" : us === "error" || us === "cors" ? "❌" : "🔓"; var bg = us === "success" ? "rgba(52,199,89,0.12)" : us === "error" || us === "cors" ? "rgba(255,59,48,0.12)" : us === "loading" ? "rgba(255,159,10,0.12)" : dis ? "rgba(255,255,255,0.05)" : "rgba(0,113,227,0.12)"; var col = us === "success" ? "#34C759" : us === "error" || us === "cors" ? "#FF3B30" : us === "loading" ? "#9A5200" : dis ? "rgba(255,255,255,0.35)" : "#0071E3"; var tip = us === "cors" ? "CORS bloqué" : us === "error" ? "Erreur Proxad" : us === "success" ? "Débloqué !" : !proxadCredentials ? "Configurer Proxad" : noC ? "Saisir une commune" : "Débloquer sur Proxad"; return <button onClick={function() { handleUnlock(car.id, m.id); }} disabled={dis} title={tip} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: bg, color: col, fontSize: 12, fontWeight: 600, cursor: dis ? "default" : "pointer", opacity: dis ? 0.5 : 1, transition: "all 0.2s", whiteSpace: "nowrap", flexShrink: 0 }}>{lbl}</button>; })()}
                          </div>
                        </div>
                      );
                    })}
                    {passengers.length === 0 && !isDrop && (
                      <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, padding: "6px 0" }}>Glissez des membres ici ou utilisez +</span>
                    )}
                    {isDrop && dragging && (
                      <div style={{ width: 155, height: 60, border: "2px dashed " + accent, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", color: accent, fontSize: 12, fontWeight: 600 }}>Déposer ici</div>
                    )}
                    {canAdd && (
                      <button onClick={function() { setPicker(car.id); }} style={{ width: 38, height: 38, borderRadius: 99, border: "2px dashed " + accent + "66", background: accent + "0A", cursor: "pointer", color: accent, fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 300, flexShrink: 0 }}>+</button>
                    )}
                  </div>
                </div>
              </div>}

              {/* Suggestion panel */}
              {!inactive && (driver || passengers.length > 0) && (function() {
                var sug = suggestions[car.id];
                var seedCoords = sug && sug.communes && sug.communes.length > 0 ? sug.communes[0] : null;
                var numPersonnes = 0;
                var assignedSet = {};
                if (sug && sug.communes && sug.communes.length > 0) {
                  var _cp2 = plan[car.id] || { members: [], zoneType: "stratygo" };
                  var _mids = [];
                  if (car.driverId) _mids.push(car.driverId);
                  (_cp2.members || []).forEach(function(id) { _mids.push(id); });
                  numPersonnes = _mids.length;
                  var _big = sug.communes.filter(function(c) { return c.p >= 1000; }).sort(function(a, b) { return b.p - a.p; });
                  var _small = sug.communes.filter(function(c) { return c.p < 1000; }).sort(function(a, b) { return b.p - a.p; });
                  var _bi = 0, _si = 0, _cnt = 0;
                  while (_cnt < numPersonnes && (_bi < _big.length || _si < _small.length)) {
                    if (_bi < _big.length) { assignedSet[_big[_bi].v + "|" + _big[_bi].dept] = true; _bi++; _cnt++; }
                    if (_cnt < numPersonnes && _si < _small.length) { assignedSet[_small[_si].v + "|" + _small[_si].dept] = true; _si++; _cnt++; }
                  }
                }
                return (
                  <div style={{ padding: "0 18px 14px" }}>
                    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: sug && sug.communes && sug.communes.length > 0 ? 10 : 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#FF9F0A", flex: 1 }}>💡 Suggestion</span>
                        <Btn v="secondary" s="sm" onClick={function() { computeSuggestion(car.id); }}>Suggérer</Btn>
                        {sug && sug.communes && sug.communes.length > 0 && <Btn s="sm" onClick={function() { applySuggestion(car.id); }}>Appliquer ✓</Btn>}
                      </div>
                      {sug && sug.communes && sug.communes.length > 0 && (
                        <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                          {sug.communes.map(function(c, idx) {
                            var dist = idx === 0 ? 0 : Math.round(haversine(seedCoords.lat, seedCoords.lon, c.lat, c.lon));
                            var isAssigned = assignedSet[c.v + "|" + c.dept];
                            return (
                              <div key={c.v + "|" + c.dept} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                                <span style={{ color: "#FF9F0A", fontWeight: 700 }}>{isAssigned ? "●" : "○"}</span>
                                <span style={{ color: isAssigned ? "#f0f0f5" : "rgba(255,255,255,0.5)", fontWeight: isAssigned ? 600 : 400, flex: 1 }}>{c.v} <span style={{ color: "rgba(255,255,255,0.45)", fontWeight: 400 }}>({c.monthsAgo} mois)</span> — <span style={{ color: "rgba(255,255,255,0.55)" }}>{c.p.toLocaleString("fr-FR")} prises</span></span>
                                <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: 500, flexShrink: 0 }}>{dist} km</span>
                              </div>
                            );
                          })}
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>Rayon max : {sug.radius} km — {sug.communes.length} communes</div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* TALC: show summary of codes in car */}
              {!inactive && (driver || passengers.length > 0) && [driver, ...passengers].filter(Boolean).some(function(m) { return getMemberZone(cp, m.id) === "talc"; }) && (
                <div style={{ padding: "0 18px 14px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>Codes VTA :</span>
                  {[driver, ...passengers].filter(Boolean).filter(function(m) { return getMemberZone(cp, m.id) === "talc"; }).map(function(m) {
                    var manualCode = cp.memberVtaCodes && cp.memberVtaCodes[m.id];
                    var code = manualCode || VTA_PERSON_MAP[m.name];
                    if (!code) return null;
                    return <span key={m.id} style={{ fontSize: 11, fontWeight: 700, color: manualCode ? "#0071E3" : "#FF3B30", background: manualCode ? "#0071E310" : "#FF3B3010", padding: "2px 8px", borderRadius: 99 }}>{code} <span style={{ fontWeight: 400, color: "rgba(255,255,255,0.55)" }}>({m.name.split(' ')[0]})</span></span>;
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Unassigned pool */}
      <div style={{ marginTop: 24, background: dropTarget === "pool" ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)", borderRadius: 18, border: "1px dashed rgba(255,255,255,0.15)", overflow: "hidden", transition: "background 0.15s" }}
        onDragOver={function(e) { e.preventDefault(); setDropTarget("pool"); }}
        onDragLeave={function(e) { if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null); }}
        onDrop={function(e) {
          e.preventDefault(); setDropTarget(null);
          if (!dragging || !dragging.fromCarId) return;
          moveToPool(dragging.memberId, dragging.fromCarId);
          setDragging(null);
        }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ width: 10, height: 10, borderRadius: 99, background: "rgba(255,255,255,0.35)", flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.35)", flex: 1 }}>Non assignés</span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>{unassigned.length} membre{unassigned.length !== 1 ? "s" : ""}</span>
        </div>
        <div style={{ padding: "16px 18px", display: "flex", flexWrap: "wrap", gap: 8 }}>
          {unassigned.length === 0 && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>Tout le monde est assigné 🎉</span>}
          {unassigned.map(function(m) {
            return <MemberTile key={m.id} m={m} isDriver={false} accent="#AEAEB2" isDrag={true} fromCarId={null} />;
          })}
        </div>
      </div>

      {/* Car modal */}
      <Modal open={mo} onClose={function() { setMo(false); setEc(null); }} title={ec ? "Modifier la voiture" : "Ajouter une voiture"}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Inp value={cf.name} onChange={function(v) { setCf(Object.assign({}, cf, { name: v })); }} placeholder="Nom de la voiture" />
          <Inp type="number" value={cf.seats} onChange={function(v) { setCf(Object.assign({}, cf, { seats: Number(v) })); }} placeholder="Nombre de places" />
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.55)", display: "block", marginBottom: 4 }}>Conducteur habituel</label>
            <Sel value={cf.driverId || ""} onChange={function(v) { setCf(Object.assign({}, cf, { driverId: v ? Number(v) : null })); }}
              placeholder="Aucun conducteur"
              options={team.filter(function(m) { return m.active; }).map(function(m) { return { value: m.id, label: m.name + " (" + ROLE_LABELS[m.role] + ")" }; })}
              style={{ width: "100%" }} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn onClick={saveCar} style={{ flex: 1 }}>{ec ? "Enregistrer" : "Ajouter"}</Btn>
            {ec && <Btn v="danger" onClick={function() { saveCars(cars.filter(function(c) { return c.id !== ec.id; })); setMo(false); setEc(null); }}>Supprimer</Btn>}
          </div>
        </div>
      </Modal>
      <Modal open={showProxadConfig} onClose={function() { setShowProxadConfig(false); }} title="Configurer Proxad">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Identifiants pour vad.proxad.net (API déblocage communes)</div>
          <Inp value={proxadForm.login} onChange={function(v) { setProxadForm(Object.assign({}, proxadForm, { login: v })); }} placeholder="Login (ex: vst-iouirini)" />
          <Inp type="password" value={proxadForm.password} onChange={function(v) { setProxadForm(Object.assign({}, proxadForm, { password: v })); }} placeholder="Mot de passe" />
          <div style={{ display: "flex", gap: 10 }}>
            <Btn onClick={saveProxadConfig} style={{ flex: 1 }}>Enregistrer</Btn>
            {proxadCredentials && <Btn v="danger" onClick={function() { saveProxadCreds(null); proxadUsersRef.current = null; setShowProxadConfig(false); }}>Supprimer</Btn>}
          </div>
        </div>
      </Modal>
    </div>
  );
}


export { CarsTab };
