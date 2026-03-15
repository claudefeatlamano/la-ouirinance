import { JACHERE, JACHERE_TALC } from "../constants/jachere.js";
import { GPS } from "../data/gps.js";
import { getC, getTalcC, MONTHS_ORDER } from "./carnet.js";

function haversine(lat1, lon1, lat2, lon2) {
  var R = 6371;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLon = (lon2 - lon1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

var _gpsLookup = null;

function buildGPSLookup() {
  if (_gpsLookup) return _gpsLookup;
  _gpsLookup = {};

  var gpsKeys = Object.keys(GPS);
  var gpsKeysByDept = {};
  gpsKeys.forEach(function(k) {
    var parts = k.split("|");
    var dept = parts[1];
    if (!gpsKeysByDept[dept]) gpsKeysByDept[dept] = [];
    gpsKeysByDept[dept].push({ name: parts[0], coords: GPS[k] });
  });

  function normalize(s) {
    return s.replace(/\bSAINT /g, "ST ").replace(/\bSAINTE /g, "STE ");
  }

  function resolve(communeName, dept) {
    var exactKey = communeName + "|" + dept;
    if (GPS[exactKey]) return GPS[exactKey];

    var normName = normalize(communeName);
    var deptEntries = gpsKeysByDept[dept];
    if (!deptEntries) return null;

    for (var i = 0; i < deptEntries.length; i++) {
      if (deptEntries[i].name === normName) return deptEntries[i].coords;
    }

    for (var j = 0; j < deptEntries.length; j++) {
      if (normName.indexOf(deptEntries[j].name) === 0 || deptEntries[j].name.indexOf(normName) === 0) {
        return deptEntries[j].coords;
      }
    }

    return null;
  }

  function processCommunes(sectors, zoneType) {
    Object.keys(sectors).forEach(function(sectorName) {
      var sector = sectors[sectorName];
      sector.communes.forEach(function(commune) {
        var key = commune.v + "|" + sector.dept;
        if (_gpsLookup[key]) return;
        var coords = resolve(commune.v, sector.dept);
        if (coords) _gpsLookup[key] = coords;
      });
    });
  }

  processCommunes(JACHERE, "stratygo");
  processCommunes(JACHERE_TALC, "talc");

  return _gpsLookup;
}

function getDormantCommunes(minMonths) {
  var lookup = buildGPSLookup();
  var result = [];

  function process(sectors, zoneType, getCFn) {
    Object.keys(sectors).forEach(function(sectorName) {
      var sector = sectors[sectorName];
      sector.communes.forEach(function(commune) {
        var key = commune.v + "|" + sector.dept;
        var coords = lookup[key];
        if (!coords) return;

        var lastActiveIdx = -1;
        for (var i = MONTHS_ORDER.length - 1; i >= 0; i--) {
          var c = getCFn(commune, sector.dept, MONTHS_ORDER[i]);
          if (c > 0) { lastActiveIdx = i; break; }
        }

        var monthsAgo;
        if (lastActiveIdx < 0) {
          monthsAgo = MONTHS_ORDER.length + 1;
        } else {
          monthsAgo = MONTHS_ORDER.length - 1 - lastActiveIdx;
        }

        if (monthsAgo >= minMonths) {
          result.push({
            v: commune.v,
            dept: sector.dept,
            sector: sectorName,
            zoneType: zoneType,
            p: commune.p,
            lat: coords[0],
            lon: coords[1],
            monthsAgo: monthsAgo
          });
        }
      });
    });
  }

  process(JACHERE, "stratygo", getC);
  process(JACHERE_TALC, "talc", getTalcC);

  return result;
}

function suggestCluster(dormantCommunes, numMembers, maxRadiusKm, skip) {
  if (!maxRadiusKm) maxRadiusKm = 20;
  if (!skip) skip = 0;
  if (!dormantCommunes || dormantCommunes.length === 0) return { communes: [], radius: 0 };

  var sorted = dormantCommunes.slice().sort(function(a, b) { return b.p - a.p; });

  var seedIdx = skip % sorted.length;
  var seed = sorted[seedIdx];
  var cluster = [seed];
  var used = {};
  used[seed.v + "|" + seed.dept] = true;

  var candidates = [];
  for (var i = 1; i < sorted.length; i++) {
    var d = haversine(seed.lat, seed.lon, sorted[i].lat, sorted[i].lon);
    if (d <= maxRadiusKm) {
      candidates.push({ commune: sorted[i], dist: d });
    }
  }
  candidates.sort(function(a, b) { return a.dist - b.dist; });

  var maxDist = 0;
  for (var j = 0; j < candidates.length; j++) {
    var c = candidates[j];
    if (!used[c.commune.v + "|" + c.commune.dept]) {
      cluster.push(c.commune);
      used[c.commune.v + "|" + c.commune.dept] = true;
      if (c.dist > maxDist) maxDist = c.dist;
    }
  }

  return { communes: cluster, radius: Math.round(maxDist) };
}

export { getDormantCommunes, suggestCluster, haversine };
