import assert from "node:assert/strict";
import {
  buildCarnetCounts,
  buildCommuneStreetStats,
  getArchiveCount,
  getLegacyMonthlyCount,
  normalizeSectorVille,
} from "../src/helpers/carnet-core.js";

assert.equal(
  getLegacyMonthlyCount({ "SABLES D OLONNE|85": { jun: 40 } }, "SABLES D OLONNE", "85", "jun26"),
  0,
  "Juin 2026 ne doit pas reprendre le vieux fallback mensuel sans annee"
);

assert.equal(
  getLegacyMonthlyCount({ "SABLES D OLONNE|85": { jun: 40 } }, "SABLES D OLONNE", "85", "jun"),
  40,
  "Le fallback mensuel historique reste disponible pour les cles sans annee"
);

assert.equal(normalizeSectorVille("LES SABLES-D'OLONNE"), "SABLES D OLONNE");
assert.equal(normalizeSectorVille("Sables d olonne"), "SABLES D OLONNE");

var counts = buildCarnetCounts([
  {
    _op: "bouygues",
    cp: "85100",
    date_inscription: "02/06/2026 10:00",
    ville: "LES SABLES-D'OLONNE",
  },
  {
    _op: "free",
    cp: "85194",
    date_inscription: "2026-06-02 11:00:00",
    ville: "Sables d olonne",
  },
  {
    _op: "free",
    cp: "85194",
    date_inscription: "2026-06-02 12:00:00",
    etat_commande: "vente valid\u00e9e J+7",
    ville: "Sables d olonne",
  },
]);

assert.equal(getArchiveCount(counts, "SABLES D OLONNE", "85", "jun26"), 3);
assert.equal(getArchiveCount(counts, "SABLES D OLONNE", "44", "jun26"), 0);

var streets = buildCommuneStreetStats([
  {
    _op: "free",
    cp: "85194",
    date_inscription: "2026-01-02 11:00:00",
    ville: "Sables d olonne",
    adresse: "1 RUE ANCIENNE",
    vendeur: "ancien vendeur",
  },
  {
    _op: "free",
    cp: "85194",
    date_inscription: "2026-06-02 11:00:00",
    ville: "LES SABLES-D'OLONNE",
    adresse: "2 RUE RECENTE",
    vendeur: "vendeur recent",
  },
], "SABLES D OLONNE", "85", "jun26", ["mai26", "jun26"]);

assert.equal(streets.length, 2);
assert.equal(streets.find(function(entry) { return entry[0] === "1 RUE ANCIENNE"; })[1].count, 1);
assert.equal(streets.find(function(entry) { return entry[0] === "1 RUE ANCIENNE"; })[1].monthCount, 0);
assert.equal(streets.find(function(entry) { return entry[0] === "2 RUE RECENTE"; })[1].monthCount, 1);
assert.equal(streets.find(function(entry) { return entry[0] === "2 RUE RECENTE"; })[1].recentCount, 1);

console.log("carnet.test.mjs ok");
