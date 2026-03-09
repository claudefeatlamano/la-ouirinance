import React, { useState, useMemo } from "react";
import carnetData from "../data.json";
import { Card, Inp, Badge } from "./ui.jsx";
import { statusColor } from "../helpers/status.js";

function CarnetTab() {
  var [search, setSearch] = useState("");
  var rows = carnetData;

  var filtered = useMemo(function() {
    if (!search.trim()) return rows;
    var q = search.toLowerCase();
    return rows.filter(function(r) {
      return Object.values(r).some(function(v) { return String(v).toLowerCase().includes(q); });
    });
  }, [rows, search]);

  var headers = rows.length > 0 ? Object.keys(rows[0]) : [];

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

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Carnet de Commandes <span style={{ fontSize: 14, fontWeight: 400, color: "#6E6E73" }}>{filtered.length} / {rows.length}</span></div>
        <input
          value={search}
          onChange={function(e) { setSearch(e.target.value); }}
          placeholder="Rechercher..."
          style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #D2D2D7", fontSize: 13, width: 220, outline: "none" }}
        />
      </div>
      <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid #E5E5EA" }}>
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
