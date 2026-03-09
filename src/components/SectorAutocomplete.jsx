import React, { useState } from "react";
import { Inp } from "./ui.jsx";
import { JACHERE, JACHERE_TALC } from "../constants/jachere.js";

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
        style={{ fontSize: 11, padding: "3px 8px", borderRadius: 8, border: "1px solid #E5E5EA", outline: "none", width: 100, color: "#1D1D1F", background: "#fff", fontFamily: "inherit" }}
      />
      {open && matches.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: "#fff", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", zIndex: 200, minWidth: 160, overflow: "hidden", border: "1px solid #E5E5EA" }}>
          {matches.slice(0, 6).map(function(s) {
            return (
              <div key={s.name} onMouseDown={function() { onSelect(s.name, s.talc ? "talc" : "stratygo"); setOpen(false); }}
                style={{ padding: "8px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                onMouseEnter={function(e) { e.currentTarget.style.background = "#F5F5F7"; }}
                onMouseLeave={function(e) { e.currentTarget.style.background = ""; }}>
                <span>{s.name}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: s.talc ? "#FF9F0A" : "#6E6E73", background: s.talc ? "#FF9F0A18" : "#6E6E7318", borderRadius: 20, padding: "2px 6px" }}>{s.talc ? "TALC" : "Stratygo"}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CommuneAutocomplete({ value, onChange, sectorName, isTalc }) {
  var [open, setOpen] = useState(false);
  var sectorData = sectorName ? (isTalc ? JACHERE_TALC[sectorName] : JACHERE[sectorName]) : null;
  var communes = sectorData ? sectorData.communes : [];
  var q = (value || "").trim().toUpperCase();
  var matches = communes.filter(function(c) {
    return q.length >= 1 && c.v.indexOf(q) >= 0 && c.v !== q;
  });
  return (
    <div style={{ position: "relative" }}>
      <input
        value={value}
        onChange={function(e) { onChange(e.target.value); setOpen(true); }}
        onFocus={function() { setOpen(true); }}
        onBlur={function() { setTimeout(function() { setOpen(false); }, 150); }}
        placeholder={sectorName ? "Commune..." : "Secteur d'abord"}
        disabled={!sectorName}
        style={{ fontSize: 11, padding: "4px 8px", borderRadius: 8, border: "1px solid #E5E5EA", outline: "none", width: 130, color: "#1D1D1F", background: sectorName ? "#fff" : "#F5F5F7", fontFamily: "inherit", boxSizing: "border-box" }}
      />
      {open && matches.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: "#fff", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", zIndex: 300, minWidth: 150, overflow: "hidden", border: "1px solid #E5E5EA" }}>
          {matches.slice(0, 7).map(function(c) {
            return (
              <div key={c.v} onMouseDown={function() { onChange(c.v); setOpen(false); }}
                style={{ padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", color: "#1D1D1F" }}
                onMouseEnter={function(e) { e.currentTarget.style.background = "#F5F5F7"; }}
                onMouseLeave={function(e) { e.currentTarget.style.background = ""; }}>
                <span>{c.v}</span>
                <span style={{ fontSize: 10, color: "#AEAEB2" }}>{c.p.toLocaleString("fr-FR")} pr.</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


export { SectorAutocomplete, CommuneAutocomplete };
