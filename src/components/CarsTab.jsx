import React, { useState } from "react";
import { Badge, Card, Btn, Sel, Inp, Modal } from "./ui.jsx";
import { ROLES, ROLE_LABELS, ROLE_COLORS, OPERATORS, OP_COLORS } from "../constants/roles.js";
import { VTA_GROUPS } from "../constants/vta.js";
import { SectorAutocomplete, CommuneAutocomplete } from "./SectorAutocomplete.jsx";
import { localDateStr } from "../helpers/date.js";

function CarsTab({ team, cars, saveCars, dailyPlan, saveDailyPlan, groups }) {
  var CAR_PALETTE = ["#0071E3","#34C759","#FF9F0A","#AF52DE","#FF2D55","#5AC8FA","#FF6B35","#00B4D8"];
  var _todayKey = localDateStr(new Date());
  const [plan, setPlan] = useState((dailyPlan && dailyPlan[_todayKey]) || {});
  const [dragging, setDragging] = useState(null); // { memberId, fromCarId }
  const [dropTarget, setDropTarget] = useState(null); // carId or "pool"
  const [picker, setPicker] = useState(null); // carId
  const [mo, setMo] = useState(false);
  const [ec, setEc] = useState(null);
  const [cf, setCf] = useState({ name: "", seats: 5, driverId: null });

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

  function setSector(cid, s) {
    var u = JSON.parse(JSON.stringify(plan));
    if (!u[cid]) u[cid] = { members: [], sector: "", zoneType: "stratygo", vtaCode: "" };
    u[cid].sector = s; updatePlan(u);
  }

  function setZoneType(cid, z) {
    var u = JSON.parse(JSON.stringify(plan));
    if (!u[cid]) u[cid] = { members: [], sector: "", zoneType: "stratygo", vtaCode: "" };
    u[cid].zoneType = z; if (z === "stratygo") u[cid].vtaCode = "";
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
        style={{ background: "#fff", borderRadius: 14, padding: isDriver ? "14px 16px" : "10px 14px", boxShadow: "0 2px 8px rgba(0,0,0,0.09), 0 0 0 1px rgba(0,0,0,0.05)", display: "flex", alignItems: "center", gap: 10, position: "relative", borderLeft: "3px solid " + accent + (isDriver ? "" : "99"), minWidth: isDriver ? 185 : 160, opacity: dragging && dragging.memberId === m.id ? 0.4 : 1, cursor: isDrag ? "grab" : "default", transition: "opacity 0.15s", flexShrink: 0 }}>
        <Avatar name={m.name} role={m.role} size={isDriver ? 44 : 38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: isDriver ? 14 : 13, fontWeight: 600, color: "#1D1D1F", letterSpacing: -0.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
          <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: ROLE_COLORS[m.role], background: ROLE_COLORS[m.role] + "20", padding: "1px 6px", borderRadius: 99 }}>{ROLE_LABELS[m.role]}</span>
            {ops.map(function(op) { return <span key={op} style={{ fontSize: 10, fontWeight: 700, color: OP_COLORS[op], background: OP_COLORS[op] + "20", padding: "1px 6px", borderRadius: 99 }}>{op}</span>; })}
            {m.permis && <span style={{ fontSize: 10, fontWeight: 600, color: "#34C759", background: "#34C75920", padding: "1px 6px", borderRadius: 99 }}>Permis</span>}
            {vtaCode && <span style={{ fontSize: 10, fontWeight: 700, color: "#FF3B30", background: "#FF3B3012", padding: "1px 6px", borderRadius: 99, letterSpacing: 0.2 }}>{vtaCode}</span>}
          </div>
        </div>
        {onRemove && <button onClick={onRemove} style={{ position: "absolute", top: 5, right: 5, background: "none", border: "none", cursor: "pointer", color: "#C7C7CC", fontSize: 16, lineHeight: 1, padding: 2 }}>×</button>}
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
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
        <div style={{ background: "#fff", borderRadius: 20, padding: 24, width: 380, maxHeight: "72vh", display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={function(e) { e.stopPropagation(); }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1D1D1F" }}>Ajouter dans {car.name}</div>
          <input autoFocus value={search} onChange={function(e) { setSearch(e.target.value); }} placeholder="Rechercher..." style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #E5E5EA", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
          <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {filtered.length === 0 && <div style={{ color: "#AEAEB2", fontSize: 13, textAlign: "center", padding: 20 }}>Aucun membre disponible</div>}
            {filtered.map(function(m) {
              var s = score(m);
              var ops = Array.isArray(m.operators) ? m.operators : [m.operator].filter(Boolean);
              return (
                <div key={m.id} onClick={function() { addPassenger(car.id, m.id); onClose(); }}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12, cursor: "pointer", background: s >= 2 ? "#F0FDF4" : s >= 1 ? "#EFF6FF" : "#F5F5F7", border: s >= 2 ? "1px solid #34C75928" : s >= 1 ? "1px solid #0071E328" : "1px solid transparent", transition: "filter 0.1s" }}
                  onMouseEnter={function(e) { e.currentTarget.style.filter = "brightness(0.96)"; }}
                  onMouseLeave={function(e) { e.currentTarget.style.filter = ""; }}>
                  <Avatar name={m.name} role={m.role} size={36} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1D1D1F" }}>{m.name}</div>
                    <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: ROLE_COLORS[m.role] }}>{ROLE_LABELS[m.role]}</span>
                      {ops.map(function(op) { return <span key={op} style={{ fontSize: 10, color: OP_COLORS[op], fontWeight: 600 }}>{op}</span>; })}
                    </div>
                  </div>
                  {s >= 2 && <span style={{ fontSize: 10, fontWeight: 700, color: "#34C759", background: "#F0FDF4", padding: "2px 7px", borderRadius: 99, flexShrink: 0 }}>Équipe</span>}
                  {s === 1 && <span style={{ fontSize: 10, fontWeight: 700, color: "#0071E3", background: "#EFF6FF", padding: "2px 7px", borderRadius: 99, flexShrink: 0 }}>Opérateur</span>}
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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: -0.4, color: "#1D1D1F" }}>Voitures</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6E6E73" }}>{unassigned.length} non assignés · {cars.length} voitures</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn v="secondary" onClick={resetDay}>Réinitialiser la journée</Btn>
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
              style={{ background: inactive ? "#F5F5F7" : isDrop ? accent + "07" : "#FAFAFA", borderRadius: 18, border: inactive ? "1px solid #E5E5EA" : isDrop ? "2px solid " + accent + "55" : "1px solid #E5E5EA", overflow: "hidden", transition: "background 0.15s, border-color 0.15s", opacity: inactive ? 0.6 : 1 }}
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
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 18px", borderBottom: "1px solid #F0F0F0", background: inactive ? "#EEEEEF" : accent + "08", flexWrap: "wrap" }}>
                <div style={{ width: 10, height: 10, borderRadius: 99, background: inactive ? "#AEAEB2" : accent, flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: inactive ? "#AEAEB2" : "#1D1D1F", letterSpacing: -0.3, flex: 1 }}>{car.name}</span>
                {inactive
                  ? <span style={{ fontSize: 11, fontWeight: 600, color: "#AEAEB2", background: "#E5E5EA", padding: "2px 8px", borderRadius: 99 }}>
                      {driver ? driver.name.split(' ')[0] : "Conducteur"} est en voiture avec {driverRidingIn ? driverRidingIn.name.replace("Voiture de ", "").replace("Voiture d'", "") : "quelqu'un"}
                    </span>
                  : <>
                      <span style={{ fontSize: 12, color: "#AEAEB2", fontWeight: 500 }}>{passengers.length + (driver ? 1 : 0)}/{car.seats}</span>
                      <SectorAutocomplete value={cp.sector || ""} onSelect={function(name, zoneType) {
                        var u = JSON.parse(JSON.stringify(plan));
                        if (!u[car.id]) u[car.id] = { members: [], sector: "", zoneType: "stratygo", vtaCode: "" };
                        u[car.id].sector = name;
                        if (zoneType) { u[car.id].zoneType = zoneType; if (zoneType === "stratygo") u[car.id].vtaCode = ""; }
                        updatePlan(u);
                      }} />
                      <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid #E5E5EA" }}>
                        <button onClick={function() { setZoneType(car.id, "stratygo"); }} style={{ padding: "3px 8px", fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer", background: cp.zoneType !== "talc" ? "#1D1D1F" : "#F5F5F7", color: cp.zoneType !== "talc" ? "#fff" : "#AEAEB2", fontFamily: "inherit" }}>Stratygo</button>
                        <button onClick={function() { setZoneType(car.id, "talc"); }} style={{ padding: "3px 8px", fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer", background: cp.zoneType === "talc" ? "#FF3B30" : "#F5F5F7", color: cp.zoneType === "talc" ? "#fff" : "#AEAEB2", fontFamily: "inherit" }}>TALC</button>
                      </div>
                    </>
                }
                <button onClick={function() { setEc(car); setCf({ name: car.name, seats: car.seats, driverId: car.driverId || null }); setMo(true); }} style={{ background: "#F0F0F0", border: "none", cursor: "pointer", fontSize: 11, color: "#6E6E73", padding: "3px 8px", borderRadius: 6, fontFamily: "inherit" }}>Éditer</button>
              </div>

              {/* Body: horizontal layout — only if active */}
              {!inactive && <div style={{ padding: "16px 18px", display: "flex", alignItems: "flex-start", gap: 0 }}>
                {/* Driver */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start", flexShrink: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: accent, letterSpacing: 0.8, textTransform: "uppercase" }}>Conducteur</span>
                  {driver
                    ? <>
                        <MemberTile m={driver} isDriver={true} accent={accent} isDrag={false} fromCarId={car.id} vtaCode={cp.zoneType === "talc" ? ((cp.memberVtaCodes && cp.memberVtaCodes[driver.id]) || VTA_PERSON_MAP[driver.name] || null) : null} />
                        {cp.zoneType === "talc" && <Sel value={(cp.memberVtaCodes && cp.memberVtaCodes[driver.id]) || ""} onChange={function(v) { setMemberVtaCode(car.id, driver.id, v); }} placeholder="Code VTA..." options={Object.keys(VTA_GROUPS).map(function(code) { return { value: code, label: code }; })} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 8, width: 160 }} />}
                        <CommuneAutocomplete value={(cp.memberCommunes && cp.memberCommunes[driver.id]) || ""} onChange={function(v) { setMemberCommune(car.id, driver.id, v); }} sectorName={cp.sector} isTalc={cp.zoneType === "talc"} />
                      </>
                    : <div style={{ width: 185, height: 70, border: "2px dashed " + accent + "44", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", color: accent + "88", fontSize: 12 }}>Aucun conducteur</div>
                  }
                </div>

                {/* Connector */}
                <div style={{ display: "flex", alignItems: "center", padding: "0 10px", marginTop: 26 }}>
                  <svg width="28" height="2" style={{ flexShrink: 0 }}><line x1="0" y1="1" x2="28" y2="1" stroke={accent} strokeWidth="2" strokeDasharray="4 3" /></svg>
                </div>

                {/* Passengers */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#AEAEB2", letterSpacing: 0.8, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Passagers ({passengers.length}/{maxPass})</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    {passengers.map(function(m) {
                      return (
                        <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <MemberTile m={m} onRemove={function() { removePassenger(car.id, m.id); }} isDriver={false} accent={accent} isDrag={true} fromCarId={car.id} vtaCode={cp.zoneType === "talc" ? ((cp.memberVtaCodes && cp.memberVtaCodes[m.id]) || VTA_PERSON_MAP[m.name] || null) : null} />
                          {cp.zoneType === "talc" && <Sel value={(cp.memberVtaCodes && cp.memberVtaCodes[m.id]) || ""} onChange={function(v) { setMemberVtaCode(car.id, m.id, v); }} placeholder="Code VTA..." options={Object.keys(VTA_GROUPS).map(function(code) { return { value: code, label: code }; })} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 8, width: 160 }} />}
                          <CommuneAutocomplete value={(cp.memberCommunes && cp.memberCommunes[m.id]) || ""} onChange={function(v) { setMemberCommune(car.id, m.id, v); }} sectorName={cp.sector} isTalc={cp.zoneType === "talc"} />
                        </div>
                      );
                    })}
                    {passengers.length === 0 && !isDrop && (
                      <span style={{ color: "#C7C7CC", fontSize: 12, padding: "6px 0" }}>Glissez des membres ici ou utilisez +</span>
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

              {/* TALC: show summary of codes in car */}
              {!inactive && cp.zoneType === "talc" && (driver || passengers.length > 0) && (
                <div style={{ padding: "0 18px 14px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: "#AEAEB2", fontWeight: 600 }}>Codes VTA :</span>
                  {[driver, ...passengers].filter(Boolean).map(function(m) {
                    var manualCode = cp.memberVtaCodes && cp.memberVtaCodes[m.id];
                    var code = manualCode || VTA_PERSON_MAP[m.name];
                    if (!code) return null;
                    return <span key={m.id} style={{ fontSize: 11, fontWeight: 700, color: manualCode ? "#0071E3" : "#FF3B30", background: manualCode ? "#0071E310" : "#FF3B3010", padding: "2px 8px", borderRadius: 99 }}>{code} <span style={{ fontWeight: 400, color: "#6E6E73" }}>({m.name.split(' ')[0]})</span></span>;
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Unassigned pool */}
      <div style={{ marginTop: 24, background: dropTarget === "pool" ? "#F0F0F0" : "#FAFAFA", borderRadius: 18, border: "1px dashed #D2D2D7", overflow: "hidden", transition: "background 0.15s" }}
        onDragOver={function(e) { e.preventDefault(); setDropTarget("pool"); }}
        onDragLeave={function(e) { if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null); }}
        onDrop={function(e) {
          e.preventDefault(); setDropTarget(null);
          if (!dragging || !dragging.fromCarId) return;
          moveToPool(dragging.memberId, dragging.fromCarId);
          setDragging(null);
        }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderBottom: "1px solid #F0F0F0" }}>
          <div style={{ width: 10, height: 10, borderRadius: 99, background: "#AEAEB2", flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#AEAEB2", flex: 1 }}>Non assignés</span>
          <span style={{ fontSize: 12, color: "#AEAEB2" }}>{unassigned.length} membre{unassigned.length !== 1 ? "s" : ""}</span>
        </div>
        <div style={{ padding: "16px 18px", display: "flex", flexWrap: "wrap", gap: 8 }}>
          {unassigned.length === 0 && <span style={{ fontSize: 12, color: "#C7C7CC" }}>Tout le monde est assigné 🎉</span>}
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
            <label style={{ fontSize: 12, fontWeight: 600, color: "#6E6E73", display: "block", marginBottom: 4 }}>Conducteur habituel</label>
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
    </div>
  );
}


export { CarsTab };
