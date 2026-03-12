import React, { useState, useEffect, useRef } from "react";
import { Card, Btn, Sel } from "./ui.jsx";
import { JACHERE, JACHERE_TALC } from "../constants/jachere.js";
import { GPS } from "../data/gps.js";
import { getC, getTalcC, MONTHS_ORDER, MONTHS_LABELS } from "../helpers/carnet.js";

function MapTab() {
var mapRef = useRef(null);
var mapInstance = useRef(null);
const [mapReady, setMapReady] = useState(false);
const [month, setMonth] = useState("");

useEffect(function() {
if (window.L) { setMapReady(true); return; }
if (document.getElementById("leaflet-css")) { if (window.L) setMapReady(true); return; }
var css = document.createElement("link");
css.id = "leaflet-css"; css.rel = "stylesheet";
css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
document.head.appendChild(css);
var js = document.createElement("script");
js.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
js.onload = function() { setMapReady(true); };
document.head.appendChild(js);
}, []);

useEffect(function() {
if (!mapReady || !mapRef.current) return;
if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
var L = window.L; if (!L) return;
var map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: true }).setView([46.6, -1.1], 8);
mapInstance.current = map;
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "OSM", maxZoom: 16 }).addTo(map);
setTimeout(function() {
map.invalidateSize();
Object.entries(JACHERE).forEach(function(entry) {
var jName = entry[0]; var jData = entry[1];
jData.communes.forEach(function(commune) {
var key = commune.v + "|" + jData.dept;
var coords = GPS[key]; if (!coords) return;
var c = getC(commune, jData.dept, month);
var taux = commune.p > 0 ? (c / commune.p * 100) : 0;
var color = c === 0 ? "#AEAEB2" : taux > 0.8 ? "#34C759" : taux > 0.3 ? "#FF9F0A" : "#FF3B30";
var radius = Math.max(5, Math.min(22, Math.sqrt(c) * 2.5));
L.circleMarker([coords[0], coords[1]], { radius: radius, fillColor: color, color: "#fff", weight: 2, opacity: 1, fillOpacity: 0.85 }).addTo(map).bindPopup(
"<div style='font-family:-apple-system,sans-serif;min-width:180px'><b style='font-size:14px'>" + commune.v + "</b><br>" +
"<span style='font-size:11px;color:#6B7280'>" + jName + " | " + (commune.z === "H" ? "Haute" : "Standard") + "</span><hr style='margin:6px 0;border:none;border-top:1px solid #eee'>" +
"Prises: <b>" + commune.p.toLocaleString("fr-FR") + "</b><br>Contrats: <b style='color:" + color + "'>" + c + "</b><br>Taux: <b style='color:" + color + "'>" + taux.toFixed(2) + "%</b></div>"
);
});
});
Object.entries(JACHERE_TALC).forEach(function(entry) {
var jName = entry[0]; var jData = entry[1];
jData.communes.forEach(function(commune) {
var key = commune.v + "|" + jData.dept;
var coords = GPS[key]; if (!coords) return;
var c = getTalcC(commune, jData.dept, month);
var taux = commune.p > 0 ? (c / commune.p * 100) : 0;
var color = c === 0 ? "#AEAEB2" : taux > 0.8 ? "#34C759" : taux > 0.3 ? "#FF9F0A" : "#FF3B30";
var radius = Math.max(5, Math.min(22, Math.sqrt(c) * 2.5 + 4));
L.circleMarker([coords[0], coords[1]], { radius: radius, fillColor: color, color: "#FF9F0A", weight: 3, opacity: 1, fillOpacity: 0.85 }).addTo(map).bindPopup(
"<div style='font-family:-apple-system,sans-serif;min-width:180px'><b style='font-size:14px'>" + commune.v + "</b> <span style='font-size:10px;background:#FF9F0A;color:#fff;border-radius:4px;padding:1px 5px;font-weight:700'>TALC</span><br>" +
"<span style='font-size:11px;color:#6B7280'>" + jName + " | Zone " + commune.z + (commune.z === "H" ? " (+5€)" : " (-15€)") + "</span><hr style='margin:6px 0;border:none;border-top:1px solid #eee'>" +
"Prises: <b>" + commune.p.toLocaleString("fr-FR") + "</b><br>Contrats: <b style='color:" + color + "'>" + c + "</b><br>Taux: <b style='color:" + color + "'>" + taux.toFixed(2) + "%</b></div>"
);
});
});
}, 400);
return function() { if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; } };
}, [mapReady, month]);

return (
<div>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
<h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: -0.4, color: "#f0f0f5" }}>Carte des jacheres</h2>
<Sel value={month} onChange={setMonth} placeholder="Tous les mois" options={MONTHS_ORDER.map(function(m) { return { value: m, label: MONTHS_LABELS[m] }; })} style={{ minWidth: 150 }} />
</div>
<Card style={{ padding: 0, overflow: "hidden", marginBottom: 12, borderRadius: 14 }}>
<div ref={mapRef} style={{ width: "100%", height: 560 }}>
{!mapReady && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 560, color: "rgba(255,255,255,0.35)" }}>Chargement...</div>}
</div>
</Card>
<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
<div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 12, height: 12, borderRadius: "50%", background: "#34C759" }} /><span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>Bon taux</span></div>
<div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 12, height: 12, borderRadius: "50%", background: "#FF9F0A" }} /><span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>Moyen</span></div>
<div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 12, height: 12, borderRadius: "50%", background: "#FF3B30" }} /><span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>Faible</span></div>
<div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 12, height: 12, borderRadius: "50%", background: "#AEAEB2" }} /><span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>0 contrats</span></div>
<div style={{ marginLeft: 8, display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 12, height: 12, borderRadius: "50%", background: "#888", border: "2.5px solid #FF9F0A" }} /><span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>TALC</span></div>
<div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 12, height: 12, borderRadius: "50%", background: "#888", border: "2px solid #fff" }} /><span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>Stratygo</span></div>
</div>
</div>
);
}

