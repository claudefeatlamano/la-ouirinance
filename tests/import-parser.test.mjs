import assert from "node:assert/strict";
import { parseImportRows } from "../src/helpers/import-parser.js";

var rows = [
  {
    "Jachere": "POITIERS 86",
    "Departement": "86",
    "Ville": "Poitiers",
    "Prises": 12500,
    "Zone": "H",
    "Type": "Stratygo",
  },
  {
    "Jachere": "POITIERS 86",
    "Departement": "86",
    "Commune": "Chasseneuil du Poitou",
    "Potentiel": "2300",
    "Densite": "S",
    "Type": "Stratygo",
  },
];

var parsed = parseImportRows(rows, { fileName: "poitiers.xlsx" });

assert.equal(parsed.type, "jachere");
assert.equal(parsed.zoneType, "stratygo");
assert.equal(parsed.sectors.length, 1);
assert.equal(parsed.sectors[0].name, "POITIERS 86");
assert.equal(parsed.sectors[0].dept, "86");
assert.deepEqual(parsed.sectors[0].communes, [
  { v: "POITIERS", p: 12500, z: "H" },
  { v: "CHASSENEUIL DU POITOU", p: 2300, z: "S" },
]);

var talc = parseImportRows([
  { Secteur: "ANGERS 49", Commune: "Angers", Prises: "51000", Type: "TALC" },
], { fileName: "angers.xlsx" });

assert.equal(talc.type, "jachere");
assert.equal(talc.zoneType, "talc");
assert.equal(talc.sectors[0].dept, "49");

console.log("import parser tests passed");
