import carnetData from "../data.json";
import bouyguesData from "../data_bouygues.json";
import { MONTHLY } from "./monthly-data.js";

function normVille(s) {
  return (s || "").toUpperCase().trim().replace(/\bST /g, "SAINT ").replace(/\bSTE /g, "SAINTE ");
}

// Carnet auto-feed counts for TALC sectors
var CARNET_BY_VILLE_ALL = {};
var CARNET_BY_VILLE_MONTH = {};
(function() {
  var ML = ["jan","fev","mar","avr","mai","jun","jul","aou","sep","oct","nov","dec"];
  (carnetData.rows || carnetData).forEach(function(row) {
    var v = (row.ville || "").toUpperCase().trim();
    if (!v) return;
    CARNET_BY_VILLE_ALL[v] = (CARNET_BY_VILLE_ALL[v] || 0) + 1;
    // raw carnet field is date_inscription ("2026-02-05 19:48"), not date
    var d = (row.date_inscription || row.date || "").split(" ")[0];
    var p = d.split("-");
    if (p.length === 3) {
      var mk = ML[parseInt(p[1])-1] + p[0].slice(2);
      if (!CARNET_BY_VILLE_MONTH[v]) CARNET_BY_VILLE_MONTH[v] = {};
      CARNET_BY_VILLE_MONTH[v][mk] = (CARNET_BY_VILLE_MONTH[v][mk] || 0) + 1;
    }
  });
})();

// Count BT (Bouygues) contracts into the same ville maps
(function() {
  var ML = ["jan","fev","mar","avr","mai","jun","jul","aou","sep","oct","nov","dec"];
  (bouyguesData.rows || []).forEach(function(row) {
    var v = normVille(row.ville);
    if (!v) return;
    CARNET_BY_VILLE_ALL[v] = (CARNET_BY_VILLE_ALL[v] || 0) + 1;
    // BT date format is DD/MM/YYYY HH:MM
    var d = (row.date_inscription || "").split(" ")[0];
    var p = d.split("/");
    if (p.length === 3) {
      var mk = ML[parseInt(p[1])-1] + p[2].slice(2);
      if (!CARNET_BY_VILLE_MONTH[v]) CARNET_BY_VILLE_MONTH[v] = {};
      CARNET_BY_VILLE_MONTH[v][mk] = (CARNET_BY_VILLE_MONTH[v][mk] || 0) + 1;
    }
  });
})();

var _ML_KEYS = ["jan","fev","mar","avr","mai","jun","jul","aou","sep","oct","nov","dec"];
var _ML_FULL = ["Janv","Fev","Mars","Avr","Mai","Juin","Juil","Aout","Sept","Oct","Nov","Dec"];
var MONTHS_ORDER = (function() {
  var out = []; var sy = 2025, sm = 3;
  var now = new Date(); var ey = now.getFullYear(), em = now.getMonth() + 1;
  var y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(_ML_KEYS[m-1] + String(y).slice(2));
    if (++m > 12) { m = 1; y++; }
  }
  return out;
})();
var MONTHS_LABELS = MONTHS_ORDER.reduce(function(acc, mk) {
  var m = _ML_KEYS.indexOf(mk.slice(0,-2)); var y = "20" + mk.slice(-2);
  acc[mk] = _ML_FULL[m] + " " + y; return acc;
}, {});
var MONTH_KEY_MAP = MONTHS_ORDER.reduce(function(acc, mk) {
  acc[mk] = mk.slice(0,-2); return acc;
}, {});

function getC(commune, dept, month) {
if (!month) {
var carnetTotal = CARNET_BY_VILLE_ALL[commune.v] || 0;
if (carnetTotal > 0) return carnetTotal;
var mAll = MONTHLY[commune.v + "|" + dept];
if (!mAll) return commune.c || 0;
var total = 0;
Object.keys(mAll).forEach(function(k) { total += mAll[k]; });
return total;
}
// Carnet first (live, accurate) — fallback to Excel MONTHLY for old months not in carnet
var carnetVal = (CARNET_BY_VILLE_MONTH[commune.v] && CARNET_BY_VILLE_MONTH[commune.v][month]) || 0;
if (carnetVal > 0) return carnetVal;
var dataKey = MONTH_KEY_MAP[month] || month;
var m = MONTHLY[commune.v + "|" + dept];
return m ? (m[dataKey] || 0) : 0;
}

function getTalcC(commune, dept, month) {
  var v = commune.v;
  if (!month) return CARNET_BY_VILLE_ALL[v] || 0;
  // Carnet first (live, accurate) — fallback to Excel MONTHLY for old months not in carnet
  var carnetVal = (CARNET_BY_VILLE_MONTH[v] && CARNET_BY_VILLE_MONTH[v][month]) || 0;
  if (carnetVal > 0) return carnetVal;
  var dataKey = MONTH_KEY_MAP[month] || month;
  var m = MONTHLY[v + "|" + dept];
  return m ? (m[dataKey] || 0) : 0;
}

export { CARNET_BY_VILLE_ALL, CARNET_BY_VILLE_MONTH, getTalcC, getC, MONTHS_ORDER, MONTHS_LABELS, MONTH_KEY_MAP, MONTHLY, _ML_KEYS, _ML_FULL, normVille };
