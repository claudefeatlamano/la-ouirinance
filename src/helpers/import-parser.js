import { ROLES, OPERATORS } from "../constants/roles.js";

function normText(v) {
  return String(v == null ? "" : v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normKey(v) {
  return normText(v).toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function normCity(v) {
  return normText(v).toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function num(v) {
  if (typeof v === "number") return Math.round(v);
  var cleaned = normText(v).replace(/\s/g, "").replace(",", ".");
  var n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function getValue(row, aliases) {
  var keys = Object.keys(row || {});
  for (var alias of aliases) {
    var na = normKey(alias);
    var found = keys.find(function(k) {
      var nk = normKey(k);
      return nk === na || nk.indexOf(na) >= 0 || na.indexOf(nk) >= 0;
    });
    if (found && row[found] !== undefined && row[found] !== null && String(row[found]).trim() !== "") return row[found];
  }
  return "";
}

function inferDept(row, sectorName) {
  var direct = normText(getValue(row, ["departement", "dept", "dep", "code departement"]));
  var directMatch = direct.match(/\d{2,3}/);
  if (directMatch) return directMatch[0].slice(0, 2);

  var sectorMatch = normText(sectorName).match(/\b\d{2,3}\b/);
  if (sectorMatch) return sectorMatch[0].slice(0, 2);

  var postal = normText(getValue(row, ["code postal", "cp", "postal"])).match(/\d{5}/);
  return postal ? postal[0].slice(0, 2) : "";
}

function inferZoneType(row, fileName) {
  var raw = normKey([getValue(row, ["type", "zone type", "zonetype", "source", "reseau"]), fileName || ""].join(" "));
  if (raw.indexOf("talc") >= 0 || raw.indexOf("vta") >= 0) return "talc";
  return "stratygo";
}

function inferDensity(row) {
  var raw = normKey(getValue(row, ["densite", "zone", "categorie"]));
  if (raw === "s" || raw.indexOf("standard") >= 0 || raw.indexOf("std") >= 0) return "S";
  if (raw === "h" || raw.indexOf("haute") >= 0 || raw.indexOf("hd") >= 0) return "H";
  return "H";
}

function parseTeamRows(rows) {
  var members = rows.map(function(r, i) {
    var name = normText(getValue(r, ["nom", "name", "prenom", "commercial"]));
    if (!name) return null;
    var roleRaw = normKey(getValue(r, ["role", "poste"]));
    var operatorRaw = normKey(getValue(r, ["operateur", "produit"]));
    var rl = ROLES.find(function(x) { return roleRaw.indexOf(normKey(x)) >= 0; }) || "Debutant";
    var op = OPERATORS.find(function(x) { return operatorRaw.indexOf(normKey(x)) >= 0; }) || "Bouygues";
    var permis = normKey(getValue(r, ["permis"]));
    var voiture = normKey(getValue(r, ["voiture"]));
    return {
      id: Date.now() + i,
      name: name,
      role: rl,
      operators: [op],
      permis: ["oui", "yes", "1", "true", "x"].indexOf(permis) >= 0,
      voiture: ["oui", "yes", "1", "true", "x"].indexOf(voiture) >= 0,
      active: true,
    };
  }).filter(Boolean);
  return { type: "team", members: members };
}

function parseContractRows(rows) {
  var contracts = rows.map(function(r, i) {
    var operatorRaw = normKey(getValue(r, ["operateur"]));
    return {
      id: "i-" + Date.now() + "-" + i,
      commercial: normText(getValue(r, ["commercial", "nom", "vendeur"])),
      date: normText(getValue(r, ["date"])),
      heure: normText(getValue(r, ["heure"])),
      ville: normText(getValue(r, ["ville"])),
      rue: normText(getValue(r, ["rue", "adresse"])),
      operator: OPERATORS.find(function(x) { return operatorRaw.indexOf(normKey(x)) >= 0; }) || "Free",
      type: "Fibre",
      status: normText(getValue(r, ["statut", "status"])) || "Valide",
    };
  }).filter(function(c) { return c.commercial && c.date; });
  return { type: "contracts", contracts: contracts };
}

function parseJachereRows(rows, options) {
  var groups = {};
  rows.forEach(function(r) {
    var city = normCity(getValue(r, ["commune", "ville", "city"]));
    if (!city) return;
    var sector = normCity(getValue(r, ["jachere", "secteur", "sector", "zone prospection", "zone de prospection"]));
    if (!sector) sector = normCity((options && options.fileName ? options.fileName.replace(/\.[^.]+$/, "") : "") || "NOUVELLE JACHERE");
    var zoneType = inferZoneType(r, options && options.fileName);
    var key = zoneType + "::" + sector;
    if (!groups[key]) groups[key] = { name: sector, dept: inferDept(r, sector), zoneType: zoneType, communes: [] };
    if (!groups[key].dept) groups[key].dept = inferDept(r, sector);
    var entry = { v: city, p: num(getValue(r, ["prises", "prise", "potentiel", "foyers", "logements", "eligibles", "eligible", "pbo"])), z: inferDensity(r) };
    var contracts = num(getValue(r, ["contrats", "contrat", "ventes"]));
    if (contracts) entry.c = contracts;
    groups[key].communes.push(entry);
  });
  var sectors = Object.keys(groups).map(function(k) { return groups[k]; }).filter(function(s) { return s.communes.length > 0; });
  return { type: "jachere", zoneType: sectors[0] ? sectors[0].zoneType : "stratygo", sectors: sectors };
}

function parseImportRows(rows, options) {
  rows = Array.isArray(rows) ? rows : [];
  if (!rows.length) return { type: "empty" };
  var cols = Object.keys(rows[0] || {}).map(normKey);
  var has = function(words) { return cols.some(function(c) { return words.some(function(w) { return c.indexOf(normKey(w)) >= 0; }); }); };
  var isTeam = has(["role", "permis"]);
  var isContract = has(["heure", "statut", "status"]);
  var isJachere = has(["commune", "ville"]) && (has(["jachere", "secteur", "prises", "potentiel", "foyers", "logements", "pbo"]) || rows.some(function(r) { return getValue(r, ["jachere", "secteur"]) && getValue(r, ["commune", "ville"]); }));

  if (isTeam) return parseTeamRows(rows);
  if (isContract) return parseContractRows(rows);
  if (isJachere) return parseJachereRows(rows, options || {});
  return { type: "unknown" };
}

function normalizeCustomSectors(value) {
  return {
    stratygo: Object.assign({}, value && value.stratygo ? value.stratygo : {}),
    talc: Object.assign({}, value && value.talc ? value.talc : {}),
  };
}

function mergeImportedSectors(current, parsed) {
  var next = normalizeCustomSectors(current);
  (parsed && parsed.sectors ? parsed.sectors : []).forEach(function(sector) {
    var bucket = sector.zoneType === "talc" ? "talc" : "stratygo";
    next[bucket][sector.name] = { dept: sector.dept || "", communes: sector.communes || [] };
  });
  return next;
}

export { parseImportRows, mergeImportedSectors, normalizeCustomSectors };
