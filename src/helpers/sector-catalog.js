import { JACHERE, JACHERE_TALC } from "../constants/jachere.js";
import { normalizeCustomSectors } from "./import-parser.js";

function getSectorCatalog(customSectors) {
  var custom = normalizeCustomSectors(customSectors);
  var jachere = Object.assign({}, JACHERE, custom.stratygo);
  var jachereTalc = Object.assign({}, JACHERE_TALC, custom.talc);
  var sectors = Object.keys(jachere).map(function(n) { return { name: n, talc: false }; })
    .concat(Object.keys(jachereTalc).map(function(n) { return { name: n, talc: true }; }));
  var communes = [];

  Object.keys(jachere).forEach(function(sectorName) {
    var s = jachere[sectorName];
    (s.communes || []).forEach(function(c) {
      communes.push({ v: c.v, p: c.p, sector: sectorName, talc: false });
    });
  });
  Object.keys(jachereTalc).forEach(function(sectorName) {
    var s = jachereTalc[sectorName];
    (s.communes || []).forEach(function(c) {
      communes.push({ v: c.v, p: c.p, sector: sectorName, talc: true });
    });
  });

  return { jachere: jachere, jachereTalc: jachereTalc, sectors: sectors, communes: communes };
}

export { getSectorCatalog };
