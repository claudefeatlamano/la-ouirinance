import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

var __dirname = dirname(fileURLToPath(import.meta.url));
var gpsPath = join(__dirname, "..", "src", "data", "gps.js");

// Read existing GPS keys
var gpsSource = readFileSync(gpsPath, "utf-8");
var existingKeys = new Set();
var keyRegex = /"([^"]+\|\d+)"/g;
var m;
while ((m = keyRegex.exec(gpsSource)) !== null) {
  existingKeys.add(m[1]);
}
console.log("Existing GPS entries:", existingKeys.size);

// Import JACHERE data
var jachereModule = await import("../src/constants/jachere.js");
var JACHERE = jachereModule.JACHERE;
var JACHERE_TALC = jachereModule.JACHERE_TALC;

// Collect all commune|dept pairs
var allCommunes = new Map();
function collectCommunes(sectors) {
  Object.keys(sectors).forEach(function(sectorName) {
    var sector = sectors[sectorName];
    sector.communes.forEach(function(commune) {
      var key = commune.v + "|" + sector.dept;
      if (!allCommunes.has(key)) {
        allCommunes.set(key, { name: commune.v, dept: sector.dept });
      }
    });
  });
}
collectCommunes(JACHERE);
collectCommunes(JACHERE_TALC);
console.log("Total communes in JACHERE/JACHERE_TALC:", allCommunes.size);

// Build normalized lookup for existing keys to avoid duplicates
function normalize(s) {
  return s.replace(/\bSAINT /g, "ST ").replace(/\bSAINTE /g, "STE ");
}

var existingByDept = {};
existingKeys.forEach(function(k) {
  var parts = k.split("|");
  var dept = parts[1];
  if (!existingByDept[dept]) existingByDept[dept] = [];
  existingByDept[dept].push(parts[0]);
});

function hasExistingMatch(communeName, dept) {
  if (existingKeys.has(communeName + "|" + dept)) return true;
  var normName = normalize(communeName);
  var entries = existingByDept[dept] || [];
  for (var i = 0; i < entries.length; i++) {
    var normEntry = normalize(entries[i]);
    if (normEntry === normName) return true;
    if (normName.indexOf(normEntry) === 0 || normEntry.indexOf(normName) === 0) return true;
  }
  return false;
}

// Find missing communes
var missing = [];
allCommunes.forEach(function(val, key) {
  if (!hasExistingMatch(val.name, val.dept)) {
    missing.push(val);
  }
});
console.log("Missing communes (no GPS match):", missing.length);

if (missing.length === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}

// Query geo.api.gouv.fr
function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

var resolved = [];
var unresolved = [];

for (var i = 0; i < missing.length; i++) {
  var commune = missing[i];
  var url = "https://geo.api.gouv.fr/communes?nom=" + encodeURIComponent(commune.name) +
    "&codeDepartement=" + commune.dept +
    "&fields=centre&boost=population";

  try {
    var response = await fetch(url);
    if (!response.ok) {
      console.error("HTTP " + response.status + " for " + commune.name + "|" + commune.dept);
      unresolved.push(commune);
      await sleep(100);
      continue;
    }
    var data = await response.json();
    if (data.length > 0 && data[0].centre) {
      var lon = data[0].centre.coordinates[0];
      var lat = data[0].centre.coordinates[1];
      resolved.push({
        key: commune.name + "|" + commune.dept,
        lat: Math.round(lat * 100) / 100,
        lon: Math.round(lon * 100) / 100
      });
    } else {
      unresolved.push(commune);
    }
  } catch (err) {
    console.error("Error for " + commune.name + "|" + commune.dept + ": " + err.message);
    unresolved.push(commune);
  }
  await sleep(100);
  if ((i + 1) % 50 === 0) console.log("Progress: " + (i + 1) + "/" + missing.length);
}

console.log("\nResolved:", resolved.length);
console.log("Unresolved:", unresolved.length);

if (unresolved.length > 0) {
  console.error("\n--- Unresolved communes ---");
  unresolved.forEach(function(c) {
    console.error(c.name + "|" + c.dept);
  });
}

if (resolved.length === 0) {
  console.log("No new entries to add.");
  process.exit(0);
}

// Output or write
var writeMode = process.argv.includes("--write");

if (!writeMode) {
  console.log("\n--- New entries (dry run) ---");
  resolved.forEach(function(r) {
    console.log('"' + r.key + '":[' + r.lat + "," + r.lon + "]");
  });
  console.log("\nRun with --write to inject into gps.js");
} else {
  // Build new entries string
  var newEntries = resolved.map(function(r) {
    return '"' + r.key + '":[' + r.lat + "," + r.lon + "]";
  }).join(",");

  // Insert before the closing };
  var updated = gpsSource.replace(/\n};/, ",\n" + newEntries + "\n};");
  writeFileSync(gpsPath, updated, "utf-8");
  console.log("\nWrote " + resolved.length + " new entries to gps.js");
}
