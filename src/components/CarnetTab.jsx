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

  var activeRows = tab === "vst" ? vstRows : tab === "vta" ? vtaRows : bygRows;

  var filtered = useMemo(function() {
    if (!search.trim()) return activeRows;
    var q = search.toLowerCase();
    return activeRows.filter(function(r) {
      return Object.values(r).some(function(v) { return String(v).toLowerCase().includes(q); });
    });
  }, [activeRows, search]);

  var headers = activeRows.length > 0 ? Object.keys(activeRows[0]) : [];

  var ROW_COLORS = {
    "inscription ok": "rgba(255,215,0,0.15)",
    "inscription ok /postprod": "rgba(255,69,0,0.15)",
    "vente valid\u00E9e": "rgba(255,255,255,0.05)",
    "vente valid\u00E9e j+7": "rgba(255,255,255,0.08)",
    "connexion ok": "rgba(52,199,89,0.15)",
    "connexion ok vrf": "rgba(50,205,50,0.18)",
    "r\u00E9sili\u00E9": "rgba(178,34,34,0.15)",
    "vente abandonn\u00E9e": "rgba(112,128,144,0.15)",
  };

  var BOUYGUES_ROW_COLORS = {
    "active": "rgba(52,199,89,0.15)",
    "vente valid\u00E9e": "rgba(255,255,255,0.05)",
    "saisie": "rgba(255,159,10,0.15)",
  };

  function getRowColor(row) {
    if (tab === "bouygues") {
      var etat = (row["etat_commande"] || "").trim().toLowerCase();
      if (BOUYGUES_ROW_COLORS[etat]) return BOUYGUES_ROW_COLORS[etat];
      if (etat.indexOf("ko") === 0) return "rgba(112,128,144,0.15)";
      if (etat.indexOf("standby") === 0) return "rgba(255,159,10,0.10)";
      return "transparent";
    }
    var status = row["etat_commande"] || "";
    return ROW_COLORS[status.toLowerCase()] || "transparent";
  }

  var TAB_COLORS = { vst: "rgba(255,255,255,0.12)", vta: "rgba(255,59,48,0.25)", bouygues: "rgba(0,55,164,0.3)" };
  var TAB_ACTIVE_BG = { vst: "rgba(255,255,255,0.15)", vta: "#FF3B30", bouygues: "#003DA5" };

  var tabStyle = function(t) {
    var active = tab === t;
    return {
      padding: "8px 20px",
      fontSize: 13,
      fontWeight: 700,
      border: "none",
      cursor: "pointer",
      borderRadius: "10px 10px 0 0",
      background: active ? TAB_ACTIVE_BG[t] : "rgba(255,255,255,0.05)",
      color: active ? "#fff" : "rgba(255,255,255,0.35)",
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
          style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", fontSize: 13, width: 220, outline: "none", background: "rgba(255,255,255,0.12)", color: "#fff", fontFamily: "inherit", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
        />
      </div>

      <div style={{ overflowX: "auto", borderRadius: "0 0 12px 12px", border: "1px solid rgba(255,255,255,0.08)", borderTop: "none" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.05)" }}>
              {headers.map(function(h) {
                return <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "rgba(255,255,255,0.55)", whiteSpace: "nowrap", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>{h}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={headers.length} style={{ padding: 32, textAlign: "center", color: "rgba(255,255,255,0.35)" }}>Aucun r\u00E9sultat</td></tr>
            )}
            {filtered.map(function(row, i) {
              var bg = getRowColor(row);
              return (
                <tr key={i} style={{ background: bg }}>
                  {headers.map(function(h) {
                    return <td key={h} style={{ padding: "6px 10px", borderBottom: "1px solid rgba(255,255,255,0.04)", whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", color: "#f0f0f5" }}>{row[h] || ""}</td>;
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
