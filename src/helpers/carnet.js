import contractsArchive from "../contracts-archive.json";
import { MONTHLY } from "./monthly-data.js";
import { buildCarnetCounts, getArchiveCount, getLegacyMonthlyCount, normalizeSectorVille } from "./carnet-core.js";

// Archive permanente des contrats. Les mois dates (ex: jun26) viennent seulement
// de l'archive; le fallback MONTHLY n'a pas d'annee et reste reserve aux totaux.
var _archiveRows = Object.values(contractsArchive);
var CARNET_COUNTS = buildCarnetCounts(_archiveRows);

function normVille(s) {
  return normalizeSectorVille(s);
}

var CARNET_BY_VILLE_ALL = CARNET_COUNTS.byVilleAll;
var CARNET_BY_VILLE_MONTH = CARNET_COUNTS.byVilleMonth;

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
  var v = normVille(commune.v);
  if (!month) {
    var archiveTotal = getArchiveCount(CARNET_COUNTS, v, dept, "");
    if (archiveTotal > 0) return archiveTotal;
    var legacyTotal = getLegacyMonthlyCount(MONTHLY, v, dept, "");
    if (legacyTotal > 0) return legacyTotal;
    return commune.c || 0;
  }
  var archiveVal = getArchiveCount(CARNET_COUNTS, v, dept, month);
  if (archiveVal > 0) return archiveVal;
  return getLegacyMonthlyCount(MONTHLY, v, dept, month);
}

function getTalcC(commune, dept, month) {
  var v = normVille(commune.v);
  if (!month) {
    return getArchiveCount(CARNET_COUNTS, v, dept, "") || getLegacyMonthlyCount(MONTHLY, v, dept, "");
  }
  var archiveVal = getArchiveCount(CARNET_COUNTS, v, dept, month);
  if (archiveVal > 0) return archiveVal;
  return getLegacyMonthlyCount(MONTHLY, v, dept, month);
}

export { CARNET_BY_VILLE_ALL, CARNET_BY_VILLE_MONTH, getTalcC, getC, MONTHS_ORDER, MONTHS_LABELS, MONTH_KEY_MAP, MONTHLY, _ML_KEYS, _ML_FULL, normVille };
