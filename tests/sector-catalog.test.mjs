import assert from "node:assert/strict";
import { getSectorCatalog } from "../src/helpers/sector-catalog.js";

var catalog = getSectorCatalog({
  stratygo: {
    "POITIERS 86": {
      dept: "86",
      communes: [{ v: "POITIERS", p: 12500, z: "H" }],
    },
  },
  talc: {
    "ANGERS 49": {
      dept: "49",
      communes: [{ v: "ANGERS", p: 51000, z: "H" }],
    },
  },
});

assert.equal(catalog.jachere["POITIERS 86"].dept, "86");
assert.equal(catalog.jachereTalc["ANGERS 49"].dept, "49");
assert.ok(catalog.sectors.some(function(s) { return s.name === "POITIERS 86" && !s.talc; }));
assert.ok(catalog.sectors.some(function(s) { return s.name === "ANGERS 49" && s.talc; }));
assert.ok(catalog.communes.some(function(c) { return c.v === "POITIERS" && c.sector === "POITIERS 86"; }));

console.log("sector catalog tests passed");