function CommuneHeatmap({ communeName, rueList }) {
var mapRef = useRef(null);
var mapInstance = useRef(null);
const [mapReady, setMapReady] = useState(!!window.L);
const [geoData, setGeoData] = useState([]);
const [loading, setLoading] = useState(true);

useEffect(function() {
  if (window.L) { setMapReady(true); return; }
  if (!document.getElementById("leaflet-css")) {
    var css = document.createElement("link");
    css.id = "leaflet-css"; css.rel = "stylesheet";
    css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(css);
  }
  if (document.getElementById("leaflet-js")) { if (window.L) setMapReady(true); return; }
  var js = document.createElement("script");
  js.id = "leaflet-js";
  js.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
  js.onload = function() { setMapReady(true); };
  document.head.appendChild(js);
}, []);

useEffect(function() {
  if (!mapReady) return;
  var cancelled = false;
  var cache = {};
  try { cache = JSON.parse(localStorage.getItem("ouirinance-geocache-v1")) || {}; } catch(e) {}
  var toProcess = rueList.slice(0, 25).filter(function(e) { return e[0] !== "(rue non renseignée)"; });
  var results = [];
  var toFetch = [];
  toProcess.forEach(function(entry) {
    var key = communeName + "|" + entry[0];
    if (cache[key]) {
      results.push({ rue: entry[0], count: entry[1].count, lat: cache[key].lat, lng: cache[key].lng });
    } else {
      toFetch.push(entry);
    }
  });
  if (toFetch.length === 0) {
    if (!cancelled) { setGeoData(results); setLoading(false); }
    return function() { cancelled = true; };
  }
  var newCache = Object.assign({}, cache);
  (async function() {
    for (var i = 0; i < toFetch.length; i++) {
      if (cancelled) return;
      var entry = toFetch[i];
      var key = communeName + "|" + entry[0];
      try {
        var r = await fetch("https://api-adresse.data.gouv.fr/search/?q=" + encodeURIComponent(entry[0] + " " + communeName) + "&limit=1");
        var d = await r.json();
        if (d.features && d.features.length > 0) {
          var c = d.features[0].geometry.coordinates;
          newCache[key] = { lat: c[1], lng: c[0] };
          results.push({ rue: entry[0], count: entry[1].count, lat: c[1], lng: c[0] });
        }
      } catch(e) {}
      if (i < toFetch.length - 1) await new Promise(function(res) { setTimeout(res, 80); });
    }
    try { localStorage.setItem("ouirinance-geocache-v1", JSON.stringify(newCache)); } catch(e) {}
    if (!cancelled) { setGeoData(results); setLoading(false); }
  })();
  return function() { cancelled = true; };
}, [mapReady, communeName]);

useEffect(function() {
  if (!mapReady || !mapRef.current || geoData.length === 0) return function() {};
  if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
  var L = window.L; if (!L) return function() {};
  var lat0 = geoData.reduce(function(s, d) { return s + d.lat; }, 0) / geoData.length;
  var lng0 = geoData.reduce(function(s, d) { return s + d.lng; }, 0) / geoData.length;
  var map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: true }).setView([lat0, lng0], 14);
  mapInstance.current = map;
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OSM", maxZoom: 18 }).addTo(map);
  var maxCount = Math.max.apply(null, geoData.map(function(d) { return d.count; })) || 1;
  geoData.forEach(function(d) {
    var ratio = d.count / maxCount;
    var radius = Math.max(40, Math.min(140, ratio * 100 + 40));
    var col = ratio > 0.66 ? "#FF3B30" : ratio > 0.33 ? "#FF9F0A" : "#34C759";
    L.circle([d.lat, d.lng], { radius: radius, fillColor: col, color: "transparent", weight: 0, fillOpacity: Math.max(0.25, ratio * 0.65) })
      .addTo(map)
      .bindPopup("<b style='font-family:-apple-system,sans-serif'>" + d.rue + "</b><br><span style='color:" + col + ";font-weight:700;font-family:-apple-system,sans-serif'>" + d.count + " contrat" + (d.count > 1 ? "s" : "") + "</span>");
  });
  setTimeout(function() { map.invalidateSize(); }, 200);
  return function() { if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; } };
}, [geoData, mapReady]);

return (
<Card style={{ padding: 20, marginBottom: 16 }}>
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#f0f0f5" }}>Heatmap rues</h3>
    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>{loading ? "Géocodage…" : geoData.length + " rue" + (geoData.length > 1 ? "s" : "") + " géocodée" + (geoData.length > 1 ? "s" : "")}</span>
  </div>
  <div style={{ position: "relative" }}>
    <div ref={mapRef} style={{ height: 300, borderRadius: 12, overflow: "hidden", background: "rgba(255,255,255,0.05)" }} />
    {loading && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,11,30,0.85)", borderRadius: 12 }}><span style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>Géocodage des rues…</span></div>}
  </div>
  <div style={{ marginTop: 10, display: "flex", gap: 12, justifyContent: "center" }}>
    <span style={{ fontSize: 11, color: "#34C759", fontWeight: 700 }}>● peu prospectée</span>
    <span style={{ fontSize: 11, color: "#FF9F0A", fontWeight: 700 }}>● moyenne</span>
    <span style={{ fontSize: 11, color: "#FF3B30", fontWeight: 700 }}>● très prospectée</span>
  </div>
</Card>
);
}

export { MapTab, CommuneHeatmap };
