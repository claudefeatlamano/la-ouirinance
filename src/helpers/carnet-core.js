var MONTH_KEYS = ["jan", "fev", "mar", "avr", "mai", "jun", "jul", "aou", "sep", "oct", "nov", "dec"];

function normalizeSectorVille(s) {
  return (s || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-'\u2019]/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\bST\b/g, "SAINT")
    .replace(/\bSTE\b/g, "SAINTE")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(LES|LA|LE|L) /, "");
}

function getArchiveMonthKey(row) {
  var raw = (row.date_inscription || row.date || "").split(" ")[0];
  if (!raw) return "";
  var parts;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    parts = raw.split("-");
    return MONTH_KEYS[parseInt(parts[1], 10) - 1] + parts[0].slice(2);
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    parts = raw.split("/");
    return MONTH_KEYS[parseInt(parts[1], 10) - 1] + parts[2].slice(2);
  }
  return "";
}

function getArchiveDateKey(row) {
  var raw = (row.date_inscription || row.date || "").split(" ")[0];
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    var parts = raw.split("/");
    return parts[2] + "-" + parts[1] + "-" + parts[0];
  }
  return "";
}

function getArchiveDept(row) {
  var dept = (row.departement || row.dept || "").toString().trim();
  if (dept) return dept;
  var cp = (row.cp || row.code_postal || row.codePostal || "").toString().trim();
  if (/^\d{5}/.test(cp)) return cp.slice(0, 2);
  return "";
}

function normalizeStatusText(s) {
  return (s || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isCountableArchiveRow(row) {
  var etat = normalizeStatusText(row.etat_commande || row.status || row.statut || "");
  if (etat === "vente validee j+7" || etat === "vente validee j 7") return false;
  if (etat === "vente abandonnee") return false;
  if (etat === "saisie") return false;
  if (etat.indexOf("standby") === 0) return false;
  if (etat === "rib manquant" || etat === "call manquant") return false;
  return true;
}

function makeEmptyCounts() {
  return {
    byVilleAll: {},
    byVilleMonth: {},
    byVilleDeptAll: {},
    byVilleDeptMonth: {},
    deptsByVille: {},
  };
}

function incrementMonth(map, key, month) {
  if (!month) return;
  if (!map[key]) map[key] = {};
  map[key][month] = (map[key][month] || 0) + 1;
}

function buildCarnetCounts(rows) {
  var counts = makeEmptyCounts();
  (rows || []).forEach(function(row) {
    var ville = normalizeSectorVille(row.ville);
    if (!ville) return;
    var month = getArchiveMonthKey(row);
    var dept = getArchiveDept(row);
    counts.byVilleAll[ville] = (counts.byVilleAll[ville] || 0) + 1;
    incrementMonth(counts.byVilleMonth, ville, month);
    if (dept) {
      var key = ville + "|" + dept;
      counts.byVilleDeptAll[key] = (counts.byVilleDeptAll[key] || 0) + 1;
      incrementMonth(counts.byVilleDeptMonth, key, month);
      if (!counts.deptsByVille[ville]) counts.deptsByVille[ville] = {};
      counts.deptsByVille[ville][dept] = true;
    }
  });
  return counts;
}

function archiveRowMatchesCommune(row, ville, dept) {
  if (normalizeSectorVille(row.ville) !== normalizeSectorVille(ville)) return false;
  var rowDept = getArchiveDept(row);
  return !dept || !rowDept || rowDept === dept;
}

function normalizeStreet(row) {
  return (row.adresse || row.rue || "").toString().trim().toUpperCase() || "(RUE NON RENSEIGNEE)";
}

function getArchiveCommercial(row) {
  return (row.vendeur || row.commercial || row.login || "?").toString().trim() || "?";
}

function buildCommuneStreetStats(rows, ville, dept, selectedMonth, recentMonths) {
  var recentSet = {};
  (recentMonths || []).forEach(function(month) { recentSet[month] = true; });
  var byStreet = {};
  (rows || []).forEach(function(row) {
    if (!archiveRowMatchesCommune(row, ville, dept)) return;
    var street = normalizeStreet(row);
    var month = getArchiveMonthKey(row);
    var date = getArchiveDateKey(row);
    if (!byStreet[street]) {
      byStreet[street] = { count: 0, monthCount: 0, recentCount: 0, commerciaux: {}, operators: {}, lastDate: "" };
    }
    var info = byStreet[street];
    info.count++;
    if (selectedMonth && month === selectedMonth) info.monthCount++;
    if (recentSet[month]) info.recentCount++;
    if (date && date > info.lastDate) info.lastDate = date;
    var commercial = getArchiveCommercial(row);
    info.commerciaux[commercial] = (info.commerciaux[commercial] || 0) + 1;
    var op = row._op || row.operator || "?";
    info.operators[op] = (info.operators[op] || 0) + 1;
  });
  return Object.entries(byStreet).sort(function(a, b) {
    return b[1].count - a[1].count || (b[1].lastDate > a[1].lastDate ? 1 : b[1].lastDate < a[1].lastDate ? -1 : 0);
  });
}

function getArchiveCount(counts, ville, dept, month) {
  var v = normalizeSectorVille(ville);
  var key = v + "|" + dept;
  if (month) {
    var byDeptMonth = (counts.byVilleDeptMonth[key] && counts.byVilleDeptMonth[key][month]) || 0;
    if (byDeptMonth > 0 || (dept && counts.deptsByVille[v])) return byDeptMonth;
    return (counts.byVilleMonth[v] && counts.byVilleMonth[v][month]) || 0;
  }
  var byDeptAll = counts.byVilleDeptAll[key] || 0;
  if (byDeptAll > 0 || (dept && counts.deptsByVille[v])) return byDeptAll;
  return counts.byVilleAll[v] || 0;
}

function getLegacyMonthlyCount(monthly, ville, dept, month) {
  var key = normalizeSectorVille(ville) + "|" + dept;
  var data = monthly[key];
  if (!data) return 0;
  if (!month) {
    return Object.keys(data).reduce(function(total, k) { return total + (data[k] || 0); }, 0);
  }
  if (/\d{2}$/.test(month)) return 0;
  return data[month] || 0;
}

export {
  buildCarnetCounts,
  buildCommuneStreetStats,
  getArchiveDateKey,
  getArchiveCount,
  getArchiveDept,
  getArchiveMonthKey,
  getLegacyMonthlyCount,
  isCountableArchiveRow,
  normalizeSectorVille,
};
