import assert from "node:assert/strict";
import { AGENCY_CONFIG, STORAGE_KEYS } from "../src/data/agencyConfig.js";

assert.equal(AGENCY_CONFIG.agencyId, "la-ouirinance");
assert.equal(AGENCY_CONFIG.agencyName, "La Ouirinance");
assert.equal(AGENCY_CONFIG.firestoreCollection, "agency");
assert.equal(STORAGE_KEYS.team, "agency-team-v4");
assert.equal(STORAGE_KEYS.groups, "agency-groups-v1");
assert.equal(STORAGE_KEYS.jacheres, "agency-jacheres-v1");
assert.equal(STORAGE_KEYS.proxadCredentials, "agency-proxad-creds-v1");

console.log("agency-config.test.mjs ok");
