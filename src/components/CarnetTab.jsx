import React, { useState, useMemo } from "react";
import carnetData from "../data.json";
import bouyguesData from "../data_bouygues.json";

function CarnetTab() {
  var [tab, setTab] = useState("vst");
  var [search, setSearch] = useState("");
  var rows = carnetData.rows || carnetData;
  var bygRows = bouyguesData.rows || [];

  var vstRows = useMemo(function() { return rows.filter(function(r) { return r.login && r.login.indexOf("vst-") === 0; }); }, [rows]);
  var vtaRows = useMemo(function() { return rows.filter(function(r) { return r.login && r.login.indexOf("vta-") === 0; }); }, [rows]);

  var sortedBygRows = useMemo(function() {
    return bygRows.slice().sort(function(a, b) {
      var da = (a.date_inscription || "").split(/[\s/:]/).map(Number);
      var db = (b.date_inscription || "").split(/[\s/:]/).map(Number);
      var ta = da.length >= 5 ? new Date(da[2], da[1] - 1, da[0], da[3], da[4]).getTime() : 0;
      var tb = db.length >= 5 ? new Date(db[2], db[1] - 1, db[0], db[3], db[4]).getTime() : 0;
      return tb - ta;
    });
  }, [bygRows]);

  var activeRows = tab === "vst" ? vstRows : tab === "vta" ? vtaRows : sortedBygRows;

  var filtered = useMemo(function() {
    if (!search.trim()) return activeRows;
    var q = search.toLowerCase();
    return activeRows.filter(function(r) {
      return Object.values(r).some(function(v) { return String(v).toLowerCase().includes(q); });
    });
  }, [activeRows, search]);

  var headers = activeRows.length > 0 ? Object.keys(activeRows[0]) : [];

  var ROW_COLORS = {
    "inscription ok": "gold",
    "inscription ok /postprod": "OrangeRed",
    "vente validée": "WhiteSmoke",
    "vente validée j+7": "lightgrey",
    "connexion ok": "lightgreen",
    "connexion ok vrf": "LimeGreen",
    "résilié": "firebrick",
    "vente abandonnée": "SlateGrey",
  };

  var BOUYGUES_ROW_COLORS = {
    "active": "lightgreen",
    "vente validée": "#FFD699",
    "saisie": "WhiteSmoke",
  };

  function getRowColor(row) {
    if (tab === "bouygues") {
      var etat = (row["etat_commande"] || "").trim().toLowerCase();
      if (BOUYGUES_ROW_COLORS[etat]) return BOUYGUES_ROW_COLORS[etat];
      if (etat.indexOf("ko") === 0) return "SlateGrey";
      if (etat.indexOf("standby") === 0) return "#FFD699";
      return "#fff";
    }
    var status = row["etat_commande"] || "";
    return ROW_COLORS[status.toLowerCase()] || "#fff";
  }

  var TAB_COLORS = { vst: "rgba(76,87,96,0.14)", vta: "rgba(255,59,48,0.25)", bouygues: "rgba(0,55,164,0.3)" };
  var TAB_ACTIVE_BG = { vst: "rgba(76,87,96,0.14)", vta: "var(--lo-danger)", bouygues: "#003DA5" };

  var tabStyle = function(t) {
    var active = tab === t;
    return {
      padding: "8px 20px",
      fontSize: 13,
      fontWeight: 700,
      border: "none",
      cursor: "pointer",
      borderRadius: "10px 10px 0 0",
      background: active ? TAB_ACTIVE_BG[t] : "rgba(76,87,96,0.07)",
      color: active ? "#fff" : "var(--lo-faint)",
      fontFamily: "inherit",
      transition: "background 0.15s, color 0.15s",
    };
  };

  var TAB_TITLES = { vst: "Carnet VST (Stratygo)", vta: "Carnet VTA (TALC)", bouygues: "Carnet Bouygues (C2E)" };

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 0 }}>
        <button onClick={function() { setTab("vst"); setSearch(""); }} style={tabStyle("vst")}>
          Carnet VST <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 4, opacity: 0.8 }}>{vstRows.length}</span>
        </button>
        <button onClick={function() { setTab("vta"); setSearch(""); }} style={tabStyle("vta")}>
          Carnet VTA <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 4, opacity: 0.8 }}>{vtaRows.length}</span>
        </button>
        <button onClick={function() { setTab("bouygues"); setSearch(""); }} style={tabStyle("bouygues")}>
          Carnet Bouygues <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 4, opacity: 0.8 }}>{bygRows.length}</span>
        </button>
      </div>

      <div style={{ background: TAB_ACTIVE_BG[tab], borderRadius: "0 12px 0 0", padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>
          {TAB_TITLES[tab]}
          <span style={{ fontSize: 13, fontWeight: 400, marginLeft: 8, opacity: 0.7 }}>{filtered.length} / {activeRows.length}</span>
        </div>
        <input
          value={search}
          onChange={function(e) { setSearch(e.target.value); }}
          placeholder="Rechercher..."
          style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(76,87,96,0.14)", fontSize: 13, width: 220, outline: "none", background: "rgba(76,87,96,0.14)", color: "#fff", fontFamily: "inherit", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
        />
      </div>

      <div style={{ overflowX: "auto", borderRadius: "0 0 12px 12px", border: "1px solid rgba(76,87,96,0.10)", borderTop: "none" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "rgba(76,87,96,0.07)" }}>
              {headers.map(function(h) {
                return <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "var(--lo-muted)", whiteSpace: "nowrap", borderBottom: "1px solid rgba(76,87,96,0.10)" }}>{h}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={headers.length} style={{ padding: 32, textAlign: "center", color: "var(--lo-faint)" }}>Aucun r\u00E9sultat</td></tr>
            )}
            {filtered.map(function(row, i) {
              var bg = getRowColor(row);
              return (
                <tr key={i} style={{ background: bg }}>
                  {headers.map(function(h) {
                    return <td key={h} style={{ padding: "6px 10px", borderBottom: "1px solid rgba(76,87,96,0.06)", whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", color: "#1D1D1F" }}>{row[h] || ""}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { CarnetTab };
