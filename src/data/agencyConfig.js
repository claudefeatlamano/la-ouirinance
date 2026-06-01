var AGENCY_CONFIG = {
  agencyId: "la-ouirinance",
  agencyName: "La Ouirinance",
  firestoreCollection: "agency",
  feeds: {
    freeContracts: "https://raw.githubusercontent.com/claudefeatlamano/la-ouirinance/main/src/data.json",
    bouyguesContracts: "https://raw.githubusercontent.com/claudefeatlamano/la-ouirinance/main/src/data_bouygues.json",
  },
  keys: {
    team: "agency-team-v4",
    cars: "agency-cars-v4",
    contracts: "agency-contracts-v3",
    dailyPlan: "agency-daily-plan-v4",
    objectives: "agency-objectives-v3",
    groups: "agency-groups-v1",
    jacheres: "agency-jacheres-v1",
    proxadCredentials: "agency-proxad-creds-v1",
  },
};

var STORAGE_KEYS = AGENCY_CONFIG.keys;

export { AGENCY_CONFIG, STORAGE_KEYS };
