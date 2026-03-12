import React, { useState } from "react";
import { Inp } from "./ui.jsx";
import { JACHERE, JACHERE_TALC } from "../constants/jachere.js";

var ALL_SECTORS = Object.keys(JACHERE).map(function(n) { return { name: n, talc: false }; })
  .concat(Object.keys(JACHERE_TALC).map(function(n) { return { name: n, talc: true }; }));

var ALL_COMMUNES = [];
Object.keys(JACHERE).forEach(function(sectorName) {
  var s = JACHERE[sectorName];
  s.communes.forEach(function(c) {
    ALL_COMMUNES.push({ v: c.v, p: c.p, sector: sectorName });
  });
});
Object.keys(JACHERE_TALC).forEach(function(sectorName) {
  var s = JACHERE_TALC[sectorName];
  s.communes.forEach(function(c) {
    ALL_COMMUNES.push({ v: c.v, p: c.p, sector: sectorName });
  });
});

function SectorAutocomplete({ value, onSelect }) {
  var [open, setOpen] = useState(false);
  var q = (value || "").trim().toUpperCase();
  var matches = q.length >= 1 ? ALL_SECTORS.filter(function(s) {
    return s.name.toUpperCase().indexOf(q) >= 0 && s.name.toUpperCase() !== q;
  }) : [];
  return (
    <div style={{ position: "relative" }}>
      <input
        value={value}
        onChange={function(e) { onSelect(e.target.value, null); setOpen(true); }}
        onFocus={function() { setOpen(true); }}
        onBlur={function() { setTimeout(function() { setOpen(false); }, 150); }}
        placeholder="Secteur..."
        style={{ fontSize: 11, padding: "3px 8px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", outline: "none", width: 100, color: "#f0f0f5", background: "rgba(255,255,255,0.08)", fontFamily: "inherit" }}
      />
      {open && matches.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: "rgba(30,25,50,0.95)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", zIndex: 200, minWidth: 160, overflow: "hidden", border: "1px solid rgba(255,255,255,0.12)" }}>
          {matches.slice(0, 6).map(function(s) {
            return (
              <div key={s.name} onMouseDown={function() { onSelect(s.name, s.talc ? "talc" : "stratygo"); setOpen(false); }}
                style={{ padding: "8px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", color: "#f0f0f5" }}
                onMouseEnter={function(e) { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                onMouseLeave={function(e) { e.currentTarget.style.background = ""; }}>
                <span>{s.name}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: s.talc ? "#FF9F0A" : "rgba(255,255,255,0.55)", background: s.talc ? "rgba(255,159,10,0.15)" : "rgba(255,255,255,0.08)", borderRadius: 20, padding: "2px 6px" }}>{s.talc ? "TALC" : "Stratygo"}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CommuneAutocomplete({ value, onChange }) {
  var [open, setOpen] = useState(false);
  var q = (value || "").trim().toUpperCase();
  var matches = ALL_COMMUNES.filter(function(c) {
    return q.length >= 1 && c.v.indexOf(q) >= 0 && c.v !== q;
  });
  return (
    <div style={{ position: "relative" }}>
      <input
        value={value}
        onChange={function(e) { onChange(e.target.value); setOpen(true); }}
        onFocus={function() { setOpen(true); }}
        onBlur={function() { setTimeout(function() { setOpen(false); }, 150); }}
        placeholder="Commune..."
        style={{ fontSize: 11, padding: "4px 8px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", outline: "none", width: 130, color: "#f0f0f5", background: "rgba(255,255,255,0.08)", fontFamily: "inherit", boxSizing: "border-box" }}
      />
      {open && matches.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: "rgba(30,25,50,0.95)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", zIndex: 300, minWidth: 220, overflow: "hidden", border: "1px solid rgba(255,255,255,0.12)" }}>
          {matches.slice(0, 7).map(function(c, i) {
            return (
              <div key={c.v + "-" + c.sector} onMouseDown={function() { onChange(c.v); setOpen(false); }}
                style={{ padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, color: "#f0f0f5" }}
                onMouseEnter={function(e) { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                onMouseLeave={function(e) { e.currentTarget.style.background = ""; }}>
                <span style={{ whiteSpace: "nowrap" }}>{c.v}</span>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", whiteSpace: "nowrap" }}>{c.sector}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


export { SectorAutocomplete, CommuneAutocomplete };
