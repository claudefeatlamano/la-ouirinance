import React, { useState, useMemo } from "react";
import carnetData from "../data.json";

function CarnetTab() {
  var [tab, setTab] = useState("vst");
  var [search, setSearch] = useState("");
  var rows = carnetData.rows || carnetData;

  var vstRows = useMemo(function() { return rows.filter(function(r) { return r.login && r.login.indexOf("vst-") === 0; }); }, [rows]);
  var vtaRows = useMemo(function() { return rows.filter(function(r) { return r.login && r.login.indexOf("vta-") === 0; }); }, [rows]);

  var activeRows = tab === "vst" ? vstRows : vtaRows;

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
    "vente abandonée": "SlateGrey",
  };

  var tabStyle = function(t) {
    var active = tab === t;
    return {
      padding: "8px 20px",
      fontSize: 13,
      fontWeight: 700,
      border: "none",
      cursor: "pointer",
      borderRadius: "10px 10px 0 0",
      background: active ? (t === "vst" ? "#1D1D1F" : "#FF3B30") : "#F5F5F7",
      color: active ? "#fff" : "#AEAEB2",
      fontFamily: "inherit",
      transition: "background 0.15s, color 0.15s",
    };
  };

  return (
    <div>
      {/* Tabs VST / VTA */}
      <div style={{ display: "flex", gap: 4, marginBottom: 0 }}>
        <button onClick={function() { setTab("vst"); setSearch(""); }} style={tabStyle("vst")}>
          Carnet VST <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 4, opacity: 0.8 }}>{vstRows.length}</span>
        </button>
        <button onClick={function() { setTab("vta"); setSearch(""); }} style={tabStyle("vta")}>
          Carnet VTA <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 4, opacity: 0.8 }}>{vtaRows.length}</span>
        </button>
      </div>

      {/* Header */}
      <div style={{ background: tab === "vst" ? "#1D1D1F" : "#FF3B30", borderRadius: "0 12px 0 0", padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>
          {tab === "vst" ? "Carnet VST (Stratygo)" : "Carnet VTA (TALC)"}
          <span style={{ fontSize: 13, fontWeight: 400, marginLeft: 8, opacity: 0.7 }}>{filtered.length} / {activeRows.length}</span>
        </div>
        <input
          value={search}
          onChange={function(e) { setSearch(e.target.value); }}
          placeholder="Rechercher..."
          style={{ padding: "6px 12px", borderRadius: 8, border: "none", fontSize: 13, width: 220, outline: "none", background: "rgba(255,255,255,0.2)", color: "#fff", fontFamily: "inherit" }}
        />
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", borderRadius: "0 0 12px 12px", border: "1px solid #E5E5EA", borderTop: "none" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#F5F5F7" }}>
              {headers.map(function(h) {
                return <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "#3A3A3C", whiteSpace: "nowrap", borderBottom: "1px solid #E5E5EA" }}>{h}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={headers.length} style={{ padding: 32, textAlign: "center", color: "#AEAEB2" }}>Aucun résultat</td></tr>
            )}
            {filtered.map(function(row, i) {
              var status = row["etat_commande"] || "";
              var bg = ROW_COLORS[status.toLowerCase()] || "#fff";
              return (
                <tr key={i} style={{ background: bg }}>
                  {headers.map(function(h) {
                    return <td key={h} style={{ padding: "6px 10px", borderBottom: "1px solid #F2F2F7", whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{row[h] || ""}</td>;
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
