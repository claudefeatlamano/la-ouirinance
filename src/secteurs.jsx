import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { store, STORAGE_KEYS } from "./data/store.js";
import { SecteursTab } from "./components/SecteursTab.jsx";

// Déploiement dédié "Secteurs" pour les formateurs : version isolée et en
// lecture seule, qui n'embarque QUE l'onglet Secteurs (pas le reste du dashboard).
function SecteursApp() {
  var [customSectors, setCustomSectors] = useState({ stratygo: {}, talc: {} });

  useEffect(function () {
    var mounted = true;
    store.get(STORAGE_KEYS.jacheres).then(function (loaded) {
      if (mounted && loaded) setCustomSectors(loaded);
    });
    return function () { mounted = false; };
  }, []);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 16px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <div style={{ width: 4, height: 22, borderRadius: 2, background: "var(--lo-primary)" }} />
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--lo-ink)", letterSpacing: -0.3 }}>
          La Ouirinance — Secteurs
        </h1>
      </div>
      <SecteursTab customSectors={customSectors} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SecteursApp />
  </React.StrictMode>
);
