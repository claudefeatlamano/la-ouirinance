import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import carnetData from "./data.json";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCv5Rtux-734LhoBW5H07duvYeMC5HQoBA",
  authDomain: "la-ouirinance.firebaseapp.com",
  projectId: "la-ouirinance",
  storageBucket: "la-ouirinance.firebasestorage.app",
  messagingSenderId: "372728638985",
  appId: "1:372728638985:web:b3b7be83f87679641292d8",
};
const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);

const STORAGE_KEYS = { team: "agency-team-v4", cars: "agency-cars-v4", contracts: "agency-contracts-v3", dailyPlan: "agency-daily-plan-v4", objectives: "agency-objectives-v3", groups: "agency-groups-v1" };

// Table VTA : code -> personnes assignees (principal en premier)
const VTA_GROUPS = {
  "vta-zourhalm":       ["Abdellah Cheikh", "Djany Legrand", "Victor Moize"],
  "vta-rgrasset":       ["Pablo Grasset", "Omar Mbengue", "Yannis Aboulfatah"],
  "vta-aballuteaud":    ["Sandra Pereira", "Melodie Mendousse"],
  "vta-hnouar":         ["Abdel Nouar", "Hamid Atroune"],
  "vta-yhabbouba":      ["Ouissem Ouirini", "Ali Atf"],
  "vta-aeljazouli":     ["Adam El Jazouli", "Cheick Ouedraogo"],
  "vta-dmagne":         ["Stephane Legrand", "Titouan Salaun", "Momed Ali"],
  "vta-bziegler":       ["William Goujon", "Come Audonnet"],
  "vta-bdjaballah":     ["Lyna Belkessa", "Nora Wahid", "Mohamed Mehdi Larech"],
  "vta-lwojciechowski": ["Leo Merde", "Ronan Kombo", "Paul Geriltault"],
};

// Resolution VTA : code + planning du jour -> nom du commercial
function resolveVTA(vtaCode, date, dailyPlan, team) {
  if (!vtaCode || !vtaCode.startsWith("vta-")) return null;
  var group = VTA_GROUPS[vtaCode];
  if (!group) return vtaCode;
  if (dailyPlan) {
    var planDay = dailyPlan[date] || dailyPlan;
    var presentIds = [];
    Object.values(planDay).forEach(function(car) {
      if (car && car.members) presentIds = presentIds.concat(car.members);
    });
    var presentNames = presentIds.map(function(id) {
      var m = team.find(function(t) { return t.id === id; });
      return m ? m.name : null;
    }).filter(Boolean);
    var inGroup = group.filter(function(name) { return presentNames.indexOf(name) >= 0; });
    if (inGroup.length === 1) return inGroup[0];
    if (inGroup.length > 1) return { ambiguous: true, candidates: inGroup, vtaCode: vtaCode };
  }
  return group[0];
}

// Détection des contrats ambigus à partir du planning du jour
function getPendingResolutions(contracts, team, dailyPlan, cars) {
  var today = new Date().toISOString().split("T")[0];

  // Construire la map membre → communes travaillées
  var memberCommunes = {}; // memberId → Set<string lowercase>
  cars.forEach(function(car) {
    var plan = dailyPlan && dailyPlan[car.id];
    if (!plan) return;
    var mc = plan.memberCommunes || {};
    Object.keys(mc).forEach(function(mid) {
      var commune = (mc[mid] || '').trim().toLowerCase();
      if (!commune) return;
      var id = parseInt(mid);
      if (!memberCommunes[id]) memberCommunes[id] = new Set();
      memberCommunes[id].add(commune);
    });
  });
  var presentIds = new Set(Object.keys(memberCommunes).map(Number));

  // Codes prêtés : lentMap[code] = { lender, borrower }
  var lentMap = {};
  team.forEach(function(m) {
    (m.lentCodes || []).forEach(function(lc) {
      var borrower = team.find(function(t) { return t.id === lc.borrowerId; });
      if (borrower) lentMap[lc.code] = { lender: m, borrower: borrower };
    });
  });

  var pending = [];
  var todayC = contracts.filter(function(c) { return c.date === today; });

  function communeMatch(memberId, ville) {
    if (!ville) return false;
    var communes = memberCommunes[memberId] || new Set();
    var v = ville.trim().toLowerCase();
    // Match exact ou si l'un contient l'autre (ex: "GENAS" dans "GENAS cedex")
    for (var c of communes) { if (c === v || c.indexOf(v) >= 0 || v.indexOf(c) >= 0) return true; }
    return false;
  }

  todayC.forEach(function(contract) {
    var ville = (contract.ville || '').trim();

    // ── VST prêté ──────────────────────────────────────────────────────────────
    if (contract.vstLogin && lentMap[contract.vstLogin]) {
      var lent = lentMap[contract.vstLogin];
      var lenderP = presentIds.has(lent.lender.id);
      var borrowerP = presentIds.has(lent.borrower.id);

      if (!lenderP && !borrowerP) return; // aucun présent → skip

      if (lenderP && !borrowerP) {
        // Seul le prêteur → contrat déjà correct, trace seulement
        pending.push({ type: 'auto', contract: contract, autoTo: lent.lender, candidates: [lent.lender, lent.borrower], reason: lent.borrower.name + ' absent' });
        return;
      }
      if (!lenderP && borrowerP) {
        // Seul l'emprunteur → auto-attribuer
        pending.push({ type: 'auto', contract: contract, autoTo: lent.borrower, candidates: [lent.lender, lent.borrower], reason: lent.lender.name + ' absent' });
        return;
      }
      // Les deux présents → comparer les communes
      var lenderMatch = communeMatch(lent.lender.id, ville);
      var borrowerMatch = communeMatch(lent.borrower.id, ville);
      if (lenderMatch && !borrowerMatch) return; // clairement le prêteur
      if (borrowerMatch && !lenderMatch) {
        pending.push({ type: 'auto', contract: contract, autoTo: lent.borrower, candidates: [lent.lender, lent.borrower], reason: 'commune ' + ville });
        return;
      }
      // Même commune ou pas de données → confirmation manuelle
      pending.push({ type: 'manual', contract: contract, candidates: [lent.lender, lent.borrower], reason: 'même commune' });
    }

    // ── VTA non résolu ─────────────────────────────────────────────────────────
    if (contract.vtaCode && !contract.vtaResolved) {
      var group = VTA_GROUPS[contract.vtaCode];
      if (!group || group.length <= 1) return;

      var candidates = group.map(function(name) { return team.find(function(m) { return m.name === name; }); })
        .filter(Boolean).filter(function(m) { return presentIds.has(m.id); });
      if (candidates.length === 0) return;
      if (candidates.length === 1) {
        pending.push({ type: 'auto', contract: contract, autoTo: candidates[0], candidates: candidates, reason: 'seul présent' });
        return;
      }
      var inVille = ville ? candidates.filter(function(m) { return communeMatch(m.id, ville); }) : [];
      if (inVille.length === 1) {
        pending.push({ type: 'auto', contract: contract, autoTo: inVille[0], candidates: candidates, reason: 'commune ' + ville });
      } else {
        pending.push({ type: 'manual', contract: contract, candidates: inVille.length > 1 ? inVille : candidates, reason: inVille.length > 1 ? 'même commune' : 'commune inconnue' });
      }
    }
  });

  return pending;
}

const store = {
get: async function(key) { try { var snap = await getDoc(doc(db, "agency", key)); return snap.exists() ? snap.data().data : null; } catch(e) { return null; } },
set: async function(key, val) { try { await setDoc(doc(db, "agency", key), { data: val }); } catch(e) { console.error(e); } },
delete: async function(key) { try { await deleteDoc(doc(db, "agency", key)); } catch(e) {} },
};

const ROLES = ["Manager", "Assistant Manager", "Formateur", "Confirme", "Debutant"];
const ROLE_LABELS = { Manager: "Manager", "Assistant Manager": "Assist. Manager", Formateur: "Formateur", Confirme: "Confirme", Debutant: "Debutant" };
const ROLE_COLORS = { Manager: "#FF9F0A", "Assistant Manager": "#D4740E", Formateur: "#0071E3", Confirme: "#34C759", Debutant: "#AEAEB2" };
const OPERATORS = ["Bouygues", "Free"];
const OP_COLORS = { Bouygues: "#003DA5", Free: "#CD1E25" };

const JACHERE = {
"NANTES 44": { dept: "44", communes: [
{ v: "VERTOU", p: 11282, z: "S", c: 41 }, { v: "VALLET", p: 4250, z: "H", c: 29 }, { v: "MACHECOUL SAINT MEME", p: 3733, z: "H", c: 28 }, { v: "SAINT PHILBERT DE GRAND LIEU", p: 3575, z: "S", c: 13 }, { v: "CLISSON", p: 3506, z: "H", c: 14 }, { v: "LOROUX BOTTEREAU", p: 3336, z: "S", c: 12 }, { v: "SAINT JULIEN DE CONCELLES", p: 3046, z: "S", c: 7 }, { v: "DIVATTE SUR LOIRE", p: 2971, z: "S", c: 8 }, { v: "SAINT ETIENNE DE MONTLUC", p: 2965, z: "S", c: 18 }, { v: "CHEVROLIERE", p: 2861, z: "H", c: 24 }, { v: "SAINTE PAZANNE", p: 2770, z: "S", c: 12 }, { v: "PONT SAINT MARTIN", p: 2735, z: "H", c: 12 }, { v: "HAUTE GOULAINE", p: 2409, z: "S", c: 22 }, { v: "LEGE", p: 2238, z: "H", c: 18 }, { v: "GORGES", p: 1957, z: "H", c: 7 }, { v: "VIEILLEVIGNE", p: 1861, z: "H", c: 9 }, { v: "HAIE FOUASSIERE", p: 1815, z: "S", c: 7 }, { v: "GETIGNE", p: 1632, z: "H", c: 4 }, { v: "SAINT AIGNAN GRANDLIEU", p: 1615, z: "S", c: 9 }, { v: "BIGNON", p: 1541, z: "H", c: 5 }, { v: "AIGREFEUILLE SUR MAINE", p: 1464, z: "S", c: 6 }, { v: "CORDEMAIS", p: 1442, z: "S", c: 3 }, { v: "MONTBERT", p: 1394, z: "H", c: 13 }, { v: "GENESTON", p: 1353, z: "S", c: 3 }, { v: "PALLET", p: 1332, z: "S", c: 3 }, { v: "CORCOUE SUR LOGNE", p: 1295, z: "H", c: 17 }, { v: "LANDREAU", p: 1264, z: "H", c: 4 }, { v: "MOUZILLON", p: 1249, z: "H", c: 5 }, { v: "CHAPELLE HEULIN", p: 1220, z: "S", c: 10 }, { v: "SAINT COLOMBAN", p: 1217, z: "S", c: 3 }, { v: "BOUSSAY", p: 1209, z: "H", c: 5 }, { v: "CHATEAU THEBAUD", p: 1208, z: "S", c: 4 }, { v: "PLANCHE", p: 1190, z: "H", c: 6 }, { v: "MAISDON SUR SEVRE", p: 1104, z: "S", c: 7 }, { v: "SAINT MARS DE COUTAIS", p: 1033, z: "S", c: 5 }, { v: "SAINT LUMINE DE COUTAIS", p: 989, z: "H", c: 13 }, { v: "LIMOUZINIERE", p: 934, z: "H", c: 7 }, { v: "MONNIERES", p: 923, z: "S", c: 1 }, { v: "ROUANS", p: 919, z: "S", c: 8 }, { v: "SAINT HILAIRE DE CLISSON", p: 914, z: "S", c: 4 }, { v: "SAINT LUMINE DE CLISSON", p: 823, z: "H", c: 2 }, { v: "TOUVOIS", p: 815, z: "H", c: 14 }, { v: "REMOUILLE", p: 753, z: "H", c: 7 }, { v: "PAULX", p: 749, z: "S", c: 3 }, { v: "SAINT ETIENNE DE MER MORTE", p: 690, z: "H", c: 5 }, { v: "REGRIPPIERE", p: 688, z: "H", c: 2 }, { v: "TEMPLE DE BRETAGNE", p: 676, z: "S", c: 4 }, { v: "MARNE", p: 636, z: "S", c: 5 }, { v: "REMAUDIERE", p: 482, z: "H", c: 7 }, { v: "SAINT FIACRE SUR MAINE", p: 481, z: "S", c: 5 }, { v: "BOISSIERE DU DORE", p: 428, z: "H", c: 4 }, { v: "VUE", p: 298, z: "H", c: 6 }, { v: "PORT SAINT PERE", p: 159, z: "S", c: 1 }
]},
"ST NAZAIRE 44": { dept: "44", communes: [
{ v: "SAINT NAZAIRE", p: 38930, z: "S", c: 315 }, { v: "BAULE ESCOUBLAC", p: 22865, z: "H", c: 8 }, { v: "PORNIC", p: 14126, z: "H", c: 20 }, { v: "PORNICHET", p: 11866, z: "H", c: 7 }, { v: "SAINT BREVIN LES PINS", p: 10348, z: "H", c: 13 }, { v: "GUERANDE", p: 9138, z: "H", c: 27 }, { v: "SAINT MICHEL CHEF CHEF", p: 5788, z: "H", c: 11 }, { v: "PONTCHATEAU", p: 5696, z: "H", c: 34 }, { v: "POULIGUEN", p: 5481, z: "H", c: 10 }, { v: "CROISIC", p: 5005, z: "H", c: 16 }, { v: "TURBALLE", p: 4499, z: "H", c: 7 }, { v: "PLAINE SUR MER", p: 4274, z: "H", c: 4 }, { v: "SAVENAY", p: 4027, z: "S", c: 20 }, { v: "TRIGNAC", p: 3696, z: "S", c: 15 }, { v: "BERNERIE EN RETZ", p: 3610, z: "H", c: 6 }, { v: "BATZ SUR MER", p: 3599, z: "H", c: 0 }, { v: "DONGES", p: 3546, z: "H", c: 22 }, { v: "CHAUMES EN RETZ", p: 3541, z: "H", c: 4 }, { v: "PIRIAC SUR MER", p: 3407, z: "H", c: 0 }, { v: "HERBIGNAC", p: 3371, z: "H", c: 10 }, { v: "MONTOIR DE BRETAGNE", p: 3351, z: "H", c: 11 }, { v: "MESQUER", p: 2817, z: "H", c: 4 }, { v: "SAINT ANDRE DES EAUX", p: 2669, z: "H", c: 8 }, { v: "VILLENEUVE EN RETZ", p: 2491, z: "H", c: 4 }, { v: "SAINT PERE EN RETZ", p: 2379, z: "H", c: 6 }, { v: "MISSILLAC", p: 2322, z: "H", c: 8 }, { v: "PREFAILLES", p: 2160, z: "H", c: 2 }, { v: "SAINT JOACHIM", p: 2048, z: "H", c: 23 }, { v: "SAINT LYPHARD", p: 2024, z: "H", c: 4 }, { v: "CAMPBON", p: 1869, z: "H", c: 10 }, { v: "GUENROUET", p: 1778, z: "H", c: 10 }, { v: "MOUTIERS EN RETZ", p: 1662, z: "H", c: 2 }, { v: "FROSSAY", p: 1536, z: "H", c: 8 }, { v: "CHAUVE", p: 1468, z: "H", c: 7 }, { v: "PRINQUIAU", p: 1462, z: "S", c: 4 }, { v: "ASSERAC", p: 1461, z: "H", c: 5 }, { v: "MALVILLE", p: 1456, z: "S", c: 5 }, { v: "PAIMBOEUF", p: 1445, z: "H", c: 14 }, { v: "SAINTE ANNE SUR BRIVET", p: 1387, z: "H", c: 4 }, { v: "SAINT GILDAS DES BOIS", p: 1327, z: "H", c: 9 }, { v: "SAINT MOLF", p: 1314, z: "H", c: 13 }, { v: "SAINT MALO DE GUERSAC", p: 1304, z: "H", c: 9 }, { v: "SAINT VIAUD", p: 1298, z: "H", c: 8 }, { v: "CROSSAC", p: 1241, z: "H", c: 12 }, { v: "CHAPELLE LAUNAY", p: 1212, z: "H", c: 3 }, { v: "SAINT HILAIRE DE CHALEONS", p: 1201, z: "H", c: 4 }, { v: "CORSEPT", p: 1150, z: "H", c: 3 }, { v: "DREFFEAC", p: 1048, z: "H", c: 8 }, { v: "SAINTE REINE DE BRETAGNE", p: 1014, z: "H", c: 4 }, { v: "SEVERAC", p: 906, z: "H", c: 3 }, { v: "QUILLY", p: 658, z: "H", c: 2 }, { v: "BOUEE", p: 447, z: "H", c: 4 }, { v: "LAVAU SUR LOIRE", p: 381, z: "H", c: 7 }
]},
"RENNES 35": { dept: "35", communes: [
{ v: "CESSON SEVIGNE", p: 11701, z: "H", c: 57 }, { v: "BRUZ", p: 10477, z: "H", c: 80 }, { v: "BETTON", p: 5443, z: "S", c: 7 }, { v: "SAINT GREGOIRE", p: 5292, z: "H", c: 31 }, { v: "PACE", p: 5287, z: "H", c: 10 }, { v: "CHARTRES DE BRETAGNE", p: 5149, z: "H", c: 30 }, { v: "NOYAL CHATILLON SUR SEICHE", p: 4694, z: "H", c: 61 }, { v: "VERN SUR SEICHE", p: 4358, z: "S", c: 6 }, { v: "RHEU", p: 4357, z: "H", c: 14 }, { v: "MORDELLES", p: 4262, z: "H", c: 13 }, { v: "LIFFRE", p: 4247, z: "H", c: 17 }, { v: "CHATEAUGIRON", p: 3463, z: "H", c: 17 }, { v: "MELESSE", p: 3431, z: "H", c: 24 }, { v: "MONTFORT SUR MEU", p: 2941, z: "S", c: 3 }, { v: "ORGERES", p: 2861, z: "H", c: 26 }, { v: "BREAL SOUS MONTFORT", p: 2676, z: "S", c: 13 }, { v: "BREAL SOUS MONTFORT", p: 2677, z: "S", c: 0 }, { v: "BREAL SOUS MONTFORT", p: 2678, z: "S", c: 0 }, { v: "BREAL SOUS MONTFORT", p: 2679, z: "S", c: 0 }, { v: "BREAL SOUS MONTFORT", p: 2680, z: "S", c: 0 }, { v: "CHAPELLE DES FOUGERETZ", p: 2258, z: "H", c: 20 }, { v: "MEZIERE", p: 2218, z: "H", c: 11 }, { v: "HERMITAGE", p: 2161, z: "H", c: 24 }, { v: "BOURGBARRE", p: 2159, z: "S", c: 9 }, { v: "BOUEXIERE", p: 2088, z: "H", c: 9 }, { v: "PONT PEAN", p: 2053, z: "H", c: 26 }, { v: "NOUVOITOU", p: 1929, z: "H", c: 2 }, { v: "CORPS NUDS", p: 1823, z: "H", c: 8 }, { v: "MONTGERMONT", p: 1794, z: "H", c: 26 }, { v: "SAINT ERBLON", p: 1772, z: "H", c: 0 }, { v: "MONTAUBAN DE BRETAGNE", p: 1770, z: "H", c: 0 }, { v: "ROMILLE", p: 1745, z: "H", c: 11 }, { v: "SAINT AUBIN DU CORMIER", p: 1701, z: "H", c: 0 }, { v: "IFFENDIC", p: 1624, z: "H", c: 0 }, { v: "DOMLOUP", p: 1430, z: "H", c: 5 }, { v: "PLEUMELEUC", p: 1373, z: "H", c: 0 }, { v: "SAINT ARMEL", p: 1341, z: "H", c: 14 }, { v: "CINTRE", p: 1303, z: "H", c: 0 }, { v: "CHAPELLE THOUARAULT", p: 979, z: "S", c: 0 }, { v: "CHEVAIGNE", p: 959, z: "H", c: 0 }, { v: "GOSNE", p: 923, z: "H", c: 0 }, { v: "GAEL", p: 906, z: "H", c: 0 }, { v: "GUIPEL", p: 833, z: "H", c: 1 }, { v: "SERVON SUR VILAINE", p: 831, z: "S", c: 0 }, { v: "ERCE PRES LIFFRE", p: 774, z: "H", c: 0 }, { v: "VERGER", p: 767, z: "H", c: 0 }, { v: "LIVRE SUR CHANGEON", p: 739, z: "H", c: 0 }, { v: "SAINT THURIAL", p: 621, z: "H", c: 0 }, { v: "QUEDILLAC", p: 620, z: "H", c: 0 }, { v: "NOYAL SUR VILAINE", p: 615, z: "H", c: 0 }, { v: "MONTREUIL SUR ILLE", p: 596, z: "H", c: 0 }, { v: "CHAPELLE CHAUSSEE", p: 550, z: "H", c: 0 }, { v: "VIEUX VY SUR COUESNON", p: 535, z: "H", c: 0 }, { v: "SAINT ONEN LA CHAPELLE", p: 487, z: "H", c: 0 }, { v: "MUEL", p: 484, z: "H", c: 0 }, { v: "DOURDAIN", p: 473, z: "S", c: 0 }, { v: "PAIMPONT", p: 461, z: "H", c: 0 }, { v: "FEINS", p: 445, z: "H", c: 0 }, { v: "SAINT PERN", p: 432, z: "H", c: 0 }, { v: "LANGAN", p: 407, z: "S", c: 0 }, { v: "BEDEE", p: 407, z: "H", c: 0 }, { v: "BECHEREL", p: 406, z: "H", c: 0 }, { v: "ANDOUILLE NEUVILLE", p: 391, z: "H", c: 0 }, { v: "CLAYES", p: 361, z: "H", c: 0 }, { v: "SAINT MALON SUR MEL", p: 341, z: "H", c: 0 }, { v: "PLELAN LE GRAND", p: 333, z: "H", c: 0 }, { v: "SAINT SYMPHORIEN", p: 306, z: "H", c: 0 }, { v: "LANGOUET", p: 262, z: "H", c: 0 }, { v: "MINIAC SOUS BECHEREL", p: 246, z: "H", c: 0 }, { v: "SAINT MAUGAN", p: 245, z: "H", c: 0 }, { v: "SAINT GONDRAN", p: 245, z: "H", c: 0 }, { v: "SAINT MEEN LE GRAND", p: 238, z: "H", c: 0 }, { v: "MAXENT", p: 222, z: "H", c: 0 }, { v: "SAINT UNIAC", p: 215, z: "S", c: 0 }, { v: "SENS DE BRETAGNE", p: 212, z: "H", c: 0 }, { v: "SAINT GONLAY", p: 205, z: "H", c: 0 }, { v: "LANDUJAN", p: 184, z: "H", c: 0 }, { v: "PIRE CHANCE", p: 164, z: "H", c: 0 }, { v: "AUBIGNE", p: 162, z: "H", c: 0 }, { v: "MEDREAC", p: 153, z: "H", c: 0 }, { v: "GAHARD", p: 153, z: "H", c: 0 }, { v: "TREFFENDEL", p: 116, z: "H", c: 0 }, { v: "TALENSAC", p: 105, z: "H", c: 0 }, { v: "NOUAYE", p: 102, z: "H", c: 0 }, { v: "BOISGERVILLY", p: 92, z: "H", c: 0 }, { v: "CHAPELLE DU LOU DU LAC", p: 66, z: "H", c: 0 }, { v: "MOUAZE", p: 65, z: "S", c: 0 }, { v: "BRETEIL", p: 64, z: "H", c: 0 }, { v: "BLERUAIS", p: 52, z: "H", c: 0 }, { v: "SAINT MEDARD SUR ILLE", p: 44, z: "H", c: 0 }, { v: "CHASNE SUR ILLET", p: 44, z: "S", c: 0 }
]},
"FONTENAY 85": { dept: "85", communes: [
{ v: "FONTENAY LE COMTE", p: 8586, z: "H", c: 81 }, { v: "LUCON", p: 6089, z: "H", c: 98 }, { v: "POUZAUGES", p: 3188, z: "H", c: 23 }, { v: "SEVREMONT", p: 3093, z: "H", c: 29 }, { v: "BENET", p: 2094, z: "H", c: 9 }, { v: "SAINTE HERMINE", p: 1958, z: "H", c: 24 }, { v: "CHATAIGNERAIE", p: 1684, z: "H", c: 28 }, { v: "SAINT MICHEL EN L HERM", p: 1649, z: "H", c: 17 }, { v: "BOUPERE", p: 1595, z: "H", c: 10 }, { v: "MAREUIL SUR LAY DISSAIS", p: 1475, z: "H", c: 18 }, { v: "TERVAL", p: 1206, z: "H", c: 7 }, { v: "NALLIERS", p: 1162, z: "H", c: 13 }, { v: "RIVES D AUTISE", p: 1094, z: "H", c: 2 }, { v: "SAINT HILAIRE DES LOGES", p: 1066, z: "H", c: 12 }, { v: "SAINTE GEMME LA PLAINE", p: 1001, z: "H", c: 7 }, { v: "MOUILLERON SAINT GERMAIN", p: 997, z: "H", c: 9 }, { v: "CHAILLE LES MARAIS", p: 954, z: "H", c: 2 }, { v: "VIX", p: 910, z: "H", c: 12 }, { v: "CHAMPAGNE LES MARAIS", p: 868, z: "H", c: 7 }, { v: "SAINT MESMIN", p: 863, z: "H", c: 10 }, { v: "DOIX LES FONTAINES", p: 848, z: "H", c: 0 }, { v: "MONTOURNAIS", p: 836, z: "H", c: 4 }, { v: "ILE D ELLE", p: 823, z: "H", c: 5 }, { v: "GRUES", p: 816, z: "H", c: 6 }, { v: "SAINT PIERRE DU CHEMIN", p: 808, z: "H", c: 10 }, { v: "RIVES DU FOUGERAIS", p: 787, z: "H", c: 6 }, { v: "MAGNILS REIGNIERS", p: 774, z: "H", c: 5 }, { v: "MEILLERAIE TILLAY", p: 772, z: "H", c: 5 }, { v: "VELLUIRE SUR VENDEE", p: 748, z: "H", c: 8 }, { v: "CHATEAU GUIBERT", p: 741, z: "H", c: 3 }, { v: "MERVENT", p: 723, z: "H", c: 6 }, { v: "FOUSSAIS PAYRE", p: 708, z: "H", c: 6 }, { v: "TRIAIZE", p: 679, z: "H", c: 6 }, { v: "BAZOGES EN PAREDS", p: 672, z: "H", c: 3 }, { v: "VOUVANT", p: 672, z: "H", c: 7 }, { v: "CAILLERE SAINT HILAIRE", p: 667, z: "H", c: 2 }, { v: "MAILLEZAIS", p: 667, z: "H", c: 4 }, { v: "PISSOTTE", p: 609, z: "H", c: 5 }, { v: "LONGEVES", p: 593, z: "H", c: 1 }, { v: "REORTHE", p: 573, z: "H", c: 0 }, { v: "MOUZEUIL SAINT MARTIN", p: 567, z: "H", c: 3 }, { v: "SERIGNE", p: 564, z: "H", c: 1 }, { v: "CHEFFOIS", p: 561, z: "H", c: 4 }, { v: "ANTIGNY", p: 559, z: "H", c: 4 }, { v: "AUCHAY SUR VENDEE", p: 557, z: "H", c: 0 }, { v: "SAINT MICHEL LE CLOUCQ", p: 541, z: "H", c: 3 }, { v: "LANGON", p: 541, z: "H", c: 5 }, { v: "DAMVIX", p: 537, z: "H", c: 7 }, { v: "MONSIREIGNE", p: 521, z: "H", c: 2 }, { v: "SAINTE RADEGONDE DES NOYERS", p: 496, z: "H", c: 5 }, { v: "HERMENAULT", p: 486, z: "H", c: 6 }, { v: "CORPE", p: 480, z: "H", c: 7 }, { v: "REAUMUR", p: 454, z: "H", c: 2 }, { v: "MAILLE", p: 454, z: "H", c: 7 }, { v: "MOUTIERS SUR LE LAY", p: 450, z: "H", c: 5 }, { v: "VOUILLE LES MARAIS", p: 447, z: "H", c: 5 }, { v: "SAINT HILAIRE DE VOUST", p: 437, z: "H", c: 2 }, { v: "SAINT PIERRE LE VIEUX", p: 435, z: "H", c: 1 }, { v: "CHASNAIS", p: 424, z: "H", c: 2 }, { v: "CHAVAGNES LES REDOUX", p: 417, z: "H", c: 4 }, { v: "LAIROUX", p: 414, z: "H", c: 4 }, { v: "SAINT JEAN DE BEUGNE", p: 405, z: "H", c: 6 }, { v: "MONTREUIL", p: 394, z: "H", c: 1 }, { v: "SAINT MAURICE DES NOUES", p: 382, z: "H", c: 2 }, { v: "SAINT MARTIN DE FRAIGNEAU", p: 381, z: "H", c: 7 }, { v: "BOURNEAU", p: 378, z: "H", c: 8 }, { v: "BRETONNIERE LA CLAYE", p: 360, z: "H", c: 3 }, { v: "JAUDONNIERE", p: 355, z: "H", c: 2 }, { v: "MENOMBLET", p: 354, z: "H", c: 4 }, { v: "ORBRIE", p: 348, z: "H", c: 0 }, { v: "XANTON CHASSENON", p: 342, z: "H", c: 5 }, { v: "ROSNAY", p: 335, z: "H", c: 0 }, { v: "SAINT MAURICE LE GIRARD", p: 333, z: "H", c: 0 }, { v: "SAINT DENIS DU PAYRE", p: 317, z: "H", c: 3 }, { v: "PEAULT", p: 312, z: "H", c: 5 }, { v: "MAZEAU", p: 304, z: "H", c: 2 }, { v: "SAINT CYR DES GATS", p: 303, z: "H", c: 0 }, { v: "PINEAUX", p: 302, z: "H", c: 1 }, { v: "THIRE", p: 301, z: "H", c: 4 }, { v: "GUE DE VELLUIRE", p: 298, z: "H", c: 4 }, { v: "POUILLE", p: 293, z: "H", c: 1 }, { v: "SAINT VALERIEN", p: 291, z: "H", c: 2 }, { v: "BOUILLE COURDAULT", p: 291, z: "H", c: 3 }, { v: "SAINT MARTIN LARS EN SAINTE HERMINE", p: 288, z: "H", c: 1 }, { v: "SAINT ETIENNE DE BRILLOUET", p: 288, z: "H", c: 4 }, { v: "PETOSSE", p: 286, z: "S", c: 1 }, { v: "SAINT JUIRE CHAMPGILLON", p: 284, z: "H", c: 0 }, { v: "TAILLEE", p: 283, z: "H", c: 5 }, { v: "PUYRAVAULT", p: 281, z: "H", c: 5 }, { v: "SAINT AUBIN LA PLAINE", p: 279, z: "H", c: 3 }, { v: "MARSAIS SAINTE RADEGONDE", p: 274, z: "H", c: 2 }, { v: "CHAPELLE THEMER", p: 272, z: "H", c: 3 }, { v: "PUY DE SERRE", p: 236, z: "H", c: 0 }, { v: "SAINT LAURENT DE LA SALLE", p: 233, z: "H", c: 0 }, { v: "SAINT SIGISMOND", p: 232, z: "H", c: 5 }, { v: "TALLUD SAINTE GEMME", p: 229, z: "H", c: 4 }, { v: "BESSAY", p: 209, z: "H", c: 4 }, { v: "MOREILLES", p: 192, z: "H", c: 4 }, { v: "LOGE FOUGEREUSE", p: 182, z: "H", c: 5 }, { v: "LIEZ", p: 162, z: "H", c: 3 }, { v: "FAYMOREAU", p: 159, z: "H", c: 8 }, { v: "SAINTE PEXINE", p: 151, z: "H", c: 4 }, { v: "COUTURE", p: 112, z: "H", c: 0 }, { v: "SAINT MARTIN DES FONTAINES", p: 101, z: "H", c: 0 }, { v: "MARILLET", p: 88, z: "H", c: 0 }
]},
"ROCHE SUR YON 85": { dept: "85", communes: [
{ v: "ROCHE SUR YON", p: 30092, z: "H", c: 382 }, { v: "MONTAIGU VENDEE", p: 9492, z: "H", c: 54 }, { v: "HERBIERS", p: 8901, z: "H", c: 46 }, { v: "AIZENAY", p: 4514, z: "S", c: 9 }, { v: "CHANTONNAY", p: 4240, z: "H", c: 28 }, { v: "POIRE SUR VIE", p: 3972, z: "H", c: 4 }, { v: "MORTAGNE SUR SEVRE", p: 3052, z: "S", c: 26 }, { v: "ESSARTS EN BOCAGE", p: 3031, z: "H", c: 19 }, { v: "AUBIGNY LES CLOUZEAUX", p: 2649, z: "H", c: 19 }, { v: "CHANVERRIE", p: 2568, z: "H", c: 15 }, { v: "BELLEVIGNY", p: 2515, z: "H", c: 14 }, { v: "MOUILLERON LE CAPTIF", p: 2351, z: "H", c: 2 }, { v: "FERRIERE", p: 2335, z: "H", c: 14 }, { v: "CUGAND", p: 2307, z: "H", c: 5 }, { v: "RIVES DE L YON", p: 2048, z: "H", c: 10 }, { v: "DOMPIERRE SUR YON", p: 1799, z: "H", c: 11 }, { v: "BRUFFIERE", p: 1732, z: "H", c: 15 }, { v: "SAINT FULGENT", p: 1727, z: "H", c: 14 }, { v: "VENANSAULT", p: 1662, z: "S", c: 1 }, { v: "CHAIZE LE VICOMTE", p: 1653, z: "H", c: 9 }, { v: "BOURNEZEAU", p: 1628, z: "H", c: 8 }, { v: "CHAVAGNES EN PAILLERS", p: 1561, z: "H", c: 7 }, { v: "LUCS SUR BOULOGNE", p: 1560, z: "H", c: 13 }, { v: "MONTREVERD", p: 1554, z: "H", c: 13 }, { v: "SAINT PHILBERT DE BOUAINE", p: 1456, z: "S", c: 3 }, { v: "SAINT LAURENT SUR SEVRE", p: 1440, z: "S", c: 4 }, { v: "GAUBRETIERE", p: 1427, z: "H", c: 11 }, { v: "HERBERGEMENT", p: 1374, z: "H", c: 13 }, { v: "ROCHESERVIERE", p: 1373, z: "S", c: 0 }, { v: "NESMY", p: 1370, z: "H", c: 16 }, { v: "MOUCHAMPS", p: 1368, z: "H", c: 3 }, { v: "TREIZE SEPTIERS", p: 1333, z: "H", c: 12 }, { v: "EPESSES", p: 1319, z: "H", c: 6 }, { v: "BROUZILS", p: 1180, z: "H", c: 2 }, { v: "CHAUCHE", p: 1161, z: "H", c: 9 }, { v: "LANDES GENUSSON", p: 1092, z: "H", c: 19 }, { v: "SAINT MARTIN DES NOYERS", p: 1089, z: "H", c: 9 }, { v: "SAINT DENIS LA CHEVASSE", p: 1076, z: "H", c: 4 }, { v: "BOISSIERE DE MONTAIGU", p: 1053, z: "H", c: 12 }, { v: "APREMONT", p: 979, z: "H", c: 3 }, { v: "LANDERONDE", p: 959, z: "H", c: 0 }, { v: "BEAUREPAIRE", p: 951, z: "H", c: 0 }, { v: "SAINT ETIENNE DU BOIS", p: 947, z: "S", c: 3 }, { v: "SAINT ANDRE GOULE D OIE", p: 800, z: "H", c: 0 }, { v: "BERNARDIERE", p: 772, z: "H", c: 1 }, { v: "SAINT GERMAIN DE PRINCAY", p: 768, z: "H", c: 2 }, { v: "SAINT PROUANT", p: 767, z: "H", c: 2 }, { v: "FALLERON", p: 752, z: "H", c: 0 }, { v: "SAINTE CECILE", p: 747, z: "H", c: 0 }, { v: "TIFFAUGES", p: 744, z: "H", c: 6 }, { v: "VENDRENNES", p: 737, z: "H", c: 0 }, { v: "GENETOUZE", p: 737, z: "S", c: 0 }, { v: "MACHE", p: 714, z: "H", c: 5 }, { v: "SAINT AUBIN DES ORMEAUX", p: 666, z: "H", c: 4 }, { v: "BAZOGES EN PAILLERS", p: 660, z: "H", c: 0 }, { v: "THORIGNY", p: 652, z: "H", c: 4 }, { v: "MESNARD LA BAROTIERE", p: 648, z: "H", c: 3 }, { v: "SAINT MALO DU BOIS", p: 641, z: "H", c: 4 }, { v: "BEAUFOU", p: 632, z: "H", c: 0 }, { v: "SAINT PAUL EN PAREDS", p: 612, z: "H", c: 0 }, { v: "TREIZE VENTS", p: 586, z: "H", c: 9 }, { v: "PALLUAU", p: 573, z: "H", c: 4 }, { v: "FOUGERE", p: 544, z: "H", c: 0 }, { v: "ROCHETREJOUX", p: 516, z: "H", c: 0 }, { v: "SAINT HILAIRE LE VOUHIS", p: 504, z: "H", c: 10 }, { v: "SAINT MARTIN DES TILLEULS", p: 504, z: "H", c: 9 }, { v: "COPECHAGNIERE", p: 476, z: "H", c: 5 }, { v: "SIGOURNAIS", p: 452, z: "H", c: 2 }, { v: "CHAPELLE PALLUAU", p: 446, z: "S", c: 2 }, { v: "RABATELIERE", p: 428, z: "H", c: 7 }, { v: "MERLATIERE", p: 420, z: "H", c: 1 }, { v: "SAINT MARS LA REORTHE", p: 417, z: "S", c: 7 }, { v: "SAINT PAUL MONT PENIT", p: 408, z: "H", c: 0 }, { v: "SAINT VINCENT STERLANGES", p: 351, z: "H", c: 10 }, { v: "GRAND LANDES", p: 337, z: "H", c: 3 }, { v: "TABLIER", p: 224, z: "H", c: 2 }, { v: "MALLIEVRE", p: 154, z: "H", c: 3 }
]},
"SABLES OLONNE 85": { dept: "85", communes: [
{ v: "SABLES D OLONNE", p: 41454, z: "H", c: 200 }, { v: "SAINT HILAIRE DE RIEZ", p: 16759, z: "H", c: 25 }, { v: "SAINT JEAN DE MONTS", p: 14392, z: "H", c: 10 }, { v: "CHALLANS", p: 13373, z: "H", c: 105 }, { v: "SAINT GILLES CROIX DE VIE", p: 9822, z: "H", c: 36 }, { v: "BRETIGNOLLES SUR MER", p: 7640, z: "H", c: 7 }, { v: "TRANCHE SUR MER", p: 7433, z: "H", c: 1 }, { v: "NOIRMOUTIER EN L ILE", p: 7196, z: "H", c: 5 }, { v: "TALMONT SAINT HILAIRE", p: 6773, z: "H", c: 16 }, { v: "ILE D YEU", p: 6564, z: "H", c: 1 }, { v: "AIGUILLON LA PRESQU ILE", p: 4587, z: "H", c: 2 }, { v: "JARD SUR MER", p: 4539, z: "H", c: 2 }, { v: "NOTRE DAME DE MONTS", p: 3761, z: "H", c: 0 }, { v: "LONGEVILLE SUR MER", p: 3456, z: "H", c: 6 }, { v: "BARBATRE", p: 3143, z: "H", c: 0 }, { v: "GUERINIERE", p: 2776, z: "H", c: 0 }, { v: "BARRE DE MONTS", p: 2651, z: "H", c: 1 }, { v: "FENOUILLER", p: 2635, z: "H", c: 4 }, { v: "GARNACHE", p: 2557, z: "H", c: 22 }, { v: "BEAUVOIR SUR MER", p: 2484, z: "H", c: 11 }, { v: "SAINT VINCENT SUR JARD", p: 2471, z: "H", c: 0 }, { v: "SOULLANS", p: 2399, z: "H", c: 7 }, { v: "BREM SUR MER", p: 2361, z: "H", c: 0 }, { v: "ACHARDS", p: 2325, z: "H", c: 6 }, { v: "ANGLES", p: 2268, z: "S", c: 9 }, { v: "EPINE", p: 2067, z: "H", c: 0 }, { v: "COEX", p: 1925, z: "H", c: 13 }, { v: "COMMEQUIERS", p: 1922, z: "H", c: 3 }, { v: "SALLERTAINE", p: 1776, z: "H", c: 6 }, { v: "AIGUILLON SUR VIE", p: 1499, z: "H", c: 7 }, { v: "BOUIN", p: 1468, z: "H", c: 6 }, { v: "ILE D OLONNE", p: 1402, z: "H", c: 5 }, { v: "SAINT GERVAIS", p: 1360, z: "H", c: 4 }, { v: "GIVRAND", p: 1301, z: "H", c: 0 }, { v: "MOUTIERS LES MAUXFAITS", p: 1258, z: "H", c: 16 }, { v: "SAINT CHRISTOPHE DU LIGNERON", p: 1207, z: "S", c: 0 }, { v: "PERRIER", p: 1193, z: "H", c: 2 }, { v: "CHAMP SAINT PERE", p: 1166, z: "H", c: 6 }, { v: "BEAULIEU SOUS LA ROCHE", p: 1132, z: "H", c: 5 }, { v: "NIEUL LE DOLENT", p: 1119, z: "H", c: 7 }, { v: "NOTRE DAME DE RIEZ", p: 1069, z: "H", c: 3 }, { v: "SAINTE FOY", p: 1065, z: "H", c: 2 }, { v: "BOIS DE CENE", p: 1062, z: "H", c: 3 }, { v: "SAINTE FLAIVE DES LOUPS", p: 1001, z: "S", c: 4 }, { v: "SAINT JULIEN DES LANDES", p: 995, z: "H", c: 7 }, { v: "AVRILLE", p: 987, z: "H", c: 4 }, { v: "GROSBREUIL", p: 985, z: "H", c: 2 }, { v: "SAINT MATHURIN", p: 979, z: "S", c: 7 }, { v: "FROIDFOND", p: 966, z: "H", c: 9 }, { v: "SAINT REVEREND", p: 915, z: "H", c: 5 }, { v: "SAINT URBAIN", p: 862, z: "H", c: 4 }, { v: "SAINT VINCENT SUR GRAON", p: 816, z: "H", c: 3 }, { v: "LANDEVIEILLE", p: 813, z: "H", c: 0 }, { v: "VAIRE", p: 798, z: "H", c: 5 }, { v: "SAINT GEORGES DE POINTINDOUX", p: 784, z: "H", c: 10 }, { v: "BERNARD", p: 776, z: "S", c: 3 }, { v: "CHAIZE GIRAUD", p: 637, z: "H", c: 2 }, { v: "POIROUX", p: 626, z: "H", c: 3 }, { v: "BOISSIERE DES LANDES", p: 625, z: "H", c: 5 }, { v: "MARTINET", p: 608, z: "H", c: 6 }, { v: "SAINT AVAUGOURD DES LANDES", p: 558, z: "H", c: 3 }, { v: "SAINT HILAIRE LA FORET", p: 544, z: "H", c: 0 }, { v: "SAINT MAIXENT SUR VIE", p: 525, z: "H", c: 0 }, { v: "CHAPELLE HERMIER", p: 518, z: "H", c: 9 }, { v: "CHATEAUNEUF", p: 494, z: "H", c: 6 }, { v: "GIROUARD", p: 490, z: "S", c: 2 }, { v: "SAINT BENOIST SUR MER", p: 425, z: "H", c: 3 }, { v: "CURZON", p: 324, z: "H", c: 3 }, { v: "JONCHERE", p: 311, z: "S", c: 6 }, { v: "GIVRE", p: 268, z: "H", c: 2 }, { v: "SAINT CYR EN TALMONDAIS", p: 227, z: "H", c: 3 }
]},
};

const JACHERE_TALC = {
"ROYAN 17": { dept: "17", communes: [
{ v: "ROYAN", p: 20600, z: "H" }, { v: "ROCHEFORT", p: 15303, z: "H" }, { v: "SAINT GEORGES DE DIDONNE", p: 7988, z: "H" }, { v: "SAINT PIERRE D OLERON", p: 7553, z: "H" }, { v: "VAUX SUR MER", p: 6591, z: "H" }, { v: "SAINT PALAIS SUR MER", p: 6290, z: "H" }, { v: "SAINT GEORGES D OLERON", p: 6288, z: "H" }, { v: "TREMBLADE", p: 5103, z: "H" }, { v: "MATHES", p: 4753, z: "H" }, { v: "FOURAS", p: 4456, z: "H" }, { v: "DOLUS D OLERON", p: 4315, z: "H" }, { v: "TONNAY CHARENTE", p: 4223, z: "H" }, { v: "CHATEAU D OLERON", p: 3801, z: "H" }, { v: "SURGERES", p: 3657, z: "H" }, { v: "MARENNES HIERS BROUAGE", p: 3619, z: "H" }, { v: "MESCHERS SUR GIRONDE", p: 3479, z: "H" }, { v: "SAINT DENIS D OLERON", p: 3111, z: "H" }, { v: "ARVERT", p: 2328, z: "H" }, { v: "BOURCEFRANC LE CHAPUS", p: 2214, z: "H" }, { v: "AIGREFEUILLE D AUNIS", p: 2120, z: "S" }, { v: "SAINT TROJAN LES BAINS", p: 2064, z: "H" }, { v: "SAINT SULPICE DE ROYAN", p: 1876, z: "H" }, { v: "ECHILLAIS", p: 1841, z: "H" }, { v: "BREE LES BAINS", p: 1790, z: "H" }, { v: "BREUILLET", p: 1735, z: "H" }, { v: "ETAULES", p: 1602, z: "H" }, { v: "PORT DES BARQUES", p: 1444, z: "H" }, { v: "GRAND VILLAGE PLAGE", p: 1255, z: "H" }, { v: "GUA", p: 1206, z: "H" }, { v: "SAINT AGNANT", p: 1200, z: "H" }, { v: "SAINT LAURENT DE LA PREE", p: 1136, z: "H" }, { v: "SAINT JUST LUZAC", p: 1103, z: "H" }, { v: "SAINT AUGUSTIN", p: 1087, z: "H" }, { v: "THOU", p: 973, z: "H" }, { v: "SOUBISE", p: 954, z: "S" }, { v: "CHAILLEVETTE", p: 915, z: "H" }, { v: "SAINT GEORGES DU BOIS", p: 874, z: "H" }, { v: "CIRE D AUNIS", p: 707, z: "H" }, { v: "SAINT PIERRE LA NOUE", p: 701, z: "H" }, { v: "SAINT HIPPOLYTE", p: 622, z: "S" }, { v: "CABARIOT", p: 620, z: "H" }, { v: "NIEULLE SUR SEUDRE", p: 595, z: "H" }, { v: "MORNAC SUR SEUDRE", p: 586, z: "H" }, { v: "SAINT NAZAIRE SUR CHARENTE", p: 576, z: "H" }, { v: "FORGES", p: 565, z: "H" }, { v: "SAINT MARD", p: 550, z: "H" }, { v: "DEVISE", p: 539, z: "H" }, { v: "EGUILLE", p: 530, z: "H" }, { v: "VERGEROUX", p: 497, z: "H" }, { v: "MARSAIS", p: 428, z: "H" }, { v: "CHAMBON", p: 421, z: "H" }, { v: "ILE D AIX", p: 402, z: "H" }, { v: "ARDILLIERES", p: 398, z: "H" }, { v: "SAINT SATURNIN DU BOIS", p: 386, z: "H" }, { v: "GENOUILLE", p: 376, z: "H" }, { v: "BOUHET", p: 363, z: "H" }, { v: "LANDRAIS", p: 333, z: "H" }, { v: "BALLON", p: 325, z: "H" }, { v: "PUYRAVAULT", p: 321, z: "H" }, { v: "SAINT JEAN D ANGLE", p: 304, z: "H" }, { v: "SAINT PIERRE D AMILLY", p: 303, z: "H" }, { v: "BEAUGEAY", p: 294, z: "S" }, { v: "VIRSON", p: 289, z: "H" }, { v: "CHAMPAGNE", p: 286, z: "H" }, { v: "GRIPPERIE SAINT SYMPHORIEN", p: 284, z: "H" }, { v: "VOUHE", p: 282, z: "H" }, { v: "MOEZE", p: 261, z: "S" }, { v: "SAINT SORNIN", p: 250, z: "H" }, { v: "BREUIL LA REORTE", p: 218, z: "H" }, { v: "SAINT COUTANT LE GRAND", p: 197, z: "H" }, { v: "SAINT FROULT", p: 195, z: "S" }, { v: "SAINT CREPIN", p: 148, z: "H" }, { v: "ANAIS", p: 147, z: "H" }, { v: "LOIRE LES MARAIS", p: 142, z: "S" }
]},
"LA ROCHELLE 17": { dept: "17", communes: [
{ v: "ROCHELLE", p: 50364, z: "H" }, { v: "AYTRE", p: 5433, z: "H" }, { v: "CHATELAILLON PLAGE", p: 5176, z: "H" }, { v: "PERIGNY", p: 4179, z: "S" }, { v: "LAGORD", p: 3821, z: "H" }, { v: "FLOTTE", p: 3176, z: "H" }, { v: "SAINTE MARIE DE RE", p: 3059, z: "H" }, { v: "BOIS PLAGE EN RE", p: 2989, z: "H" }, { v: "DOMPIERRE SUR MER", p: 2806, z: "H" }, { v: "MARANS", p: 2440, z: "H" }, { v: "SAINT MARTIN DE RE", p: 2416, z: "H" }, { v: "COUARDE SUR MER", p: 2292, z: "H" }, { v: "SAINTE SOULLE", p: 2029, z: "H" }, { v: "PORTES EN RE", p: 2019, z: "H" }, { v: "ARS EN RE", p: 1919, z: "H" }, { v: "RIVEDOUX PLAGE", p: 1897, z: "H" }, { v: "SAINT CLEMENT DES BALEINES", p: 1450, z: "H" }, { v: "JARRIE", p: 1341, z: "S" }, { v: "SAINT JEAN DE LIVERSAY", p: 1325, z: "H" }, { v: "LOIX", p: 1144, z: "H" }, { v: "SALLES SUR MER", p: 1097, z: "S" }, { v: "ANDILLY", p: 1041, z: "S" }, { v: "COURCON", p: 1014, z: "H" }, { v: "ESNANDES", p: 1006, z: "H" }, { v: "SAINT MEDARD D AUNIS", p: 996, z: "H" }, { v: "CHARRON", p: 971, z: "H" }, { v: "VERINES", p: 892, z: "H" }, { v: "SAINT SAUVEUR D AUNIS", p: 876, z: "H" }, { v: "YVES", p: 861, z: "H" }, { v: "THAIRE", p: 832, z: "H" }, { v: "FERRIERES", p: 703, z: "S" }, { v: "SAINT OUEN D AUNIS", p: 682, z: "S" }, { v: "SAINT CHRISTOPHE", p: 675, z: "H" }, { v: "BENON", p: 672, z: "H" }, { v: "BOURGNEUF", p: 572, z: "H" }, { v: "CROIX CHAPEAU", p: 545, z: "H" }, { v: "CLAVETTE", p: 540, z: "S" }, { v: "NUAILLE D AUNIS", p: 537, z: "H" }, { v: "RONDE", p: 499, z: "H" }, { v: "ANGLIERS", p: 470, z: "S" }, { v: "GUE D ALLERE", p: 462, z: "H" }, { v: "TAUGON", p: 416, z: "H" }, { v: "LONGEVES", p: 398, z: "S" }, { v: "MONTROY", p: 341, z: "S" }, { v: "CRAM CHABAN", p: 335, z: "H" }, { v: "SAINT CYR DU DORET", p: 319, z: "H" }, { v: "GREVE SUR MIGNON", p: 244, z: "S" }, { v: "LAIGNE", p: 232, z: "H" }
]},
"BRESSUIRE 79": { dept: "79", communes: [
{ v: "BRESSUIRE", p: 9571, z: "H" }, { v: "THOUARS", p: 7683, z: "H" }, { v: "MAULEON", p: 3578, z: "H" }, { v: "NUEIL LES AUBIERS", p: 2592, z: "H" }, { v: "MONCOUTANT SUR SEVRE", p: 2409, z: "H" }, { v: "CERIZAY", p: 2242, z: "H" }, { v: "ARGENTONNAY", p: 1232, z: "H" }, { v: "LORETZ D ARGENTON", p: 1085, z: "H" }, { v: "COURLAY", p: 1068, z: "H" }, { v: "FORET SUR SEVRE", p: 1020, z: "H" }, { v: "VAL EN VIGNES", p: 920, z: "H" }, { v: "CHAPELLE SAINT LAURENT", p: 876, z: "H" }, { v: "PLAINE ET VALLEES", p: 873, z: "H" }, { v: "CHICHE", p: 637, z: "H" }, { v: "FAYE L ABBESSE", p: 575, z: "H" }, { v: "SAINT PIERRE DES ECHAUBROGNES", p: 547, z: "H" }, { v: "CLESSE", p: 516, z: "H" }, { v: "BOISME", p: 494, z: "H" }, { v: "SAINT MAURICE ETUSSON", p: 445, z: "H" }, { v: "SAINT VARENT", p: 432, z: "H" }, { v: "LARGEASSE", p: 431, z: "H" }, { v: "SAINT AMAND SUR SEVRE", p: 390, z: "H" }, { v: "LOUZY", p: 383, z: "H" }, { v: "CIRIERES", p: 359, z: "H" }, { v: "BRION PRES THOUET", p: 355, z: "H" }, { v: "VOULMENTIN", p: 304, z: "H" }, { v: "SAINT MARTIN DE SANZAY", p: 295, z: "H" }, { v: "PIN", p: 286, z: "H" }, { v: "SAINT LEGER DE MONTBRUN", p: 286, z: "H" }, { v: "ABSIE", p: 282, z: "H" }, { v: "SAINT ANDRE SUR SEVRE", p: 221, z: "H" }, { v: "COMBRAND", p: 209, z: "H" }, { v: "SAINT JACQUES DE THOUARS", p: 208, z: "H" }, { v: "SAINT PAUL EN GATINE", p: 199, z: "H" }, { v: "GENNETON", p: 182, z: "H" }, { v: "PAS DE JEU", p: 174, z: "H" }, { v: "SAINT AUBIN DU PLAIN", p: 164, z: "H" }, { v: "LUZAY", p: 159, z: "H" }, { v: "SAINT MARTIN DE MACON", p: 154, z: "H" }, { v: "MARNES", p: 146, z: "H" }, { v: "COULONGES THOUARSAIS", p: 127, z: "H" }, { v: "SAINT CYR LA LANDE", p: 113, z: "H" }, { v: "GLENAY", p: 110, z: "H" }, { v: "MONTRAVERS", p: 92, z: "H" }, { v: "TOURTENAY", p: 84, z: "H" }, { v: "PETITE BOISSIERE", p: 77, z: "H" }, { v: "SAINT GENEROUX", p: 54, z: "H" }
]},
"NIORT 79": { dept: "79", communes: [
{ v: "NIORT", p: 33450, z: "H" }, { v: "CHAURAY", p: 3450, z: "H" }, { v: "SAINT MAIXENT L ECOLE", p: 3112, z: "H" }, { v: "MELLE", p: 2885, z: "H" }, { v: "CRECHE", p: 2768, z: "H" }, { v: "AIFFRES", p: 2341, z: "S" }, { v: "AIGONDIGNE", p: 1929, z: "H" }, { v: "ECHIRE", p: 1785, z: "H" }, { v: "CELLES SUR BELLE", p: 1763, z: "H" }, { v: "MAUZE SUR LE MIGNON", p: 1573, z: "H" }, { v: "VOUILLE", p: 1478, z: "H" }, { v: "MAGNE", p: 1476, z: "H" }, { v: "CHEF BOUTONNE", p: 1410, z: "H" }, { v: "SAUZE VAUSSAIS", p: 1369, z: "H" }, { v: "FRONTENAY ROHAN ROHAN", p: 1286, z: "H" }, { v: "COULON", p: 1261, z: "H" }, { v: "PRAHECQ", p: 967, z: "H" }, { v: "BEAUVOIR SUR NIORT", p: 944, z: "H" }, { v: "SAINT HILAIRE LA PALUD", p: 928, z: "H" }, { v: "BESSINES", p: 922, z: "H" }, { v: "SAINT GELAIS", p: 915, z: "H" }, { v: "LEZAY", p: 910, z: "H" }, { v: "SAINT SYMPHORIEN", p: 874, z: "H" }, { v: "BRIOUX SUR BOUTONNE", p: 819, z: "H" }, { v: "CHERVEUX", p: 803, z: "H" }, { v: "FORS", p: 766, z: "H" }, { v: "VILLIERS EN PLAINE", p: 711, z: "H" }, { v: "EXIREUIL", p: 637, z: "H" }, { v: "SAINT MAXIRE", p: 580, z: "H" }, { v: "SAIVRES", p: 562, z: "H" }, { v: "VAL DU MIGNON", p: 532, z: "H" }, { v: "GERMOND ROUVRE", p: 518, z: "H" }, { v: "PLAINE D ARGENSON", p: 506, z: "H" }, { v: "ARCAIS", p: 484, z: "H" }, { v: "AZAY LE BRULE", p: 482, z: "H" }, { v: "LIMALONGES", p: 479, z: "H" }, { v: "NANTEUIL", p: 472, z: "H" }, { v: "SAINT REMY", p: 456, z: "H" }, { v: "GRANZAY GRIPT", p: 451, z: "H" }, { v: "SAINT MARTIN DE SAINT MAIXENT", p: 450, z: "H" }, { v: "VANNEAU IRLEAU", p: 447, z: "H" }, { v: "PERIGNE", p: 428, z: "H" }, { v: "AUGE", p: 426, z: "H" }, { v: "MARIGNY", p: 426, z: "H" }, { v: "EPANNES", p: 394, z: "H" }, { v: "FOYE MONJAULT", p: 386, z: "H" }, { v: "VALLANS", p: 381, z: "H" }, { v: "MARCILLE", p: 378, z: "H" }, { v: "FONTIVILLIE", p: 358, z: "H" }, { v: "SAINTE NEOMAYE", p: 356, z: "S" }, { v: "ROM", p: 354, z: "H" }, { v: "VALDELAUME", p: 353, z: "H" }, { v: "PRAILLES LA COUARDE", p: 349, z: "H" }, { v: "SAINT MARTIN DE BERNEGOUE", p: 343, z: "H" }, { v: "PRIN DEYRANCON", p: 342, z: "H" }, { v: "SANSAIS", p: 339, z: "H" }, { v: "FRANCOIS", p: 327, z: "H" }, { v: "BRULAIN", p: 322, z: "H" }, { v: "BEAUSSAIS VITRE", p: 318, z: "H" }, { v: "FONTENILLE SAINT MARTIN D ENTRAIGUES", p: 310, z: "H" }, { v: "CHEY", p: 307, z: "H" }, { v: "COUTURE D ARGENSON", p: 280, z: "H" }, { v: "SAINT VINCENT LA CHATRE", p: 273, z: "H" }, { v: "SAINT ROMANS LES MELLE", p: 269, z: "H" }, { v: "BOURDET", p: 269, z: "H" }, { v: "MAIRE LEVESCAULT", p: 269, z: "H" }, { v: "SECONDIGNE SUR BELLE", p: 266, z: "H" }, { v: "CLUSSAIS LA POMMERAIE", p: 257, z: "H" }, { v: "SCIECQ", p: 253, z: "S" }, { v: "MOTHE SAINT HERAY", p: 239, z: "H" }, { v: "ROCHENARD", p: 226, z: "H" }, { v: "LOUBILLE", p: 224, z: "H" }, { v: "EXOUDUN", p: 219, z: "H" }, { v: "SEPVRET", p: 215, z: "H" }, { v: "AMURE", p: 204, z: "H" }, { v: "SAINT GEORGES DE REX", p: 200, z: "H" }, { v: "ENSIGNE", p: 182, z: "H" }, { v: "ALLOINAY", p: 180, z: "H" }, { v: "PAIZAY LE CHAPT", p: 172, z: "H" }, { v: "VANCAIS", p: 150, z: "H" }, { v: "SAINT COUTANT", p: 148, z: "H" }, { v: "JUSCORPS", p: 145, z: "H" }, { v: "CHIZE", p: 143, z: "H" }, { v: "AUBIGNE", p: 142, z: "H" }, { v: "SAINTE SOLINE", p: 132, z: "H" }, { v: "SALLES", p: 131, z: "H" }, { v: "MELLERAN", p: 127, z: "H" }, { v: "VILLEMAIN", p: 127, z: "H" }, { v: "ASNIERES EN POITOU", p: 124, z: "H" }, { v: "VILLEFOLLET", p: 123, z: "H" }, { v: "MESSE", p: 121, z: "H" }, { v: "VANZAY", p: 116, z: "H" }, { v: "VERNOUX SUR BOUTONNE", p: 111, z: "H" }, { v: "BOUGON", p: 108, z: "H" }, { v: "SAINTE EANNE", p: 96, z: "H" }, { v: "SAINT ROMANS DES CHAMPS", p: 92, z: "H" }, { v: "LUSSERAY", p: 88, z: "H" }, { v: "CHERIGNE", p: 80, z: "H" }, { v: "MAISONNAY", p: 80, z: "H" }, { v: "LUCHE SUR BRIOUX", p: 76, z: "H" }, { v: "SOUVIGNE", p: 74, z: "H" }, { v: "VILLIERS EN BOIS", p: 69, z: "H" }, { v: "CHENAY", p: 69, z: "H" }, { v: "JUILLE", p: 54, z: "H" }, { v: "SELIGNE", p: 46, z: "H" }, { v: "PAMPROUX", p: 36, z: "H" }, { v: "BRIEUIL SUR CHIZE", p: 33, z: "H" }
]},
};

// Carnet auto-feed counts for TALC sectors
var CARNET_BY_VILLE_ALL = {};
var CARNET_BY_VILLE_MONTH = {};
(function() {
  var ML = ["jan","fev","mar","avr","mai","jun","jul","aou","sep","oct","nov","dec"];
  carnetData.forEach(function(row) {
    var v = (row.ville || "").toUpperCase().trim();
    if (!v) return;
    CARNET_BY_VILLE_ALL[v] = (CARNET_BY_VILLE_ALL[v] || 0) + 1;
    // raw carnet field is date_inscription ("2026-02-05 19:48"), not date
    var d = (row.date_inscription || row.date || "").split(" ")[0];
    var p = d.split("-");
    if (p.length === 3) {
      var mk = ML[parseInt(p[1])-1] + p[0].slice(2);
      if (!CARNET_BY_VILLE_MONTH[v]) CARNET_BY_VILLE_MONTH[v] = {};
      CARNET_BY_VILLE_MONTH[v][mk] = (CARNET_BY_VILLE_MONTH[v][mk] || 0) + 1;
    }
  });
})();
function getTalcC(commune, dept, month) {
  var v = commune.v;
  if (!month) return CARNET_BY_VILLE_ALL[v] || 0;
  // Carnet first (live, accurate) — fallback to Excel MONTHLY for old months not in carnet
  var carnetVal = (CARNET_BY_VILLE_MONTH[v] && CARNET_BY_VILLE_MONTH[v][month]) || 0;
  if (carnetVal > 0) return carnetVal;
  var dataKey = MONTH_KEY_MAP[month] || month;
  var m = MONTHLY[v + "|" + dept];
  return m ? (m[dataKey] || 0) : 0;
}

const DEPT_ZONES = {
"44": { b: true, f: "partial", l: "Loire-Atlantique" },
"35": { b: true, f: "partial", l: "Ille-et-Vilaine" },
"85": { b: true, f: true, l: "Vendee" },
"79": { b: true, f: true, l: "Deux-Sevres" },
"17": { b: false, f: true, l: "Charente-Maritime" },
"49": { b: true, f: false, l: "Maine-et-Loire" },
};

const DEMO_TEAM = [
{ id: 1, name: "Djany Legrand", role: "Manager", operators: ["Free"], permis: true, voiture: true, active: true, vstCodes: ["vst-dclavereuil"], lentCodes: [] },
{ id: 2, name: "Leo Merde", role: "Confirme", operators: ["Free"], permis: true, voiture: true, active: true, vstCodes: ["vst-lmertz"], lentCodes: [] },
{ id: 3, name: "Stephane Legrand", role: "Confirme", operators: ["Free"], permis: true, voiture: true, active: true, vstCodes: ["vst-slegrand"], lentCodes: [] },
{ id: 4, name: "Sandra Pereira", role: "Confirme", operators: ["Free"], permis: true, voiture: false, active: true, vstCodes: ["vst-spereira"], lentCodes: [] },
{ id: 5, name: "William Goujon", role: "Confirme", operators: ["Free"], permis: true, voiture: true, active: true, vstCodes: ["vst-eluc"], lentCodes: [] },
{ id: 6, name: "Yannis Aboulfatah", role: "Confirme", operators: ["Free"], permis: true, voiture: false, active: true, vstCodes: ["vst-yaboulfatah"], lentCodes: [] },
{ id: 7, name: "Lyna Belkessa", role: "Confirme", operators: ["Free"], permis: false, voiture: false, active: true, vstCodes: ["vst-dbelkessa"], lentCodes: [] },
{ id: 8, name: "Ali Atf", role: "Confirme", operators: ["Free"], permis: true, voiture: true, active: true, vstCodes: ["vst-aatf"], lentCodes: [] },
{ id: 9, name: "Victor Moize", role: "Confirme", operators: ["Free"], permis: true, voiture: false, active: true, vstCodes: ["vst-vmoize"], lentCodes: [] },
{ id: 10, name: "Momed Ali", role: "Confirme", operators: ["Free"], permis: true, voiture: false, active: true, vstCodes: ["vst-mali"], lentCodes: [] },
{ id: 11, name: "Pablo Grasset", role: "Confirme", operators: ["Free"], permis: true, voiture: false, active: true, vstCodes: ["vst-pgrasset"], lentCodes: [] },
{ id: 12, name: "Hamid Atroune", role: "Debutant", operators: ["Free"], permis: true, voiture: false, active: true, vstCodes: ["vst-adahmani"], lentCodes: [] },
{ id: 13, name: "Cheick Ouedraogo", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true, vstCodes: ["vst-couedraogo"], lentCodes: [] },
{ id: 14, name: "Mohamed Mehdi Larech", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true, vstCodes: ["vst-mlarech"], lentCodes: [] },
{ id: 15, name: "Omar Mbengue", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true, vstCodes: ["vst-ombengue"], lentCodes: [] },
{ id: 16, name: "Melodie Mendousse", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true, vstCodes: ["vst-mmendousse"], lentCodes: [] },
{ id: 17, name: "Ronan Kombo", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true, vstCodes: ["vst-rkombo"], lentCodes: [] },
{ id: 18, name: "Abdellah Cheikh", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true, vstCodes: ["vst-bouchrif"], lentCodes: [] },
{ id: 19, name: "Paul Geriltault", role: "Debutant", operators: ["Free"], permis: true, voiture: false, active: true, vstCodes: ["vst-droode"], lentCodes: [] },
{ id: 20, name: "Abdel Nouar", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true, vstCodes: ["vst-hnouar"], lentCodes: [] },
{ id: 21, name: "Ouissem Ouirini", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true, vstCodes: ["vst-kelahmadi"], lentCodes: [] },
{ id: 22, name: "Titouan Salaun", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true, vstCodes: ["vst-tsalaun"], lentCodes: [] },
{ id: 23, name: "Nora Wahid", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true, vstCodes: ["vst-dpouilly"], lentCodes: [] },
{ id: 24, name: "Eloise Meillerais", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true, vstCodes: ["vst-emeillerais"], lentCodes: [] },
{ id: 25, name: "Come Audonnet", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true, vstCodes: ["vst-caudonnet"], lentCodes: [] },
{ id: 26, name: "Ilhan Kocak", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true, vstCodes: ["vst-ikocak"], lentCodes: [] },
{ id: 27, name: "Ines Ouirini", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true, vstCodes: ["vst-iouirini"], lentCodes: [] },
{ id: 28, name: "Shana David", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true, vstCodes: ["vst-sdavid"], lentCodes: [] },
{ id: 29, name: "Adam El Jazouli", role: "Confirme", operators: ["Free"], permis: false, voiture: false, active: true, vstCodes: [], lentCodes: [] },
];

const DEMO_CARS = [
{ id: 1, name: "Voiture de Léo", seats: 5, owner: "Leo Merde", driverId: 2 },
{ id: 2, name: "Voiture de Hamid", seats: 5, owner: "Hamid Atroune", driverId: 12 },
{ id: 3, name: "Voiture d'Abdellah", seats: 5, owner: "Abdellah Cheikh", driverId: 18 },
{ id: 4, name: "Voiture de Djany", seats: 5, owner: "Djany Legrand", driverId: 1 },
{ id: 5, name: "Voiture de Stéphane", seats: 5, owner: "Stephane Legrand", driverId: 3 },
{ id: 6, name: "Voiture de Sandra", seats: 5, owner: "Sandra Pereira", driverId: 4 },
{ id: 7, name: "Voiture d'Ouissem", seats: 5, owner: "Ouissem Ouirini", driverId: 21 },
];

function makeDemoContracts() {
return [
{id:"f-892555",commercial:"Djany Legrand",date:"2026-03-05",heure:"19:48",ville:"Nesmy",rue:"8 Rue Du Vieux Bourg",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-892547",commercial:"Djany Legrand",date:"2026-03-05",heure:"19:22",ville:"Nesmy",rue:"14 Rue Des Jardins",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-892546",commercial:"Come Audonnet",date:"2026-03-05",heure:"19:21",ville:"Saint Paul Mont Penit",rue:"10 Rue Des Garennes De La Nation",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-892528",commercial:"Ali Atf",date:"2026-03-05",heure:"18:58",ville:"Betton",rue:"7 Residence Les Hauts De Betton",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"En attente RDV"},
{id:"f-892516",commercial:"Sandra Pereira",date:"2026-03-05",heure:"18:39",ville:"Betton",rue:"11 Residence Les Hauts De Betton",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-892513",commercial:"Cheick Ouedraogo",date:"2026-03-05",heure:"18:36",ville:"Pornichet",rue:"94 Avenue Des Loriettes",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-892507",commercial:"Sandra Pereira",date:"2026-03-05",heure:"18:27",ville:"Betton",rue:"27 Rue De La Pree",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-892499",commercial:"Ali Atf",date:"2026-03-05",heure:"18:16",ville:"Betton",rue:"8 Residence Les Hauts De Betton",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-892494",commercial:"Djany Legrand",date:"2026-03-05",heure:"18:09",ville:"Nesmy",rue:"10 Rue De Buchenil",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-892490",commercial:"Sandra Pereira",date:"2026-03-05",heure:"18:02",ville:"Betton",rue:"11 Residence Les Hauts De Betton",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"En attente RDV"},
{id:"f-892401",commercial:"Djany Legrand",date:"2026-03-05",heure:"16:31",ville:"Nesmy",rue:"10 Rue De La Gare",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-892358",commercial:"Victor Moize",date:"2026-03-05",heure:"15:43",ville:"Grand Landes",rue:"9 Rue Deschenes",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-892320",commercial:"Djany Legrand",date:"2026-03-05",heure:"14:58",ville:"Nesmy",rue:"43 Rue De La Gare",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-892302",commercial:"Hamid Atroune",date:"2026-03-05",heure:"14:42",ville:"Roche Sur Yon",rue:"10 Impasse Lucie Delarue Mardrus",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-892294",commercial:"Ali Atf",date:"2026-03-05",heure:"14:31",ville:"Betton",rue:"1 Rue Des Balanciers",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"En attente RDV"},
{id:"f-892275",commercial:"Leo Merde",date:"2026-03-05",heure:"14:15",ville:"Saint Paul Mont Penit",rue:"8 Rue Des Tisserands",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"En attente RDV"},
{id:"f-892252",commercial:"Djany Legrand",date:"2026-03-05",heure:"13:55",ville:"Nesmy",rue:"6 Rue Du Prieure",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-892232",commercial:"Yannis Aboulfatah",date:"2026-03-05",heure:"13:42",ville:"Grand Landes",rue:"14 Rue Du Calvaire",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"En attente RDV"},
{id:"f-892199",commercial:"Momed Ali",date:"2026-03-05",heure:"13:12",ville:"Roche Sur Yon",rue:"25 Rue Des Puys",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-892186",commercial:"Hamid Atroune",date:"2026-03-05",heure:"12:58",ville:"Roche Sur Yon",rue:"27 Rue Colette",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"En attente RDV"},
{id:"f-892098",commercial:"Leo Merde",date:"2026-03-04",heure:"19:37",ville:"Roche Sur Yon",rue:"255 Rue Roger Salengro",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"En attente RDV"},
{id:"f-892087",commercial:"Momed Ali",date:"2026-03-04",heure:"19:20",ville:"Apremont",rue:"5 Place Saint Martin",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-892080",commercial:"Stephane Legrand",date:"2026-03-04",heure:"19:09",ville:"Pornichet",rue:"105 Avenue Saint Sebastien",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"En attente RDV"},
{id:"f-892059",commercial:"Nora Wahid",date:"2026-03-04",heure:"18:34",ville:"Reaumur",rue:"2 Rue Ferchaut",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-892058",commercial:"Hamid Atroune",date:"2026-03-04",heure:"18:34",ville:"Meilleraie Tillay",rue:"9 Rue Du Parc",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-892033",commercial:"Yannis Aboulfatah",date:"2026-03-04",heure:"17:50",ville:"Roche Sur Yon",rue:"70 Rue Des Oeillets",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-892029",commercial:"Djany Legrand",date:"2026-03-04",heure:"17:43",ville:"Mache",rue:"2 Rue Du Calvaire",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-892014",commercial:"Leo Merde",date:"2026-03-04",heure:"17:24",ville:"Roche Sur Yon",rue:"280 Rue Roger Salengro",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-891990",commercial:"Cheick Ouedraogo",date:"2026-03-04",heure:"16:56",ville:"Pornichet",rue:"6 Passage De La Chaloupe",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-891965",commercial:"Nora Wahid",date:"2026-03-04",heure:"16:25",ville:"Reaumur",rue:"2 Rue Mal De Lattre De Tassigny",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-891954",commercial:"Cheick Ouedraogo",date:"2026-03-04",heure:"16:17",ville:"Pornichet",rue:"4 Passage De La Chaloupe",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-891953",commercial:"Momed Ali",date:"2026-03-04",heure:"16:16",ville:"Apremont",rue:"27 Impasse Des Coquelicots",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-891933",commercial:"William Goujon",date:"2026-03-04",heure:"15:45",ville:"Pornichet",rue:"21 Avenue Du Gris",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-891884",commercial:"Cheick Ouedraogo",date:"2026-03-04",heure:"14:51",ville:"Pornichet",rue:"5 Passage De La Chaloupe",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-891881",commercial:"Djany Legrand",date:"2026-03-04",heure:"14:49",ville:"Mache",rue:"3 Rue Du Souvenir",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-891876",commercial:"Ronan Kombo",date:"2026-03-04",heure:"14:45",ville:"Roche Sur Yon",rue:"8 Rue Manuel",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-891870",commercial:"Leo Merde",date:"2026-03-04",heure:"14:42",ville:"Roche Sur Yon",rue:"19 Rue Pierre Oliveau",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-891582",commercial:"Hamid Atroune",date:"2026-03-03",heure:"18:36",ville:"Saint Pere En Retz",rue:"5 Place De La Mairie",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-891581",commercial:"Stephane Legrand",date:"2026-03-03",heure:"18:29",ville:"Turballe",rue:"4 Allee Des Sports",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"RDV pris"},
{id:"f-891544",commercial:"Djany Legrand",date:"2026-03-03",heure:"17:53",ville:"Turballe",rue:"2 Impasse Felix Mayol",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-891534",commercial:"Ali Atf",date:"2026-03-03",heure:"17:37",ville:"Liffre",rue:"4 Square Paul Feval",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"RDV pris"},
{id:"f-891524",commercial:"Stephane Legrand",date:"2026-03-03",heure:"17:26",ville:"Turballe",rue:"4 Allee Des Sports",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-891502",commercial:"William Goujon",date:"2026-03-03",heure:"16:58",ville:"Turballe",rue:"43 Rue Jean Louis Trimaud",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-891491",commercial:"Hamid Atroune",date:"2026-03-03",heure:"16:48",ville:"Saint Pere En Retz",rue:"10 Rue Des Ormes",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-891487",commercial:"Momed Ali",date:"2026-03-03",heure:"16:46",ville:"Saint Colomban",rue:"17 Rue Josephine Brillaud",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-891486",commercial:"Sandra Pereira",date:"2026-03-03",heure:"16:45",ville:"Liffre",rue:"7 Rue Maurice Ravel",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-891459",commercial:"Djany Legrand",date:"2026-03-03",heure:"16:15",ville:"Corsept",rue:"8 Rue De Saint Michel",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-891457",commercial:"Ali Atf",date:"2026-03-03",heure:"16:10",ville:"Liffre",rue:"16 Rue Maurice Ravel",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"RDV pris"},
{id:"f-891450",commercial:"Cheick Ouedraogo",date:"2026-03-03",heure:"16:00",ville:"Saint Pere En Retz",rue:"45 Rue Du Lancaster",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-891361",commercial:"Hamid Atroune",date:"2026-03-03",heure:"14:22",ville:"Saint Pere En Retz",rue:"10 Rue De La Sorbonne",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-891320",commercial:"Ilhan Kocak",date:"2026-03-03",heure:"13:24",ville:"Saint Pere En Retz",rue:"14 Rue Des Ormes",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-891318",commercial:"Djany Legrand",date:"2026-03-03",heure:"13:22",ville:"Corsept",rue:"2 Impasse Des Courillons",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"RDV pris"},
{id:"f-891125",commercial:"Djany Legrand",date:"2026-03-02",heure:"17:43",ville:"Limouziniere",rue:"52 Rue Charles De Gaulle",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-891108",commercial:"Abdellah Cheikh",date:"2026-03-02",heure:"17:27",ville:"Vieillevigne",rue:"2 Allee Des Logis Ronsard",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-891099",commercial:"Stephane Legrand",date:"2026-03-02",heure:"17:21",ville:"Pace",rue:"6 Rue Michel Marion",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"En attente RDV"},
{id:"f-891071",commercial:"William Goujon",date:"2026-03-02",heure:"16:43",ville:"Pace",rue:"12 Avenue De Beausoleil",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-891063",commercial:"Momed Ali",date:"2026-03-02",heure:"16:31",ville:"Saint Colomban",rue:"14 Rue De L Hotel De Ville",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-891055",commercial:"Lyna Belkessa",date:"2026-03-02",heure:"16:26",ville:"Vieillevigne",rue:"13 Square Jean Gastineau",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"RDV pris"},
{id:"f-890940",commercial:"Lyna Belkessa",date:"2026-03-02",heure:"14:02",ville:"Vieillevigne",rue:"4 Allee Louis Pasteur",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"RDV pris"},
{id:"f-890938",commercial:"Ouissem Ouirini",date:"2026-03-02",heure:"13:56",ville:"Planche",rue:"4 Rue Des Peupliers",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-890895",commercial:"Abdellah Cheikh",date:"2026-03-02",heure:"13:29",ville:"Vieillevigne",rue:"2 Avenue Jules Verne",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-890869",commercial:"Lyna Belkessa",date:"2026-03-02",heure:"12:57",ville:"Vieillevigne",rue:"37 Rue Du Quarteron",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-890783",commercial:"Hamid Atroune",date:"2026-02-28",heure:"15:33",ville:"Vertou",rue:"1 Rue De L Ile De France",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-890782",commercial:"Hamid Atroune",date:"2026-02-28",heure:"14:49",ville:"Vertou",rue:"1 Rue De L Ile De France",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-890750",commercial:"Yannis Aboulfatah",date:"2026-02-27",heure:"18:27",ville:"Hermitage",rue:"1 Rue De La Bougeaudiere",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-890738",commercial:"Paul Geriltault",date:"2026-02-27",heure:"18:06",ville:"Saint Nazaire",rue:"9 Rue De La Guyane",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-890703",commercial:"Momed Ali",date:"2026-02-27",heure:"17:16",ville:"Saint Nazaire",rue:"52 Rue Edgar Degas",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-890641",commercial:"Yannis Aboulfatah",date:"2026-02-27",heure:"15:17",ville:"Hermitage",rue:"1 Rue De La Bougeaudiere",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-890606",commercial:"Djany Legrand",date:"2026-02-27",heure:"14:28",ville:"Saint Nazaire",rue:"35 Rue Fernand Gasnier",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"En attente RDV"},
{id:"f-890550",commercial:"Cheick Ouedraogo",date:"2026-02-27",heure:"13:30",ville:"Hermitage",rue:"5 Rue De La Perriere",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"En attente RDV"},
{id:"f-890543",commercial:"Hamid Atroune",date:"2026-02-27",heure:"13:15",ville:"Saint Nazaire",rue:"19 Boulevard De Sunderland",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-890531",commercial:"Momed Ali",date:"2026-02-27",heure:"12:50",ville:"Saint Nazaire",rue:"45 Rue Auguste Renoir",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-890523",commercial:"Stephane Legrand",date:"2026-02-27",heure:"12:42",ville:"Savenay",rue:"7 Rue Marceau",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-890446",commercial:"Leo Merde",date:"2026-02-26",heure:"19:43",ville:"Roche Sur Yon",rue:"7 Impasse Gaston Willay",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-890422",commercial:"Victor Moize",date:"2026-02-26",heure:"18:44",ville:"Roche Sur Yon",rue:"27 Allee D Eden",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-890416",commercial:"Come Audonnet",date:"2026-02-26",heure:"18:36",ville:"Roche Sur Yon",rue:"36 Chemin Des Prairies",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-890412",commercial:"Momed Ali",date:"2026-02-26",heure:"18:26",ville:"Mesnard La Barotiere",rue:"37 Rue De La Mairie",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-890407",commercial:"Sandra Pereira",date:"2026-02-26",heure:"18:16",ville:"Roche Sur Yon",rue:"106 Avenue Leonard De Vinci",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-890406",commercial:"Melodie Mendousse",date:"2026-02-26",heure:"18:16",ville:"Roche Sur Yon",rue:"21 Rue Paul Baudry",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-890372",commercial:"Yannis Aboulfatah",date:"2026-02-26",heure:"17:31",ville:"Chateauneuf",rue:"6 Impasse Des Genets",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-890371",commercial:"Ali Atf",date:"2026-02-26",heure:"17:29",ville:"Roche Sur Yon",rue:"39 Rue Auguste Boudaud",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"RDV pris"},
{id:"f-890339",commercial:"Ali Atf",date:"2026-02-26",heure:"16:54",ville:"Roche Sur Yon",rue:"16 Impasse Hippolyte Perier",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"RDV pris"},
{id:"f-890291",commercial:"Yannis Aboulfatah",date:"2026-02-26",heure:"15:52",ville:"Chateauneuf",rue:"4 Impasse De La Cle Des Champs",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-890289",commercial:"Djany Legrand",date:"2026-02-26",heure:"15:47",ville:"Mesnard La Barotiere",rue:"9 Place De L Eglise",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-890275",commercial:"Stephane Legrand",date:"2026-02-26",heure:"15:29",ville:"Garnache",rue:"51 Rue Louise Bourgeois",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-890261",commercial:"Lyna Belkessa",date:"2026-02-26",heure:"15:10",ville:"Roche Sur Yon",rue:"9 Rue Auguste Boudaud",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"RDV pris"},
{id:"f-890254",commercial:"Mohamed Mehdi Larech",date:"2026-02-26",heure:"15:01",ville:"Roche Sur Yon",rue:"3 Boulevard Gaston Guitton",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-890224",commercial:"Djany Legrand",date:"2026-02-26",heure:"14:35",ville:"Mesnard La Barotiere",rue:"13 Place De L Eglise",operator:"Free",type:"Fibre",box:"POP",status:"Annule"},
{id:"f-890218",commercial:"Sandra Pereira",date:"2026-02-26",heure:"14:32",ville:"Roche Sur Yon",rue:"10 Place Lulli",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-890182",commercial:"Sandra Pereira",date:"2026-02-26",heure:"13:45",ville:"Roche Sur Yon",rue:"78 Boulevard Michel Ange",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"RDV pris"},
{id:"f-890163",commercial:"Mohamed Mehdi Larech",date:"2026-02-26",heure:"13:16",ville:"Roche Sur Yon",rue:"5 Rue Jean Chaptal",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-890137",commercial:"Ali Atf",date:"2026-02-26",heure:"12:52",ville:"Roche Sur Yon",rue:"7 Rue Des Roses",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-890066",commercial:"Djany Legrand",date:"2026-02-25",heure:"19:31",ville:"Paimboeuf",rue:"6 Rue Florent Gariou",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-890009",commercial:"Momed Ali",date:"2026-02-25",heure:"18:13",ville:"Frossay",rue:"23 Rue Alexis Maneyrol",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-890008",commercial:"Stephane Legrand",date:"2026-02-25",heure:"18:10",ville:"Garnache",rue:"33 Rue Louise Bourgeois",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-889994",commercial:"Djany Legrand",date:"2026-02-25",heure:"17:55",ville:"Saint Viaud",rue:"2 Route De Corsept",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-889978",commercial:"Ronan Kombo",date:"2026-02-25",heure:"17:43",ville:"Frossay",rue:"1 Chemin Du Gotha",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-889972",commercial:"Abdel Nouar",date:"2026-02-25",heure:"17:35",ville:"Baule Escoublac",rue:"3 Impasse Des Liserons",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"RDV pris"},
{id:"f-889944",commercial:"Djany Legrand",date:"2026-02-25",heure:"16:52",ville:"Saint Viaud",rue:"5 Rue De La Gare",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-889938",commercial:"Hamid Atroune",date:"2026-02-25",heure:"16:49",ville:"Saint Nazaire",rue:"10 Rue De L Hippodrome",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-889900",commercial:"Hamid Atroune",date:"2026-02-25",heure:"16:20",ville:"Saint Nazaire",rue:"10 Rue De L Hippodrome",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-889893",commercial:"Stephane Legrand",date:"2026-02-25",heure:"16:15",ville:"Garnache",rue:"23 Rue Louise Bourgeois",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-889876",commercial:"Djany Legrand",date:"2026-02-25",heure:"15:40",ville:"Saint Viaud",rue:"5 Rue Des Fleurs",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-889860",commercial:"Hamid Atroune",date:"2026-02-25",heure:"15:40",ville:"Baule Escoublac",rue:"1 Avenue Des Charmes",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-889829",commercial:"Hamid Atroune",date:"2026-02-25",heure:"15:10",ville:"Saint Nazaire",rue:"12 Rue Beaumarchais",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-889804",commercial:"Abdel Nouar",date:"2026-02-25",heure:"14:49",ville:"Baule Escoublac",rue:"2 Avenue Des Charmes",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"RDV pris"},
{id:"f-889781",commercial:"Stephane Legrand",date:"2026-02-25",heure:"14:16",ville:"Garnache",rue:"26 Rue Niki De Saint Phalle",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-889705",commercial:"Cheick Ouedraogo",date:"2026-02-25",heure:"13:06",ville:"Garnache",rue:"13 Rue Du Crepuscule",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"RDV pris"},
{id:"f-889533",commercial:"William Goujon",date:"2026-02-24",heure:"18:11",ville:"Dompierre Sur Yon",rue:"35 Rue Du Moulin",operator:"Free",type:"Fibre",box:"POP",status:"Annule"},
{id:"f-889531",commercial:"Djany Legrand",date:"2026-02-24",heure:"18:09",ville:"Tiffauges",rue:"7 Rue Saint Martin",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"En attente RDV"},
{id:"f-889492",commercial:"William Goujon",date:"2026-02-24",heure:"17:33",ville:"Dompierre Sur Yon",rue:"27 Rue Du Moulin",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-889466",commercial:"Stephane Legrand",date:"2026-02-24",heure:"17:09",ville:"Nalliers",rue:"1 Cite Pierre Menanteau",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-889449",commercial:"Djany Legrand",date:"2026-02-24",heure:"16:47",ville:"Tiffauges",rue:"14 Rue Saint Lazare",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-889418",commercial:"Victor Moize",date:"2026-02-24",heure:"16:08",ville:"Dompierre Sur Yon",rue:"7 Rue Des Saules",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-889406",commercial:"Ronan Kombo",date:"2026-02-24",heure:"15:48",ville:"Dompierre Sur Yon",rue:"12 Rue Des Violettes",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-889332",commercial:"Momed Ali",date:"2026-02-24",heure:"14:24",ville:"Boussay",rue:"14 Rue Du Bordage",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-889310",commercial:"Djany Legrand",date:"2026-02-24",heure:"14:09",ville:"Tiffauges",rue:"8 Cite De La Sevre",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-889115",commercial:"Momed Ali",date:"2026-02-23",heure:"19:40",ville:"Mouchamps",rue:"47 Rue Du Commandant Guilbaud",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-889114",commercial:"Ronan Kombo",date:"2026-02-23",heure:"19:36",ville:"Gaubretiere",rue:"2 Rue De La Vallee",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-889101",commercial:"Yannis Aboulfatah",date:"2026-02-23",heure:"18:42",ville:"Roche Sur Yon",rue:"119 Rue Du General Guerin",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-889087",commercial:"Ilhan Kocak",date:"2026-02-23",heure:"18:25",ville:"Roche Sur Yon",rue:"48 Rue Bossuet",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-889076",commercial:"William Goujon",date:"2026-02-23",heure:"18:18",ville:"Gaubretiere",rue:"10 Cite Du Parc",operator:"Free",type:"Fibre",box:"POP",status:"Annule"},
{id:"f-889060",commercial:"Come Audonnet",date:"2026-02-23",heure:"17:56",ville:"Roche Sur Yon",rue:"6 Rue Clement Ader",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"RDV pris"},
{id:"f-889050",commercial:"Leo Merde",date:"2026-02-23",heure:"17:44",ville:"Roche Sur Yon",rue:"34 Rue Raoul Follereau",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-889015",commercial:"Stephane Legrand",date:"2026-02-23",heure:"17:13",ville:"Saint Gregoire",rue:"0 Rue Germaine Tillion",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"En attente RDV"},
{id:"f-888991",commercial:"Djany Legrand",date:"2026-02-23",heure:"16:54",ville:"Saint Martin Des Noyers",rue:"55 Chemin Du Fromenteau",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-888959",commercial:"Leo Merde",date:"2026-02-23",heure:"16:21",ville:"Roche Sur Yon",rue:"3 Impasse Etienne Dolet",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-888948",commercial:"Ilhan Kocak",date:"2026-02-23",heure:"16:14",ville:"Roche Sur Yon",rue:"95 Boulevard Des Belges",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-888938",commercial:"Djany Legrand",date:"2026-02-23",heure:"16:09",ville:"Saint Martin Des Noyers",rue:"120 Rue Sainte Agathe",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-888918",commercial:"Stephane Legrand",date:"2026-02-23",heure:"15:55",ville:"Saint Gregoire",rue:"0 Rue Germaine Tillion",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-888916",commercial:"Momed Ali",date:"2026-02-23",heure:"15:53",ville:"Mouchamps",rue:"7 Impasse Des Sommeliers",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-888872",commercial:"Djany Legrand",date:"2026-02-23",heure:"15:05",ville:"Saint Martin Des Noyers",rue:"25 Rue Sainte Agathe",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-888864",commercial:"William Goujon",date:"2026-02-23",heure:"14:56",ville:"Gaubretiere",rue:"33 Rue Jacques Forestier",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-888828",commercial:"Mohamed Mehdi Larech",date:"2026-02-23",heure:"14:22",ville:"Saint Nazaire",rue:"10 Rue Des Sapins",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-888785",commercial:"Ilhan Kocak",date:"2026-02-23",heure:"13:37",ville:"Roche Sur Yon",rue:"30 Rue Guerineau",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"En attente RDV"},
{id:"f-888740",commercial:"Pablo Grasset",date:"2026-02-23",heure:"12:56",ville:"Saint Gregoire",rue:"6 Avenue Des Druides",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-888598",commercial:"Victor Moize",date:"2026-02-20",heure:"19:15",ville:"Mesquer",rue:"8 Impasse Du Pressoir",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-888592",commercial:"Omar Mbengue",date:"2026-02-20",heure:"18:42",ville:"Epesses",rue:"5 Impasse De L Aubepine",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-888590",commercial:"Victor Moize",date:"2026-02-20",heure:"18:36",ville:"Saint Brevin Les Pins",rue:"42 Avenue Raymond Poincare",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-888581",commercial:"Hamid Atroune",date:"2026-02-20",heure:"18:11",ville:"Pontchateau",rue:"7 Allee Auguste Renoir",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-888579",commercial:"Cheick Ouedraogo",date:"2026-02-20",heure:"18:06",ville:"Sainte Foy",rue:"54 Allee Des Acacias",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-888578",commercial:"Come Audonnet",date:"2026-02-20",heure:"18:01",ville:"Sainte Anne Sur Brivet",rue:"23 Route De Crannee",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-888574",commercial:"Stephane Legrand",date:"2026-02-20",heure:"17:55",ville:"Sainte Foy",rue:"171 Rue Des Chardonnerets",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-888566",commercial:"Pablo Grasset",date:"2026-02-20",heure:"17:45",ville:"Epesses",rue:"15 Rue Du Mal De Lattre",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-888563",commercial:"Abdel Nouar",date:"2026-02-20",heure:"17:42",ville:"Saint Nazaire",rue:"31 Rue De La Vecquerie",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-888555",commercial:"Victor Moize",date:"2026-02-20",heure:"17:33",ville:"Mesquer",rue:"290 Allee De La Belle Etoile",operator:"Free",type:"Fibre",box:"POP",status:"Annule"},
{id:"f-888551",commercial:"Ronan Kombo",date:"2026-02-20",heure:"17:25",ville:"Dreffeac",rue:"19 Rue Des Sports",operator:"Free",type:"Fibre",box:"POP",status:"Annule"},
{id:"f-888513",commercial:"Paul Geriltault",date:"2026-02-20",heure:"16:23",ville:"Mesquer",rue:"260 Allee Des Barges",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-888512",commercial:"Yannis Aboulfatah",date:"2026-02-20",heure:"16:21",ville:"Dreffeac",rue:"7 Rue Des Ajoncs",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-888489",commercial:"Hamid Atroune",date:"2026-02-20",heure:"15:56",ville:"Pontchateau",rue:"31 Rue Maurice Sambron",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-888468",commercial:"Hamid Atroune",date:"2026-02-20",heure:"15:25",ville:"Pontchateau",rue:"31 Rue Maurice Sambron",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-888425",commercial:"Djany Legrand",date:"2026-02-20",heure:"14:31",ville:"Sevremont",rue:"1 Rue Du Puy Belin",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-888424",commercial:"Victor Moize",date:"2026-02-20",heure:"14:31",ville:"Mesquer",rue:"1 Allee Des Pleiades",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-888419",commercial:"Hamid Atroune",date:"2026-02-20",heure:"14:25",ville:"Pontchateau",rue:"31 Rue Maurice Sambron",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-888415",commercial:"Mohamed Mehdi Larech",date:"2026-02-20",heure:"14:18",ville:"Saint Nazaire",rue:"45 Rue De La Matte",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-888395",commercial:"Lyna Belkessa",date:"2026-02-20",heure:"13:48",ville:"Saint Nazaire",rue:"8 Rue Claude Perrault",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-888371",commercial:"Ronan Kombo",date:"2026-02-20",heure:"13:21",ville:"Dreffeac",rue:"22 Grande Rue",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-888288",commercial:"Djany Legrand",date:"2026-02-19",heure:"19:20",ville:"Paimboeuf",rue:"8 Rue Rene Moritz",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-888283",commercial:"Leo Merde",date:"2026-02-19",heure:"19:04",ville:"Roche Sur Yon",rue:"55 Rue Paul Doumer",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-888280",commercial:"Djany Legrand",date:"2026-02-19",heure:"18:38",ville:"Froidfond",rue:"6 Impasse Des Genets",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"En attente RDV"},
{id:"f-888279",commercial:"Sandra Pereira",date:"2026-02-19",heure:"18:37",ville:"Beaulieu Sous La Roche",rue:"4 Rue Des Lauriers",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-888272",commercial:"Abdel Nouar",date:"2026-02-19",heure:"18:19",ville:"Baule Escoublac",rue:"2 Avenue Des Helianthes",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-888271",commercial:"Pablo Grasset",date:"2026-02-19",heure:"18:19",ville:"Mareuil Sur Lay Dissais",rue:"15 Rue Des Ardillers",operator:"Free",type:"Fibre",box:"POP",status:"Annule"},
{id:"f-888253",commercial:"Yannis Aboulfatah",date:"2026-02-19",heure:"17:56",ville:"Saint Etienne Du Bois",rue:"4 Rue Beausejour",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-888251",commercial:"Hamid Atroune",date:"2026-02-19",heure:"17:53",ville:"Soullans",rue:"2 Rue Des Oiseaux",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-888223",commercial:"Leo Merde",date:"2026-02-19",heure:"17:19",ville:"Roche Sur Yon",rue:"9 Rue Jean Jacques Rousseau",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"En attente RDV"},
{id:"f-888222",commercial:"Ali Atf",date:"2026-02-19",heure:"17:17",ville:"Martinet",rue:"14 Rue De L Ocean",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"RDV pris"},
{id:"f-888219",commercial:"Lyna Belkessa",date:"2026-02-19",heure:"17:12",ville:"Chapelle Hermier",rue:"67 Rue Georges Clemenceau",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-888209",commercial:"Abdel Nouar",date:"2026-02-19",heure:"16:53",ville:"Baule Escoublac",rue:"2 Avenue Des Helianthes",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-888206",commercial:"Yannis Aboulfatah",date:"2026-02-19",heure:"16:50",ville:"Saint Etienne Du Bois",rue:"7 Le Marche Nouveau",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-888190",commercial:"Ali Atf",date:"2026-02-19",heure:"16:28",ville:"Martinet",rue:"21 Rue De L Ocean",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-888182",commercial:"Djany Legrand",date:"2026-02-19",heure:"16:20",ville:"Froidfond",rue:"12 Rue Des Rosiers",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"RDV pris"},
{id:"f-888177",commercial:"Lyna Belkessa",date:"2026-02-19",heure:"16:13",ville:"Chapelle Hermier",rue:"52 Rue Georges Clemenceau",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-888175",commercial:"Stephane Legrand",date:"2026-02-19",heure:"16:12",ville:"Palluau",rue:"11 Rue Des Iris",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-888170",commercial:"Abdellah Cheikh",date:"2026-02-19",heure:"16:08",ville:"Coex",rue:"0 Rue Des Acacias",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-888148",commercial:"Hamid Atroune",date:"2026-02-19",heure:"15:40",ville:"Baule Escoublac",rue:"3 Avenue Des Fusains",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-888120",commercial:"Hamid Atroune",date:"2026-02-19",heure:"15:11",ville:"Soullans",rue:"1 Impasse Des Noisetiers",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Annule"},
{id:"f-888115",commercial:"Stephane Legrand",date:"2026-02-19",heure:"15:07",ville:"Palluau",rue:"19 Rue Des Iris",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-888097",commercial:"Djany Legrand",date:"2026-02-19",heure:"14:34",ville:"Froidfond",rue:"24 Rue Louis Germain Boisleve",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-888090",commercial:"Hamid Atroune",date:"2026-02-19",heure:"14:28",ville:"Soullans",rue:"25 Route De Challans",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-888089",commercial:"Leo Merde",date:"2026-02-19",heure:"14:27",ville:"Roche Sur Yon",rue:"55 Rue Paul Doumer",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-888084",commercial:"Lyna Belkessa",date:"2026-02-19",heure:"14:20",ville:"Chapelle Hermier",rue:"6 Rue Des Pommiers",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-888046",commercial:"Pablo Grasset",date:"2026-02-19",heure:"13:43",ville:"Mareuil Sur Lay Dissais",rue:"5 Rue Des Ardillers",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-888039",commercial:"Ronan Kombo",date:"2026-02-19",heure:"13:36",ville:"Mareuil Sur Lay Dissais",rue:"65 Rue Du Puy Sans Tour",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Annule"},
{id:"f-888023",commercial:"Shana David",date:"2026-02-19",heure:"13:16",ville:"Palluau",rue:"19 Rue Des Camelias",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-888008",commercial:"Ali Atf",date:"2026-02-19",heure:"12:47",ville:"Martinet",rue:"12 Rue Du Jaunay",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-888003",commercial:"Hamid Atroune",date:"2026-02-19",heure:"12:41",ville:"Soullans",rue:"32 Chemin Du Paradis",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"RDV pris"},
{id:"f-887954",commercial:"Leo Merde",date:"2026-02-18",heure:"19:25",ville:"Roche Sur Yon",rue:"13 Rue Des 3 Piliers",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"RDV pris"},
{id:"f-887945",commercial:"Momed Ali",date:"2026-02-18",heure:"18:54",ville:"Saint Nazaire",rue:"24 Rue Gabriel Faure",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-887921",commercial:"Djany Legrand",date:"2026-02-18",heure:"18:38",ville:"Saint Nazaire",rue:"3 Allee Des Orchidees",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-887912",commercial:"Yannis Aboulfatah",date:"2026-02-18",heure:"18:29",ville:"Roche Sur Yon",rue:"78 Boulevard D Italie",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Annule"},
{id:"f-887911",commercial:"Victor Moize",date:"2026-02-18",heure:"18:27",ville:"Saint Brevin Les Pins",rue:"42 Avenue Raymond Poincare",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"En attente RDV"},
{id:"f-887905",commercial:"Abdellah Cheikh",date:"2026-02-18",heure:"18:15",ville:"Lucs Sur Boulogne",rue:"209 Rue Des Pres Barbais",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-887891",commercial:"Lyna Belkessa",date:"2026-02-18",heure:"17:50",ville:"Lucs Sur Boulogne",rue:"20 Place Sainte Catherine",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-887885",commercial:"Ilhan Kocak",date:"2026-02-18",heure:"17:46",ville:"Pornic",rue:"20 Avenue Mozart",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-887876",commercial:"Ali Atf",date:"2026-02-18",heure:"17:39",ville:"Lege",rue:"24 Rue Alfred Gerbaud",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-887866",commercial:"Leo Merde",date:"2026-02-18",heure:"17:28",ville:"Roche Sur Yon",rue:"58 Rue Sadi Carnot",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-887864",commercial:"Djany Legrand",date:"2026-02-18",heure:"17:27",ville:"Saint Nazaire",rue:"47 Route Des Frechets",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-887852",commercial:"Sandra Pereira",date:"2026-02-18",heure:"17:05",ville:"Lege",rue:"33 Rue Alfred Gerbaud",operator:"Free",type:"Fibre",box:"POP",status:"Annule"},
{id:"f-887851",commercial:"Pablo Grasset",date:"2026-02-18",heure:"17:04",ville:"Pornic",rue:"1 Place De La Grande Aire",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"RDV pris"},
{id:"f-887838",commercial:"Ali Atf",date:"2026-02-18",heure:"16:53",ville:"Lege",rue:"37 Rue Alfred Gerbaud",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-887836",commercial:"William Goujon",date:"2026-02-18",heure:"16:50",ville:"Saint Brevin Les Pins",rue:"42 Avenue Raymond Poincare",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-887815",commercial:"Victor Moize",date:"2026-02-18",heure:"16:30",ville:"Saint Brevin Les Pins",rue:"36 Avenue Jules Verne",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-887795",commercial:"Lyna Belkessa",date:"2026-02-18",heure:"16:12",ville:"Lucs Sur Boulogne",rue:"118 Rue Georges Clemenceau",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-887760",commercial:"Djany Legrand",date:"2026-02-18",heure:"15:27",ville:"Saint Nazaire",rue:"4 Allee Des Marguerites",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-887750",commercial:"Melodie Mendousse",date:"2026-02-18",heure:"15:05",ville:"Roche Sur Yon",rue:"11 Rue Haxo",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-887725",commercial:"Ali Atf",date:"2026-02-18",heure:"14:37",ville:"Lege",rue:"6 Place Du Champ De Foire",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-887721",commercial:"Eloise Meillerais",date:"2026-02-18",heure:"14:34",ville:"Touvois",rue:"15 Rue De La Foret",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-887711",commercial:"Shana David",date:"2026-02-18",heure:"14:26",ville:"Saint Brevin Les Pins",rue:"28 Avenue Edouard Branly",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-887710",commercial:"Leo Merde",date:"2026-02-18",heure:"14:25",ville:"Roche Sur Yon",rue:"13 Rue Des 3 Piliers",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-887707",commercial:"Sandra Pereira",date:"2026-02-18",heure:"14:24",ville:"Lege",rue:"1 Rue Alfred Gerbaud",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-887674",commercial:"Ouissem Ouirini",date:"2026-02-18",heure:"13:46",ville:"Saint Brevin Les Pins",rue:"2 Allee Marguerite",operator:"Free",type:"Fibre",box:"ULTRA",status:"Annule"},
{id:"f-887671",commercial:"Leo Merde",date:"2026-02-18",heure:"13:41",ville:"Roche Sur Yon",rue:"6 Place Monseigneur Deval",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-887667",commercial:"Sandra Pereira",date:"2026-02-18",heure:"13:35",ville:"Lege",rue:"4 Rue De Chambord",operator:"Free",type:"Fibre",box:"POP",status:"Annule"},
{id:"f-887653",commercial:"William Goujon",date:"2026-02-18",heure:"13:20",ville:"Saint Brevin Les Pins",rue:"5 Avenue Des Tilleuls",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-887647",commercial:"Ali Atf",date:"2026-02-18",heure:"13:12",ville:"Lege",rue:"9 Rue Beausejour",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-887617",commercial:"Lyna Belkessa",date:"2026-02-18",heure:"12:36",ville:"Lucs Sur Boulogne",rue:"55 Rue De La Rochejaquelein",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-887574",commercial:"Djany Legrand",date:"2026-02-17",heure:"19:11",ville:"Paimboeuf",rue:"4 Cite Des Amourettes",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-887551",commercial:"Hamid Atroune",date:"2026-02-17",heure:"18:37",ville:"Trignac",rue:"21 Rue Du Stade",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"En attente RDV"},
{id:"f-887529",commercial:"Cheick Ouedraogo",date:"2026-02-17",heure:"18:13",ville:"Chartres De Bretagne",rue:"1 Square Rene Vautier",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"RDV pris"},
{id:"f-887525",commercial:"Ronan Kombo",date:"2026-02-17",heure:"18:11",ville:"Saint Nazaire",rue:"4 Rue Des Dentellieres",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-887516",commercial:"Pablo Grasset",date:"2026-02-17",heure:"18:05",ville:"Saint Nazaire",rue:"57 Rue Michel Ange",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-887504",commercial:"Djany Legrand",date:"2026-02-17",heure:"17:50",ville:"Paimboeuf",rue:"2 Cite Des Amourettes",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-887470",commercial:"Paul Geriltault",date:"2026-02-17",heure:"17:18",ville:"Paimboeuf",rue:"9 Rue Pierre Jubau",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-887421",commercial:"Djany Legrand",date:"2026-02-17",heure:"16:22",ville:"Paimboeuf",rue:"3 Cite Des Amourettes",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-887378",commercial:"Hamid Atroune",date:"2026-02-17",heure:"15:45",ville:"Saint Nazaire",rue:"21 Rue Honore Daumier",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-887370",commercial:"Cheick Ouedraogo",date:"2026-02-17",heure:"15:37",ville:"Chartres De Bretagne",rue:"3 Square Rene Vautier",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-887303",commercial:"Pablo Grasset",date:"2026-02-17",heure:"14:20",ville:"Saint Nazaire",rue:"57 Rue Michel Ange",operator:"Free",type:"Fibre",box:"POP",status:"Annule"},
{id:"f-887293",commercial:"Cheick Ouedraogo",date:"2026-02-17",heure:"14:09",ville:"Chartres De Bretagne",rue:"4 Square Rene Vautier",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-887246",commercial:"Momed Ali",date:"2026-02-17",heure:"13:33",ville:"Paimboeuf",rue:"8 Allee Des Ajoncs",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-887208",commercial:"Djany Legrand",date:"2026-02-17",heure:"12:55",ville:"Paimboeuf",rue:"1 Cite Des Amourettes",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-887138",commercial:"Djany Legrand",date:"2026-02-16",heure:"19:46",ville:"Corcoue Sur Logne",rue:"9 Rue Des Fauvettes",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-887106",commercial:"Momed Ali",date:"2026-02-16",heure:"18:41",ville:"Corcoue Sur Logne",rue:"13 Rue Du Lavoir",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-887105",commercial:"Pablo Grasset",date:"2026-02-16",heure:"18:37",ville:"Bournezeau",rue:"13 Rue De La Prairie",operator:"Free",type:"Fibre",box:"ULTRA",status:"Annule"},
{id:"f-887079",commercial:"Djany Legrand",date:"2026-02-16",heure:"18:14",ville:"Corcoue Sur Logne",rue:"2 Rue Des Chardonnerets",operator:"Free",type:"Fibre",box:"POP",status:"Annule"},
{id:"f-887076",commercial:"Leo Merde",date:"2026-02-16",heure:"18:11",ville:"Mortagne Sur Sevre",rue:"5 Rue De La Gare",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-887026",commercial:"Leo Merde",date:"2026-02-16",heure:"17:15",ville:"Mortagne Sur Sevre",rue:"2 Rue De La Gare",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-887021",commercial:"Cheick Ouedraogo",date:"2026-02-16",heure:"17:07",ville:"Bournezeau",rue:"16 Rue De La Poterne",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-887018",commercial:"Melodie Mendousse",date:"2026-02-16",heure:"17:07",ville:"Mortagne Sur Sevre",rue:"5 Rue De La Freche",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-886970",commercial:"Come Audonnet",date:"2026-02-16",heure:"16:23",ville:"Mortagne Sur Sevre",rue:"8 Rue Dauphine",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-886948",commercial:"Mohamed Mehdi Larech",date:"2026-02-16",heure:"16:04",ville:"Sainte Pazanne",rue:"21 Rue Du Tenu",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-886900",commercial:"Leo Merde",date:"2026-02-16",heure:"15:01",ville:"Mortagne Sur Sevre",rue:"37 Rue Du Centre",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-886862",commercial:"Djany Legrand",date:"2026-02-16",heure:"14:10",ville:"Herbiers",rue:"27 Rue Saint Jacques",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-886814",commercial:"Lyna Belkessa",date:"2026-02-16",heure:"13:12",ville:"Mortagne Sur Sevre",rue:"21 Rue Du Bourneau",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-886702",commercial:"Pablo Grasset",date:"2026-02-13",heure:"18:53",ville:"Pont Pean",rue:"2 Avenue Colette Besson",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"RDV pris"},
{id:"f-886693",commercial:"Ronan Kombo",date:"2026-02-13",heure:"18:33",ville:"Orgeres",rue:"9 Impasse Des Hetres",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-886689",commercial:"Yannis Aboulfatah",date:"2026-02-13",heure:"18:22",ville:"Roche Sur Yon",rue:"60 Boulevard D Angleterre",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-886682",commercial:"Pablo Grasset",date:"2026-02-13",heure:"18:15",ville:"Orgeres",rue:"14 Rue Theophile Briant",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-886681",commercial:"Victor Moize",date:"2026-02-13",heure:"18:13",ville:"Sables D Olonne",rue:"3 Couree Des Grenouilles",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"En attente RDV"},
{id:"f-886662",commercial:"Djany Legrand",date:"2026-02-13",heure:"17:43",ville:"Saint Nazaire",rue:"1 Route De Trebale",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Annule"},
{id:"f-886593",commercial:"Djany Legrand",date:"2026-02-13",heure:"16:32",ville:"Saint Nazaire",rue:"1 Route De Trebale",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-886561",commercial:"Djany Legrand",date:"2026-02-13",heure:"15:53",ville:"Saint Nazaire",rue:"76 Rue Voltaire",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-886546",commercial:"Victor Moize",date:"2026-02-13",heure:"15:37",ville:"Sables D Olonne",rue:"8 Rue De La Belle Noue",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"RDV pris"},
{id:"f-886474",commercial:"Come Audonnet",date:"2026-02-13",heure:"14:05",ville:"Roche Sur Yon",rue:"38 Boulevard D Angleterre",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-886461",commercial:"Leo Merde",date:"2026-02-13",heure:"13:52",ville:"Roche Sur Yon",rue:"92 Rue Sadi Carnot",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-886440",commercial:"Sandra Pereira",date:"2026-02-13",heure:"13:32",ville:"Sables D Olonne",rue:"7 Residence Les Gilleries",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"En attente RDV"},
{id:"f-886438",commercial:"Djany Legrand",date:"2026-02-13",heure:"13:28",ville:"Saint Nazaire",rue:"5 Route De Trebale",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-886429",commercial:"Cheick Ouedraogo",date:"2026-02-13",heure:"13:19",ville:"Sables D Olonne",rue:"10 Rue Des Resedas",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-886330",commercial:"Leo Merde",date:"2026-02-12",heure:"20:19",ville:"Montaigu Vendee",rue:"13 Rue Du 8 Mai 1945",operator:"Free",type:"Fibre",box:"ULTRA",status:"Annule"},
{id:"f-886329",commercial:"Djany Legrand",date:"2026-02-12",heure:"20:05",ville:"Landes Genusson",rue:"14 Rue D Anjou",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-886324",commercial:"Ouissem Ouirini",date:"2026-02-12",heure:"19:20",ville:"Noyal Chatillon Sur Seiche",rue:"13 Rue De Saint Erblon",operator:"Free",type:"Fibre",box:"POP",status:"Annule"},
{id:"f-886293",commercial:"Djany Legrand",date:"2026-02-12",heure:"18:37",ville:"Landes Genusson",rue:"3 Rue Du Stade",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-886191",commercial:"Yannis Aboulfatah",date:"2026-02-12",heure:"16:42",ville:"Treize Septiers",rue:"22 Rue De La Litaudiere",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-886178",commercial:"Cheick Ouedraogo",date:"2026-02-12",heure:"16:20",ville:"Landes Genusson",rue:"33 Rue Eric Tabarly",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-886177",commercial:"Ilhan Kocak",date:"2026-02-12",heure:"16:19",ville:"Boissiere De Montaigu",rue:"1 Residence Arc En Ciel",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-886162",commercial:"Leo Merde",date:"2026-02-12",heure:"16:01",ville:"Montaigu Vendee",rue:"7 Rue Du 8 Mai 1945",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-886088",commercial:"Momed Ali",date:"2026-02-12",heure:"14:41",ville:"Boissiere De Montaigu",rue:"23 Rue Centrale",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-886085",commercial:"Come Audonnet",date:"2026-02-12",heure:"14:34",ville:"Treize Septiers",rue:"13 Impasse Des Pierrieres",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-885926",commercial:"Leo Merde",date:"2026-02-11",heure:"19:42",ville:"Roche Sur Yon",rue:"26 Rue Paul Doumer",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-885889",commercial:"Pablo Grasset",date:"2026-02-11",heure:"18:35",ville:"Pont Pean",rue:"2 Avenue Colette Besson",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-885851",commercial:"Leo Merde",date:"2026-02-11",heure:"17:44",ville:"Roche Sur Yon",rue:"26 Rue Paul Doumer",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-885809",commercial:"Leo Merde",date:"2026-02-11",heure:"16:55",ville:"Roche Sur Yon",rue:"26 Rue Paul Doumer",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-885782",commercial:"Momed Ali",date:"2026-02-11",heure:"16:26",ville:"Saint Nazaire",rue:"54 Boulevard Emile Broodcoorens",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-885750",commercial:"Djany Legrand",date:"2026-02-11",heure:"15:51",ville:"Saint Nazaire",rue:"23 Allee Barbara",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-885720",commercial:"Leo Merde",date:"2026-02-11",heure:"15:05",ville:"Roche Sur Yon",rue:"26 Rue Paul Doumer",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-885710",commercial:"Ronan Kombo",date:"2026-02-11",heure:"14:47",ville:"Fontenay Le Comte",rue:"10 Impasse Jean Gambier",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-885694",commercial:"Djany Legrand",date:"2026-02-11",heure:"14:30",ville:"Saint Nazaire",rue:"25 Rue Des Frenes",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-885656",commercial:"Momed Ali",date:"2026-02-11",heure:"13:39",ville:"Saint Nazaire",rue:"2 Allee Romy Schneider",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-885502",commercial:"Djany Legrand",date:"2026-02-10",heure:"19:26",ville:"Sables D Olonne",rue:"14 Rue Des Religieuses",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-885491",commercial:"Momed Ali",date:"2026-02-10",heure:"19:05",ville:"Sables D Olonne",rue:"68 Avenue D Anjou",operator:"Free",type:"Fibre",box:"ULTRA",status:"Annule"},
{id:"f-885475",commercial:"Ali Atf",date:"2026-02-10",heure:"18:35",ville:"Montgermont",rue:"31 Rue Jean Jaures",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-885420",commercial:"Momed Ali",date:"2026-02-10",heure:"17:23",ville:"Sables D Olonne",rue:"61 Avenue D Anjou",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-885384",commercial:"Sandra Pereira",date:"2026-02-10",heure:"16:48",ville:"Montgermont",rue:"2 Rue Benjamin Rabier",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"En attente RDV"},
{id:"f-885382",commercial:"Stephane Legrand",date:"2026-02-10",heure:"16:44",ville:"Sables D Olonne",rue:"18 Rue Amiral Vaugiraud",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-885373",commercial:"Abdellah Cheikh",date:"2026-02-10",heure:"16:38",ville:"Essarts En Bocage",rue:"18 Rue De La Ramee",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-885364",commercial:"Djany Legrand",date:"2026-02-10",heure:"16:26",ville:"Sables D Olonne",rue:"4 Avenue D Anjou",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-885318",commercial:"Eloise Meillerais",date:"2026-02-10",heure:"15:30",ville:"Marciac",rue:"2 Rue Saint Pierre",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-885289",commercial:"Yannis Aboulfatah",date:"2026-02-10",heure:"14:48",ville:"Roche Sur Yon",rue:"12 Rue Du Marechal Ney",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-885087",commercial:"Leo Merde",date:"2026-02-09",heure:"19:31",ville:"Roche Sur Yon",rue:"18 Rue D Alsace",operator:"Free",type:"Fibre",box:"POP",status:"Annule"},
{id:"f-885055",commercial:"Omar Mbengue",date:"2026-02-09",heure:"18:23",ville:"Challans",rue:"32 Rue Alphonse Daudet",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-885038",commercial:"Ouissem Ouirini",date:"2026-02-09",heure:"18:07",ville:"Challans",rue:"8 Boulevard Clemenceau",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-885027",commercial:"Abdellah Cheikh",date:"2026-02-09",heure:"17:56",ville:"Fontenay Le Comte",rue:"22 Rue Pierre Fouschier",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-885022",commercial:"Djany Legrand",date:"2026-02-09",heure:"17:51",ville:"Saint Nazaire",rue:"27 Allee Barbara",operator:"Free",type:"Fibre",box:"POP",status:"Annule"},
{id:"f-885003",commercial:"Mohamed Mehdi Larech",date:"2026-02-09",heure:"17:29",ville:"Fontenay Le Comte",rue:"3 Rue Thibaut Chabot",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-885002",commercial:"Lyna Belkessa",date:"2026-02-09",heure:"17:28",ville:"Fontenay Le Comte",rue:"124 Rue Des Loges",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-884997",commercial:"Paul Geriltault",date:"2026-02-09",heure:"17:23",ville:"Fontenay Le Comte",rue:"15 Rue De La Republique",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-884981",commercial:"Pablo Grasset",date:"2026-02-09",heure:"17:00",ville:"Challans",rue:"2 Rue Neptune",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-884974",commercial:"Omar Mbengue",date:"2026-02-09",heure:"16:48",ville:"Challans",rue:"7 Square Paul Verlaine",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-884934",commercial:"Yannis Aboulfatah",date:"2026-02-09",heure:"16:00",ville:"Roche Sur Yon",rue:"16 Rue De La Marne",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-884928",commercial:"Djany Legrand",date:"2026-02-09",heure:"15:54",ville:"Saint Nazaire",rue:"1 Rue Annie Girardot",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-884921",commercial:"Pablo Grasset",date:"2026-02-09",heure:"15:45",ville:"Challans",rue:"2 Rue Neptune",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-884869",commercial:"Pablo Grasset",date:"2026-02-09",heure:"14:46",ville:"Challans",rue:"2 Rue Neptune",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-884819",commercial:"Leo Merde",date:"2026-02-09",heure:"13:59",ville:"Vouvant",rue:"19 Impasse Du Noyer",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-884801",commercial:"Stephane Legrand",date:"2026-02-09",heure:"13:44",ville:"Saint Nazaire",rue:"74 Rue D Anjou",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-884785",commercial:"Paul Geriltault",date:"2026-02-09",heure:"13:39",ville:"Fontenay Le Comte",rue:"76 Rue De La Republique",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-884783",commercial:"Yannis Aboulfatah",date:"2026-02-09",heure:"13:33",ville:"Roche Sur Yon",rue:"45 Rue Bossuet",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-884699",commercial:"Leo Merde",date:"2026-02-09",heure:"11:37",ville:"Rives Du Fougerais",rue:"3 Rue Des Ormeaux",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-884655",commercial:"Djany Legrand",date:"2026-02-06",heure:"19:38",ville:"Montaigu Vendee",rue:"4 Rue De Matifeux",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-884630",commercial:"Djany Legrand",date:"2026-02-06",heure:"18:07",ville:"Montaigu Vendee",rue:"37 Rue Du Colonel Taylor",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-884578",commercial:"Leo Merde",date:"2026-02-06",heure:"16:44",ville:"Lucon",rue:"4 Rue Pasteur",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-884560",commercial:"Djany Legrand",date:"2026-02-06",heure:"16:16",ville:"Montaigu Vendee",rue:"37 Rue Du Colonel Taylor",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-884538",commercial:"Sandra Pereira",date:"2026-02-06",heure:"15:43",ville:"Chavagnes En Paillers",rue:"40 Cite Du Bois Foucaud",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-884491",commercial:"Stephane Legrand",date:"2026-02-06",heure:"14:56",ville:"Lucon",rue:"8 Rue Pasteur",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-884441",commercial:"Djany Legrand",date:"2026-02-06",heure:"14:06",ville:"Bruffiere",rue:"27 Rue Du General De Gaulle",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-884440",commercial:"Leo Merde",date:"2026-02-06",heure:"14:05",ville:"Lucon",rue:"13 Rue Camille Saint Saens",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-884429",commercial:"Sandra Pereira",date:"2026-02-06",heure:"13:45",ville:"Chavagnes En Paillers",rue:"19 Cite Du Bois Foucaud",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-884347",commercial:"Leo Merde",date:"2026-02-05",heure:"19:50",ville:"Roche Sur Yon",rue:"22 Place Viollet Le Duc",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"En attente RDV"},
{id:"f-884316",commercial:"Stephane Legrand",date:"2026-02-05",heure:"18:59",ville:"Lucon",rue:"6 Rue Pasteur",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-884303",commercial:"Djany Legrand",date:"2026-02-05",heure:"18:29",ville:"Pornic",rue:"20 Rue Du General De Gaulle",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-884279",commercial:"Stephane Legrand",date:"2026-02-05",heure:"17:56",ville:"Lucon",rue:"6 Rue Pasteur",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-884275",commercial:"William Goujon",date:"2026-02-05",heure:"17:48",ville:"Lucon",rue:"0 Cite Du Maine",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-884258",commercial:"Victor Moize",date:"2026-02-05",heure:"17:18",ville:"Haute Goulaine",rue:"19 Rue Des Epinettes",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-884253",commercial:"Momed Ali",date:"2026-02-05",heure:"17:07",ville:"Pornic",rue:"31 Rue Des Sables",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-884245",commercial:"Melodie Mendousse",date:"2026-02-05",heure:"16:50",ville:"Temple De Bretagne",rue:"10 Rue De La Metairie",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-884240",commercial:"Stephane Legrand",date:"2026-02-05",heure:"16:46",ville:"Lucon",rue:"1 Rue De La Paix",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-884177",commercial:"Djany Legrand",date:"2026-02-05",heure:"15:16",ville:"Pornic",rue:"2 Rue De La Marine",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-884112",commercial:"Djany Legrand",date:"2026-02-05",heure:"14:13",ville:"Pornic",rue:"5 Rue De L Ecluse",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-884069",commercial:"Pablo Grasset",date:"2026-02-05",heure:"13:33",ville:"Saint Malo Du Bois",rue:"40 Rue Du Tempyre",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-883897",commercial:"Djany Legrand",date:"2026-02-04",heure:"18:21",ville:"Saint Nazaire",rue:"2 Allee Des Albatros",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-883878",commercial:"Abdel Nouar",date:"2026-02-04",heure:"17:52",ville:"Chapelle Heulin",rue:"15 Allee Des Caudalies",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-883873",commercial:"Yannis Aboulfatah",date:"2026-02-04",heure:"17:47",ville:"Saint Nazaire",rue:"26 Rue De Vincennes",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-883825",commercial:"Abdellah Cheikh",date:"2026-02-04",heure:"16:41",ville:"Chapelle Heulin",rue:"13 Allee Des Caudalies",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-883823",commercial:"Djany Legrand",date:"2026-02-04",heure:"16:41",ville:"Saint Nazaire",rue:"20 Allee Des Albatros",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-883761",commercial:"Shana David",date:"2026-02-04",heure:"15:39",ville:"Saint Julien De Concelles",rue:"12 Impasse Du Froment",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-883701",commercial:"Leo Merde",date:"2026-02-04",heure:"14:40",ville:"Roche Sur Yon",rue:"115 Rue De La Simbrandiere",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-883668",commercial:"Djany Legrand",date:"2026-02-04",heure:"13:55",ville:"Saint Nazaire",rue:"12 Allee Des Albatros",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-883620",commercial:"Abdel Nouar",date:"2026-02-04",heure:"13:25",ville:"Chapelle Heulin",rue:"6 Rue Aristide Briand",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-883598",commercial:"Leo Merde",date:"2026-02-04",heure:"12:58",ville:"Roche Sur Yon",rue:"94 Avenue Picasso",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-883498",commercial:"Yannis Aboulfatah",date:"2026-02-03",heure:"18:55",ville:"Bernardiere",rue:"46 Rue Centrale",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-883453",commercial:"Stephane Legrand",date:"2026-02-03",heure:"18:06",ville:"Challans",rue:"42 Rue Carnot",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-883438",commercial:"Pablo Grasset",date:"2026-02-03",heure:"17:45",ville:"Challans",rue:"1 Boulevard Jean Yole",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-883357",commercial:"Stephane Legrand",date:"2026-02-03",heure:"16:12",ville:"Challans",rue:"42 Rue Carnot",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-883275",commercial:"Ilhan Kocak",date:"2026-02-03",heure:"14:57",ville:"Saint Laurent Sur Sevre",rue:"9 Rue Du Sacre Coeur",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-883263",commercial:"Djany Legrand",date:"2026-02-03",heure:"14:44",ville:"Saint Laurent Sur Sevre",rue:"44 Cite Bellevue",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-883221",commercial:"Ines Ouirini",date:"2026-02-03",heure:"14:05",ville:"Saint Laurent Sur Sevre",rue:"15 Rue Des Genets",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-883199",commercial:"Djany Legrand",date:"2026-02-03",heure:"13:41",ville:"Saint Laurent Sur Sevre",rue:"15 Cite Bellevue",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-883097",commercial:"Leo Merde",date:"2026-02-02",heure:"19:57",ville:"Roche Sur Yon",rue:"29 Rue Lily Et Nadia Boulanger",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-883077",commercial:"Djany Legrand",date:"2026-02-02",heure:"19:05",ville:"Cesson Sevigne",rue:"10 Rue De La Chalotais",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-883065",commercial:"Pablo Grasset",date:"2026-02-02",heure:"18:38",ville:"Cesson Sevigne",rue:"2 Boulevard Des Metairies",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-883008",commercial:"Djany Legrand",date:"2026-02-02",heure:"17:35",ville:"Cesson Sevigne",rue:"12 Rue De La Chalotais",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-882922",commercial:"Abdel Nouar",date:"2026-02-02",heure:"16:14",ville:"Saint Philbert De Grand Lieu",rue:"19 Rue Des Magnolias",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-882903",commercial:"Djany Legrand",date:"2026-02-02",heure:"15:54",ville:"Cesson Sevigne",rue:"12 Rue De La Chalotais",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-882879",commercial:"Sandra Pereira",date:"2026-02-02",heure:"15:34",ville:"Roche Sur Yon",rue:"81 Rue Albert Camus",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-882867",commercial:"Leo Merde",date:"2026-02-02",heure:"15:24",ville:"Roche Sur Yon",rue:"99 Rue Hubert Cailler",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-882853",commercial:"Ilhan Kocak",date:"2026-02-02",heure:"15:06",ville:"Saint Michel Chef Chef",rue:"8 Rue Du Petit Patureau",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-882818",commercial:"Djany Legrand",date:"2026-02-02",heure:"14:41",ville:"Cesson Sevigne",rue:"12 Rue De La Chalotais",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-882817",commercial:"Sandra Pereira",date:"2026-02-02",heure:"14:40",ville:"Roche Sur Yon",rue:"76 Rue Francoise Sagan",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-882785",commercial:"Leo Merde",date:"2026-02-02",heure:"14:13",ville:"Roche Sur Yon",rue:"2 Impasse Etienne Dolet",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-882740",commercial:"Ouissem Ouirini",date:"2026-02-02",heure:"13:37",ville:"Mortagne Sur Sevre",rue:"37 Cite Des Madeleines",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-882646",commercial:"Ali Atf",date:"2026-02-02",heure:"11:41",ville:"Savenay",rue:"49 Rue Madame Jan",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-882616",commercial:"Omar Mbengue",date:"2026-01-31",heure:"12:24",ville:"Vertou",rue:"11 Rue Du Laurier Fleuri",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-882612",commercial:"Sandra Pereira",date:"2026-01-30",heure:"19:46",ville:"Roche Sur Yon",rue:"79 Rue Albert Camus",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"RDV pris"},
{id:"f-882610",commercial:"Leo Merde",date:"2026-01-30",heure:"19:44",ville:"Roche Sur Yon",rue:"15 Rue Maurice Edgar Coindreau",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-882605",commercial:"Djany Legrand",date:"2026-01-30",heure:"19:04",ville:"Saint Nazaire",rue:"4 Rue De L Ile Du Pe",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-882592",commercial:"Ouissem Ouirini",date:"2026-01-30",heure:"18:19",ville:"Montoir De Bretagne",rue:"17 Rue Du Dauphine",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-882579",commercial:"Djany Legrand",date:"2026-01-30",heure:"17:58",ville:"Saint Nazaire",rue:"2 Rue De L Ile Du Pe",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-882568",commercial:"Victor Moize",date:"2026-01-30",heure:"17:29",ville:"Saint Mesmin",rue:"4 Impasse Du Clos",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-882561",commercial:"William Goujon",date:"2026-01-30",heure:"17:10",ville:"Saint Nazaire",rue:"52 Rue Edgar Degas",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-882549",commercial:"Leo Merde",date:"2026-01-30",heure:"16:47",ville:"Roche Sur Yon",rue:"144 Rue Hubert Cailler",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-882517",commercial:"Djany Legrand",date:"2026-01-30",heure:"16:05",ville:"Saint Nazaire",rue:"7 Rue Paul Emile Victor",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-882495",commercial:"Mohamed Mehdi Larech",date:"2026-01-30",heure:"15:30",ville:"Donges",rue:"2 Rue D Artois",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-882489",commercial:"Stephane Legrand",date:"2026-01-30",heure:"15:23",ville:"Donges",rue:"25 Rue Nelson Mandela",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-882465",commercial:"Djany Legrand",date:"2026-01-30",heure:"14:53",ville:"Saint Nazaire",rue:"47 Rue Du Plessis",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-882463",commercial:"Pablo Grasset",date:"2026-01-30",heure:"14:51",ville:"Saint Nazaire",rue:"2 Rue Auguste Piccard",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-882454",commercial:"Sandra Pereira",date:"2026-01-30",heure:"14:34",ville:"Roche Sur Yon",rue:"10 Rue Georges Bernanos",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-882447",commercial:"Leo Merde",date:"2026-01-30",heure:"14:22",ville:"Roche Sur Yon",rue:"15 Rue Maurice Edgar Coindreau",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-882424",commercial:"Yannis Aboulfatah",date:"2026-01-30",heure:"13:39",ville:"Roche Sur Yon",rue:"60 Impasse Jacques Demy",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-882413",commercial:"Titouan Salaun",date:"2026-01-30",heure:"13:22",ville:"Donges",rue:"7 Rue Albert Calmette",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-882410",commercial:"Djany Legrand",date:"2026-01-30",heure:"13:16",ville:"Saint Nazaire",rue:"57 Rue Du Plessis",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-882389",commercial:"Titouan Salaun",date:"2026-01-30",heure:"12:43",ville:"Villeneuve En Retz",rue:"7 Rue Sans Charite",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-882332",commercial:"Ali Atf",date:"2026-01-29",heure:"19:39",ville:"Roche Sur Yon",rue:"19 Rue D Arcole",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-882277",commercial:"Ali Atf",date:"2026-01-29",heure:"18:09",ville:"Roche Sur Yon",rue:"21 Rue D Arcole",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-882245",commercial:"Stephane Legrand",date:"2026-01-29",heure:"17:45",ville:"Pouzauges",rue:"13 Impasse Des Ournais",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-882194",commercial:"Yannis Aboulfatah",date:"2026-01-29",heure:"17:08",ville:"Roche Sur Yon",rue:"20 Rue De La Fee Melusine",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-882170",commercial:"Sandra Pereira",date:"2026-01-29",heure:"16:48",ville:"Pouzauges",rue:"20 Rue Des Cordiers",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-882164",commercial:"Lyna Belkessa",date:"2026-01-29",heure:"16:36",ville:"Pouzauges",rue:"42 Rue Du Bourg Belard",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-882097",commercial:"Sandra Pereira",date:"2026-01-29",heure:"15:47",ville:"Pouzauges",rue:"6 Avenue De La Grande Versaine",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-882086",commercial:"Titouan Salaun",date:"2026-01-29",heure:"15:31",ville:"Villeneuve En Retz",rue:"13 Rue Des Marins",operator:"Free",type:"Fibre",box:"POP",status:"Annule"},
{id:"f-882055",commercial:"Sandra Pereira",date:"2026-01-29",heure:"15:04",ville:"Pouzauges",rue:"8 Avenue De La Grande Versaine",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-882030",commercial:"Ali Atf",date:"2026-01-29",heure:"14:32",ville:"Roche Sur Yon",rue:"19 Rue D Arcole",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-882000",commercial:"Lyna Belkessa",date:"2026-01-29",heure:"13:53",ville:"Pouzauges",rue:"46 Rue Catherine De Thouars",operator:"Free",type:"Fibre",box:"POP",status:"RDV pris"},
{id:"f-881971",commercial:"Ines Ouirini",date:"2026-01-29",heure:"13:32",ville:"Trignac",rue:"11 Allee Des Peupliers",operator:"Free",type:"Fibre",box:"ULTRA",status:"Annule"},
{id:"f-881862",commercial:"Sandra Pereira",date:"2026-01-28",heure:"19:27",ville:"Saint Michel En L Herm",rue:"48 Rue Des Anciens Quais",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-881826",commercial:"Momed Ali",date:"2026-01-28",heure:"18:21",ville:"Montreverd",rue:"7 Rue Du Moulin",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-881764",commercial:"Stephane Legrand",date:"2026-01-28",heure:"17:28",ville:"Saint Michel En L Herm",rue:"6 Boulevard Pasteur",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-881693",commercial:"William Goujon",date:"2026-01-28",heure:"16:28",ville:"Guerande",rue:"17 Allee De La Callune",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-881664",commercial:"Stephane Legrand",date:"2026-01-28",heure:"16:00",ville:"Saint Michel En L Herm",rue:"9 Allee Des Pictons",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-881581",commercial:"William Goujon",date:"2026-01-28",heure:"14:49",ville:"Guerande",rue:"14 Allee De La Callune",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-881527",commercial:"Momed Ali",date:"2026-01-28",heure:"13:42",ville:"Montreverd",rue:"14 Rue Des Mesanges",operator:"Free",type:"Fibre",box:"ULTRA",status:"Annule"},
{id:"f-881421",commercial:"Stephane Legrand",date:"2026-01-27",heure:"19:25",ville:"Saint Michel En L Herm",rue:"8 Rue Basse",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-881420",commercial:"Ali Atf",date:"2026-01-27",heure:"19:20",ville:"Roche Sur Yon",rue:"37 Rue Gutenberg",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-881411",commercial:"Leo Merde",date:"2026-01-27",heure:"19:04",ville:"Roche Sur Yon",rue:"39 Rue Gutenberg",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-881401",commercial:"Yannis Aboulfatah",date:"2026-01-27",heure:"18:47",ville:"Roche Sur Yon",rue:"77 Boulevard Jean Yole",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-881323",commercial:"Stephane Legrand",date:"2026-01-27",heure:"17:38",ville:"Saint Michel En L Herm",rue:"2 Rue De Lattre De Tassigny",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-881288",commercial:"Lyna Belkessa",date:"2026-01-27",heure:"17:04",ville:"Saint Michel En L Herm",rue:"59 Rue Des Anciens Quais",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-881283",commercial:"Ali Atf",date:"2026-01-27",heure:"16:59",ville:"Roche Sur Yon",rue:"21 Boulevard Jean Yole",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-881278",commercial:"Mohamed Mehdi Larech",date:"2026-01-27",heure:"16:56",ville:"Chauche",rue:"11 Rue De La Roche",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-881271",commercial:"Pablo Grasset",date:"2026-01-27",heure:"16:50",ville:"Saint Michel En L Herm",rue:"26 Route De La Mer",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-881225",commercial:"Lyna Belkessa",date:"2026-01-27",heure:"16:15",ville:"Saint Michel En L Herm",rue:"112 Rue Des Anciens Quais",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-881212",commercial:"Yannis Aboulfatah",date:"2026-01-27",heure:"16:04",ville:"Roche Sur Yon",rue:"71 Boulevard Jean Yole",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-881156",commercial:"Mohamed Mehdi Larech",date:"2026-01-27",heure:"14:49",ville:"Chauche",rue:"14 Rue Des Vallons",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Annule"},
{id:"f-881128",commercial:"Leo Merde",date:"2026-01-27",heure:"14:27",ville:"Roche Sur Yon",rue:"39 Rue Gutenberg",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"En attente RDV"},
{id:"f-881122",commercial:"Djany Legrand",date:"2026-01-27",heure:"14:12",ville:"Saint Fulgent",rue:"12 Cite Du Fondereau",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-881110",commercial:"Momed Ali",date:"2026-01-27",heure:"13:58",ville:"Saint Fulgent",rue:"12 Rue De La Tuilerie",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-881064",commercial:"Lyna Belkessa",date:"2026-01-27",heure:"12:54",ville:"Saint Michel En L Herm",rue:"15 Rue Des Anciens Quais",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-881053",commercial:"Leo Merde",date:"2026-01-27",heure:"12:44",ville:"Roche Sur Yon",rue:"51 Rue Gutenberg",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-880973",commercial:"Djany Legrand",date:"2026-01-26",heure:"18:44",ville:"Aizenay",rue:"1 Rue Monseigneur Gendreau",operator:"Free",type:"Fibre",box:"ULTRA",status:"Annule"},
{id:"f-880971",commercial:"William Goujon",date:"2026-01-26",heure:"18:42",ville:"Chanverrie",rue:"9 Avenue Du 11 Novembre",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-880963",commercial:"Omar Mbengue",date:"2026-01-26",heure:"18:27",ville:"Aizenay",rue:"14 Rue Du Vieux Manoir",operator:"Free",type:"Fibre",box:"POP",status:"Annule"},
{id:"f-880942",commercial:"Yannis Aboulfatah",date:"2026-01-26",heure:"18:03",ville:"Essarts En Bocage",rue:"6 Rue De L Artiste",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-880933",commercial:"Djany Legrand",date:"2026-01-26",heure:"17:51",ville:"Aizenay",rue:"3 Rue De L Aire Buron",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-880914",commercial:"Titouan Salaun",date:"2026-01-26",heure:"17:27",ville:"Copechagniere",rue:"1 Rue De Louche Murette",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-880895",commercial:"Pablo Grasset",date:"2026-01-26",heure:"16:59",ville:"Saint Denis La Chevasse",rue:"4 Chemin Des Temples",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-880888",commercial:"Mohamed Mehdi Larech",date:"2026-01-26",heure:"16:52",ville:"Chanverrie",rue:"2 Impasse Des Genets",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-880813",commercial:"Melodie Mendousse",date:"2026-01-26",heure:"15:25",ville:"Chanverrie",rue:"9 Avenue Du 11 Novembre",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-880766",commercial:"Titouan Salaun",date:"2026-01-26",heure:"14:44",ville:"Copechagniere",rue:"2 Rue Des Jardins",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-880719",commercial:"Omar Mbengue",date:"2026-01-26",heure:"13:58",ville:"Aizenay",rue:"15 Cite Bel Air",operator:"Free",type:"Fibre",box:"ULTRA",status:"Annule"},
{id:"f-880600",commercial:"Yannis Aboulfatah",date:"2026-01-23",heure:"19:13",ville:"Roche Sur Yon",rue:"60 Rue Des Pyramides",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-880590",commercial:"Lyna Belkessa",date:"2026-01-23",heure:"18:25",ville:"Roche Sur Yon",rue:"73 Rue Abbe Pierre Arnaud",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-880550",commercial:"Djany Legrand",date:"2026-01-23",heure:"17:34",ville:"Saint Nazaire",rue:"9 Rue Ambroise Pare",operator:"Free",type:"Fibre",box:"ULTRA",status:"Annule"},
{id:"f-880440",commercial:"William Goujon",date:"2026-01-23",heure:"14:32",ville:"Saint Nazaire",rue:"33 Rue Leonard De Vinci",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-880414",commercial:"Sandra Pereira",date:"2026-01-23",heure:"13:45",ville:"Roche Sur Yon",rue:"35 Rue D Iena",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-880402",commercial:"Djany Legrand",date:"2026-01-23",heure:"13:18",ville:"Saint Nazaire",rue:"12 Allee Des Pluviers",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-880393",commercial:"William Goujon",date:"2026-01-23",heure:"13:03",ville:"Saint Nazaire",rue:"44 Rue Jean Bart",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-880388",commercial:"Yannis Aboulfatah",date:"2026-01-23",heure:"12:45",ville:"Roche Sur Yon",rue:"60 Rue Des Pyramides",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-880325",commercial:"Djany Legrand",date:"2026-01-22",heure:"19:21",ville:"Essarts En Bocage",rue:"30 Residence Les Primeveres",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-880316",commercial:"Sandra Pereira",date:"2026-01-22",heure:"19:09",ville:"Herbergement",rue:"7 Rue Frederic Chopin",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-880273",commercial:"Djany Legrand",date:"2026-01-22",heure:"18:08",ville:"Essarts En Bocage",rue:"1 Residence Les Primeveres",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-880267",commercial:"Pablo Grasset",date:"2026-01-22",heure:"18:03",ville:"Herbergement",rue:"4 Rue Des Canaris",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-880250",commercial:"Djany Legrand",date:"2026-01-22",heure:"17:37",ville:"Essarts En Bocage",rue:"57 Residence Les Primeveres",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-880224",commercial:"Pablo Grasset",date:"2026-01-22",heure:"17:12",ville:"Herbergement",rue:"37 Rue Des Canaris",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-880141",commercial:"William Goujon",date:"2026-01-22",heure:"15:43",ville:"Ferriere",rue:"17 Rue De La Moraine",operator:"Free",type:"Fibre",box:"ULTRA",status:"Annule"},
{id:"f-880135",commercial:"Djany Legrand",date:"2026-01-22",heure:"15:42",ville:"Essarts En Bocage",rue:"16 Residence Les Primeveres",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-880124",commercial:"Pablo Grasset",date:"2026-01-22",heure:"15:34",ville:"Herbergement",rue:"26 Rue Des Grives",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-880003",commercial:"Lyna Belkessa",date:"2026-01-22",heure:"13:32",ville:"Herbergement",rue:"22 Rue Paul Verlaine",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-879920",commercial:"Pablo Grasset",date:"2026-01-22",heure:"12:35",ville:"Herbergement",rue:"15 Rue Des Canaris",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-879903",commercial:"Pablo Grasset",date:"2026-01-22",heure:"11:56",ville:"Herbergement",rue:"9 Rue Des Canaris",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-879853",commercial:"Leo Merde",date:"2026-01-21",heure:"19:38",ville:"Roche Sur Yon",rue:"138 Rue Gaston Ramon",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-879834",commercial:"Sandra Pereira",date:"2026-01-21",heure:"19:03",ville:"Sables D Olonne",rue:"2 Cite Charcot",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-879824",commercial:"Ali Atf",date:"2026-01-21",heure:"18:45",ville:"Roche Sur Yon",rue:"76 Rue Jean Launois",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-879787",commercial:"Melodie Mendousse",date:"2026-01-21",heure:"18:16",ville:"Bellevigny",rue:"7 Cite Des Nouettes",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-879769",commercial:"Djany Legrand",date:"2026-01-21",heure:"17:49",ville:"Challans",rue:"1 Rue De La Noue",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-879732",commercial:"Leo Merde",date:"2026-01-21",heure:"17:05",ville:"Roche Sur Yon",rue:"138 Rue Gaston Ramon",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-879731",commercial:"Sandra Pereira",date:"2026-01-21",heure:"17:05",ville:"Sables D Olonne",rue:"1 Cite Charcot",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-879726",commercial:"William Goujon",date:"2026-01-21",heure:"17:01",ville:"Bellevigny",rue:"6 Impasse Des Sorbiers",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-879717",commercial:"Yannis Aboulfatah",date:"2026-01-21",heure:"16:54",ville:"Roche Sur Yon",rue:"83 Rue Des Robretieres",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-879698",commercial:"Lyna Belkessa",date:"2026-01-21",heure:"16:38",ville:"Saint Denis La Chevasse",rue:"19 Rue Reaumur",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Annule"},
{id:"f-879663",commercial:"Djany Legrand",date:"2026-01-21",heure:"16:00",ville:"Challans",rue:"7 Passage Leopold Basteau",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-879660",commercial:"Yannis Aboulfatah",date:"2026-01-21",heure:"16:00",ville:"Roche Sur Yon",rue:"87 Rue Des Robretieres",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-879642",commercial:"Leo Merde",date:"2026-01-21",heure:"15:46",ville:"Roche Sur Yon",rue:"138 Rue Gaston Ramon",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-879621",commercial:"Djany Legrand",date:"2026-01-21",heure:"15:11",ville:"Challans",rue:"7 Passage Leopold Basteau",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-879590",commercial:"Yannis Aboulfatah",date:"2026-01-21",heure:"14:43",ville:"Roche Sur Yon",rue:"35 Rue Marengo",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-879585",commercial:"Ali Atf",date:"2026-01-21",heure:"14:33",ville:"Roche Sur Yon",rue:"38 Rue Jean Launois",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-879579",commercial:"Lyna Belkessa",date:"2026-01-21",heure:"14:28",ville:"Saint Denis La Chevasse",rue:"32 Rue Des Tilleuls",operator:"Free",type:"Fibre",box:"ULTRA",status:"RDV pris"},
{id:"f-879568",commercial:"Mohamed Mehdi Larech",date:"2026-01-21",heure:"14:16",ville:"Challans",rue:"49 Rue Gambetta",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-879546",commercial:"William Goujon",date:"2026-01-21",heure:"13:56",ville:"Bellevigny",rue:"2 Rue De La Grande Noue",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Annule"},
{id:"f-879533",commercial:"Ali Atf",date:"2026-01-21",heure:"13:36",ville:"Roche Sur Yon",rue:"36 Rue Jean Launois",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-879515",commercial:"Djany Legrand",date:"2026-01-21",heure:"13:14",ville:"Challans",rue:"2 Passage Leopold Basteau",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-879425",commercial:"Melodie Mendousse",date:"2026-01-20",heure:"20:03",ville:"Chantonnay",rue:"40 Cite Des Croisettes",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-879407",commercial:"William Goujon",date:"2026-01-20",heure:"18:57",ville:"Chantonnay",rue:"4 Cite Des Croisettes",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-879351",commercial:"Leo Merde",date:"2026-01-20",heure:"17:51",ville:"Roche Sur Yon",rue:"112 Boulevard Edouard Branly",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-879346",commercial:"Djany Legrand",date:"2026-01-20",heure:"17:40",ville:"Chantonnay",rue:"2 Cite Des 5 Fours",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-879323",commercial:"Victor Moize",date:"2026-01-20",heure:"17:12",ville:"Campbon",rue:"18 Chemin De L Arceau",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-879308",commercial:"Victor Moize",date:"2026-01-20",heure:"16:55",ville:"Campbon",rue:"47 Rue De Bouvron",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-879300",commercial:"Melodie Mendousse",date:"2026-01-20",heure:"16:46",ville:"Chantonnay",rue:"107 Cite Des Croisettes",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-879299",commercial:"Djany Legrand",date:"2026-01-20",heure:"16:46",ville:"Chantonnay",rue:"2 Cite Des 5 Fours",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-879246",commercial:"Sandra Pereira",date:"2026-01-20",heure:"15:40",ville:"Roche Sur Yon",rue:"103 Boulevard Edouard Branly",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-879243",commercial:"William Goujon",date:"2026-01-20",heure:"15:37",ville:"Chantonnay",rue:"74 Cite Des Croisettes",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-879218",commercial:"Pablo Grasset",date:"2026-01-20",heure:"15:10",ville:"Chantonnay",rue:"15 Rue De La Plaine",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-879215",commercial:"Ali Atf",date:"2026-01-20",heure:"15:05",ville:"Savenay",rue:"9 Allee Roland Garros",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-879136",commercial:"Yannis Aboulfatah",date:"2026-01-20",heure:"13:24",ville:"Roche Sur Yon",rue:"10 Rue Des Myosotis",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-879046",commercial:"Melodie Mendousse",date:"2026-01-19",heure:"19:06",ville:"Ferriere",rue:"6 Impasse Des Alises",operator:"Free",type:"Fibre",box:"ULTRA",status:"Annule"},
{id:"f-879020",commercial:"William Goujon",date:"2026-01-19",heure:"18:22",ville:"Saint Nazaire",rue:"22 Rue Joseph Marie Jacquard",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-879016",commercial:"Sandra Pereira",date:"2026-01-19",heure:"18:17",ville:"Crossac",rue:"19 Rue De L Ancienne Gare",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-879003",commercial:"Leo Merde",date:"2026-01-19",heure:"17:58",ville:"Crossac",rue:"17 Rue De La Fontaine Saint Jean",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-878998",commercial:"Victor Moize",date:"2026-01-19",heure:"17:50",ville:"Ferriere",rue:"28 Rue Des Roses",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-878951",commercial:"Melodie Mendousse",date:"2026-01-19",heure:"17:01",ville:"Ferriere",rue:"19 Rue Des Baies Sauvages",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-878947",commercial:"William Goujon",date:"2026-01-19",heure:"16:58",ville:"Saint Nazaire",rue:"23 Rue Joseph Marie Jacquard",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-878930",commercial:"Sandra Pereira",date:"2026-01-19",heure:"16:43",ville:"Crossac",rue:"19 Rue De L Ancienne Gare",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Annule"},
{id:"f-878897",commercial:"Leo Merde",date:"2026-01-19",heure:"16:18",ville:"Crossac",rue:"110 Route De Donges",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-878883",commercial:"Leo Merde",date:"2026-01-19",heure:"16:04",ville:"Crossac",rue:"2 Route Des Rivieres",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-878855",commercial:"Sandra Pereira",date:"2026-01-19",heure:"15:13",ville:"Crossac",rue:"9 Rue De L Ancienne Gare",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-878664",commercial:"Pablo Grasset",date:"2026-01-19",heure:"14:07",ville:"Saint Nazaire",rue:"45 Rue De Cardurand",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-878657",commercial:"Lyna Belkessa",date:"2026-01-19",heure:"14:00",ville:"Crossac",rue:"3 Allee Des Noisetiers",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-878547",commercial:"Momed Ali",date:"2026-01-17",heure:"15:40",ville:"Saint Nazaire",rue:"42 Rue Jacques Offenbach",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-878543",commercial:"Titouan Salaun",date:"2026-01-17",heure:"14:10",ville:"Tiffauges",rue:"34 Rue Saint Aubin",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-878534",commercial:"Stephane Legrand",date:"2026-01-17",heure:"13:22",ville:"Saint Nazaire",rue:"34 Rue Jacques Offenbach",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-878454",commercial:"Momed Ali",date:"2026-01-16",heure:"17:48",ville:"Roche Sur Yon",rue:"56 Rue Jean Launois",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-878448",commercial:"Titouan Salaun",date:"2026-01-16",heure:"17:39",ville:"Tiffauges",rue:"2 Rue Des Acacias",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-878439",commercial:"Lyna Belkessa",date:"2026-01-16",heure:"17:24",ville:"Roche Sur Yon",rue:"217 Boulevard Du Marechal Leclerc",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-878425",commercial:"Victor Moize",date:"2026-01-16",heure:"17:17",ville:"Roche Sur Yon",rue:"98 Rue Robert Schuman",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-878421",commercial:"Mohamed Mehdi Larech",date:"2026-01-16",heure:"17:08",ville:"Roche Sur Yon",rue:"58 Boulevard D Austerlitz",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-878393",commercial:"Djany Legrand",date:"2026-01-16",heure:"16:20",ville:"Roche Sur Yon",rue:"4 Impasse Octave De Rochebrune",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-878374",commercial:"Mohamed Mehdi Larech",date:"2026-01-16",heure:"15:46",ville:"Roche Sur Yon",rue:"60 Rue Des Pyramides",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-878363",commercial:"Titouan Salaun",date:"2026-01-16",heure:"15:33",ville:"Tiffauges",rue:"17 Rue Des Eglantiers",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-878320",commercial:"Djany Legrand",date:"2026-01-16",heure:"14:31",ville:"Roche Sur Yon",rue:"80 Rue Du Marechal Juin",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-878273",commercial:"Momed Ali",date:"2026-01-16",heure:"13:19",ville:"Roche Sur Yon",rue:"76 Rue Jean Launois",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-878265",commercial:"William Goujon",date:"2026-01-16",heure:"13:09",ville:"Roche Sur Yon",rue:"22 Rue Pierre Bacqua",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-878201",commercial:"Titouan Salaun",date:"2026-01-15",heure:"19:40",ville:"Roche Sur Yon",rue:"14 Rue Ferdinand Buisson",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-878181",commercial:"Stephane Legrand",date:"2026-01-15",heure:"18:50",ville:"Roche Sur Yon",rue:"117 Boulevard Edouard Branly",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-878096",commercial:"Pablo Grasset",date:"2026-01-15",heure:"16:44",ville:"Bruz",rue:"9 Square De Belle Ile",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-878052",commercial:"Mohamed Mehdi Larech",date:"2026-01-15",heure:"15:58",ville:"Bruz",rue:"9 Rue Theodore Albert",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-878030",commercial:"Djany Legrand",date:"2026-01-15",heure:"15:29",ville:"Bruz",rue:"47 Avenue De L Europe",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-878014",commercial:"Sandra Pereira",date:"2026-01-15",heure:"15:12",ville:"Jarnac",rue:"0 Place De Saintes",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-877956",commercial:"Djany Legrand",date:"2026-01-15",heure:"13:58",ville:"Bruz",rue:"49 Avenue De L Europe",operator:"Free",type:"Fibre",box:"ULTRA",status:"Annule"},
{id:"f-877795",commercial:"Titouan Salaun",date:"2026-01-14",heure:"18:04",ville:"Rives De L Yon",rue:"2 Rue Mathevet",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-877794",commercial:"Pablo Grasset",date:"2026-01-14",heure:"18:01",ville:"Chauve",rue:"10 Rue Des Lilas",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-877792",commercial:"William Goujon",date:"2026-01-14",heure:"17:59",ville:"Rives De L Yon",rue:"12 Rue Des Camelias",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-877698",commercial:"Stephane Legrand",date:"2026-01-14",heure:"16:22",ville:"Vertou",rue:"5 Rue Du Poitou",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-877717",commercial:"Djany Legrand",date:"2026-01-14",heure:"16:42",ville:"Chauve",rue:"5 Rue De Saint Pere",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-877576",commercial:"Ines Ouirini",date:"2026-01-14",heure:"14:18",ville:"Vue",rue:"42 Route De Paimboeuf",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-877561",commercial:"Victor Moize",date:"2026-01-14",heure:"14:12",ville:"Rives De L Yon",rue:"14 Impasse Des Cols Verts",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-877522",commercial:"Djany Legrand",date:"2026-01-14",heure:"13:35",ville:"Chauve",rue:"11 Rue De Pornic",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-877397",commercial:"Lyna Belkessa",date:"2026-01-13",heure:"19:40",ville:"Cognac",rue:"21 Rue Des Marchands",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-877393",commercial:"Momed Ali",date:"2026-01-13",heure:"19:31",ville:"Montaigu Vendee",rue:"37 Rue Du Colonel Taylor",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-877390",commercial:"Omar Mbengue",date:"2026-01-13",heure:"19:18",ville:"Montaigu Vendee",rue:"2 Rue Francois Truffaut",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-877382",commercial:"Titouan Salaun",date:"2026-01-13",heure:"19:05",ville:"Montaigu Vendee",rue:"26 Rue Des Chaumes",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-877342",commercial:"William Goujon",date:"2026-01-13",heure:"18:32",ville:"Aubigny Les Clouzeaux",rue:"5 Rue Louise Michel",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"En attente RDV"},
{id:"f-877338",commercial:"Djany Legrand",date:"2026-01-13",heure:"18:24",ville:"Montaigu Vendee",rue:"35 Rue De L Ocean",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-877302",commercial:"Momed Ali",date:"2026-01-13",heure:"17:46",ville:"Montaigu Vendee",rue:"23 Rue De Matifeux",operator:"Free",type:"Fibre",box:"POP",status:"Annule"},
{id:"f-877294",commercial:"Sandra Pereira",date:"2026-01-13",heure:"17:31",ville:"Jarnac",rue:"2 Allee De L Enclos Des Lys",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-877288",commercial:"Victor Moize",date:"2026-01-13",heure:"17:27",ville:"Aubigny Les Clouzeaux",rue:"4 Rue Nicolas Copernic",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-877287",commercial:"Djany Legrand",date:"2026-01-13",heure:"17:25",ville:"Montaigu Vendee",rue:"35 Rue De L Ocean",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-877274",commercial:"William Goujon",date:"2026-01-13",heure:"17:17",ville:"Aubigny Les Clouzeaux",rue:"3 Rue Du Champ Buchet",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-877233",commercial:"Djany Legrand",date:"2026-01-13",heure:"16:28",ville:"Montaigu Vendee",rue:"3 Rue Des Hauts De Mirville",operator:"Free",type:"Fibre",box:"ULTRA",status:"Annule"},
{id:"f-877216",commercial:"Victor Moize",date:"2026-01-13",heure:"16:01",ville:"Roche Sur Yon",rue:"24 Impasse Theophile Gautier",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-877182",commercial:"Djany Legrand",date:"2026-01-13",heure:"15:12",ville:"Montaigu Vendee",rue:"35 Rue De L Ocean",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-877115",commercial:"William Goujon",date:"2026-01-13",heure:"13:59",ville:"Aubigny Les Clouzeaux",rue:"25 Rue De L Ecole",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-877113",commercial:"Momed Ali",date:"2026-01-13",heure:"13:58",ville:"Montaigu Vendee",rue:"5 Rue Des Moineaux",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-877078",commercial:"Victor Moize",date:"2026-01-13",heure:"13:24",ville:"Aubigny Les Clouzeaux",rue:"7 Allee Andromede",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-877069",commercial:"Sandra Pereira",date:"2026-01-13",heure:"13:13",ville:"Jarnac",rue:"0 Place De Saintes",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-877016",commercial:"Lyna Belkessa",date:"2026-01-13",heure:"12:14",ville:"Cognac",rue:"47 Rue De Londres",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Annule"},
{id:"f-876993",commercial:"Lyna Belkessa",date:"2026-01-13",heure:"11:40",ville:"Cognac",rue:"38 Rue De Londres",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"En attente RDV"},
{id:"f-876976",commercial:"Leo Merde",date:"2026-01-12",heure:"19:58",ville:"Saint Vincent Sterlanges",rue:"5 Rue De Bel Air",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-876968",commercial:"Leo Merde",date:"2026-01-12",heure:"19:13",ville:"Saint Vincent Sterlanges",rue:"0 Residence Du Chapeau Rouge",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-876966",commercial:"Omar Mbengue",date:"2026-01-12",heure:"19:09",ville:"Roche Sur Yon",rue:"10 Rue Jean Francois Champollion",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-876937",commercial:"Omar Mbengue",date:"2026-01-12",heure:"18:19",ville:"Roche Sur Yon",rue:"10 Rue Jean Francois Champollion",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-876924",commercial:"Momed Ali",date:"2026-01-12",heure:"18:05",ville:"Roche Sur Yon",rue:"10 Rue Georges Pompidou",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-876921",commercial:"Stephane Legrand",date:"2026-01-12",heure:"18:00",ville:"Roche Sur Yon",rue:"16 Residence De L Horbetoux",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-876920",commercial:"Leo Merde",date:"2026-01-12",heure:"18:00",ville:"Saint Vincent Sterlanges",rue:"3 Place Des Pommiers",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-876877",commercial:"Victor Moize",date:"2026-01-12",heure:"17:08",ville:"Roche Sur Yon",rue:"21 Rue Des Pyramides",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-876848",commercial:"Leo Merde",date:"2026-01-12",heure:"16:32",ville:"Saint Vincent Sterlanges",rue:"2 Rue Des Tonnelles",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-876827",commercial:"Lyna Belkessa",date:"2026-01-12",heure:"16:12",ville:"Cognac",rue:"16 Rue Du Pere Augustin",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-876791",commercial:"Omar Mbengue",date:"2026-01-12",heure:"15:37",ville:"Roche Sur Yon",rue:"12 Impasse Gustave Courbet",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-876789",commercial:"Stephane Legrand",date:"2026-01-12",heure:"15:34",ville:"Roche Sur Yon",rue:"20 Residence De L Horbetoux",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-876765",commercial:"Lyna Belkessa",date:"2026-01-12",heure:"15:01",ville:"Cognac",rue:"4 Rue Alsace Lorraine",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-876748",commercial:"Sandra Pereira",date:"2026-01-12",heure:"14:52",ville:"Cognac",rue:"10 Rue Louis Guillet",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-876731",commercial:"Stephane Legrand",date:"2026-01-12",heure:"14:25",ville:"Roche Sur Yon",rue:"1 Residence De L Horbetoux",operator:"Free",type:"Fibre",box:"POP",status:"En attente RDV"},
{id:"f-876722",commercial:"Lyna Belkessa",date:"2026-01-12",heure:"14:16",ville:"Cognac",rue:"55 Rue Du Sablon",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-876666",commercial:"William Goujon",date:"2026-01-12",heure:"13:34",ville:"Roche Sur Yon",rue:"2 Place De Mirville",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-876649",commercial:"Victor Moize",date:"2026-01-12",heure:"13:10",ville:"Roche Sur Yon",rue:"21 Rue D Arcole",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-876621",commercial:"Djany Legrand",date:"2026-01-12",heure:"12:40",ville:"Roche Sur Yon",rue:"5 Impasse Du Cottage",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Annule"},
{id:"f-876603",commercial:"Momed Ali",date:"2026-01-12",heure:"12:32",ville:"Roche Sur Yon",rue:"6 Passage Konrad Adenauer",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-876583",commercial:"Lyna Belkessa",date:"2026-01-12",heure:"11:44",ville:"Cognac",rue:"6 Rue De Liverpool",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-876547",commercial:"Victor Moize",date:"2026-01-10",heure:"16:08",ville:"Roche Sur Yon",rue:"57 Rue Georges Brassens",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-876543",commercial:"Momed Ali",date:"2026-01-10",heure:"15:50",ville:"Chaize Le Vicomte",rue:"14 Rue Du Puits",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-876539",commercial:"Pablo Grasset",date:"2026-01-10",heure:"14:33",ville:"Roche Sur Yon",rue:"19 Impasse Des 100 Jours",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-876537",commercial:"Ouissem Ouirini",date:"2026-01-10",heure:"14:17",ville:"Campbon",rue:"7 Rue Du Docteur Paul Verliac",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-876536",commercial:"William Goujon",date:"2026-01-10",heure:"14:15",ville:"Quilly",rue:"25 Grande Rue",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-876535",commercial:"Victor Moize",date:"2026-01-10",heure:"14:08",ville:"Roche Sur Yon",rue:"50 Rue Georges Brassens",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-876529",commercial:"Yannis Aboulfatah",date:"2026-01-10",heure:"13:36",ville:"Campbon",rue:"7 Rue De La Gruette",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-876528",commercial:"Ouissem Ouirini",date:"2026-01-10",heure:"13:28",ville:"Campbon",rue:"3 Rue Du Docteur Paul Verliac",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-876471",commercial:"Ali Atf",date:"2026-01-09",heure:"18:11",ville:"Pontchateau",rue:"31 Rue Maurice Sambron",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-876410",commercial:"Leo Merde",date:"2026-01-09",heure:"16:57",ville:"Pontchateau",rue:"13 Rue Nantaise",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-876394",commercial:"Abdellah Cheikh",date:"2026-01-09",heure:"16:42",ville:"Mouilleron Le Captif",rue:"2 Rue De La Rose Des Vents",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-876331",commercial:"Mohamed Mehdi Larech",date:"2026-01-09",heure:"15:28",ville:"Saint Nazaire",rue:"8 Allee Des Pingouins",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-876295",commercial:"Stephane Legrand",date:"2026-01-09",heure:"14:39",ville:"Saint Nazaire",rue:"97 Boulevard Du Docteur Rene Laennec",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-876293",commercial:"Mohamed Mehdi Larech",date:"2026-01-09",heure:"14:36",ville:"Saint Nazaire",rue:"4 Allee Des Pingouins",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-876268",commercial:"Yannis Aboulfatah",date:"2026-01-09",heure:"14:16",ville:"Saint Nazaire",rue:"2 Rue Louis Joseph Gay Lussac",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Annule"},
{id:"f-876250",commercial:"Stephane Legrand",date:"2026-01-09",heure:"13:53",ville:"Saint Nazaire",rue:"97 Boulevard Du Docteur Rene Laennec",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-876242",commercial:"William Goujon",date:"2026-01-09",heure:"13:32",ville:"Venansault",rue:"4 Impasse Des Noisetiers",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-876227",commercial:"Stephane Legrand",date:"2026-01-09",heure:"13:14",ville:"Saint Nazaire",rue:"97 Boulevard Du Docteur Rene Laennec",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-876200",commercial:"Ali Atf",date:"2026-01-09",heure:"12:51",ville:"Pontchateau",rue:"12 Allee Des Coquelicots",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-876117",commercial:"Leo Merde",date:"2026-01-08",heure:"18:35",ville:"Roche Sur Yon",rue:"52 Rue De La Vergne",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-876108",commercial:"Ali Atf",date:"2026-01-08",heure:"18:14",ville:"Roche Sur Yon",rue:"48 Rue De La Vergne",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-876098",commercial:"Leo Merde",date:"2026-01-08",heure:"18:07",ville:"Roche Sur Yon",rue:"52 Rue De La Vergne",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-876057",commercial:"Leo Merde",date:"2026-01-08",heure:"17:25",ville:"Roche Sur Yon",rue:"52 Rue De La Vergne",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-876052",commercial:"William Goujon",date:"2026-01-08",heure:"17:21",ville:"Herbiers",rue:"47 Rue De Clisson",operator:"Free",type:"Fibre",box:"ULTRA",status:"Annule"},
{id:"f-876048",commercial:"Victor Moize",date:"2026-01-08",heure:"17:18",ville:"Roche Sur Yon",rue:"91 Rue Louis Lumiere",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-875998",commercial:"William Goujon",date:"2026-01-08",heure:"16:19",ville:"Herbiers",rue:"49 Rue De Clisson",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-875979",commercial:"Melodie Mendousse",date:"2026-01-08",heure:"15:53",ville:"Herbiers",rue:"5 Cite Des Alouettes",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"En attente RDV"},
{id:"f-875966",commercial:"Momed Ali",date:"2026-01-08",heure:"15:39",ville:"Herbiers",rue:"3 Rue Francois Villon",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-875927",commercial:"Titouan Salaun",date:"2026-01-08",heure:"14:58",ville:"Roche Sur Yon",rue:"55 Rue Marengo",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-875898",commercial:"Yannis Aboulfatah",date:"2026-01-08",heure:"14:14",ville:"Herbiers",rue:"5 Residence La Demoiselle",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-875882",commercial:"Momed Ali",date:"2026-01-08",heure:"13:56",ville:"Herbiers",rue:"51 Rue Francois Villon",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-875868",commercial:"Victor Moize",date:"2026-01-08",heure:"13:42",ville:"Roche Sur Yon",rue:"53 Rue Louis Lumiere",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-875838",commercial:"Victor Moize",date:"2026-01-08",heure:"12:58",ville:"Roche Sur Yon",rue:"50 Rue Louis Lumiere",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-875766",commercial:"Omar Mbengue",date:"2026-01-07",heure:"20:11",ville:"Pontchateau",rue:"22 Route De Vannes",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-875760",commercial:"Omar Mbengue",date:"2026-01-07",heure:"19:28",ville:"Pontchateau",rue:"22 Route De Vannes",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-875732",commercial:"Leo Merde",date:"2026-01-07",heure:"18:23",ville:"Pontchateau",rue:"4 Rue De La Cadivais",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-875730",commercial:"Ali Atf",date:"2026-01-07",heure:"18:19",ville:"Pontchateau",rue:"11 Rue Maurice Sambron",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-875700",commercial:"Pablo Grasset",date:"2026-01-07",heure:"17:36",ville:"Saint Nazaire",rue:"12 Rue Des Troenes",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-875689",commercial:"Ali Atf",date:"2026-01-07",heure:"17:19",ville:"Pontchateau",rue:"11 Rue Maurice Sambron",operator:"Free",type:"Fibre",box:"ULTRA",status:"En attente RDV"},
{id:"f-875658",commercial:"Pablo Grasset",date:"2026-01-07",heure:"16:36",ville:"Saint Nazaire",rue:"12 Rue Des Troenes",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-875630",commercial:"Leo Merde",date:"2026-01-07",heure:"15:57",ville:"Pontchateau",rue:"32 Rue Des Mesanges",operator:"Free",type:"Fibre",box:"POP",status:"Branche"},
{id:"f-875626",commercial:"Momed Ali",date:"2026-01-07",heure:"15:53",ville:"Savenay",rue:"34 Rue Joseph Malegue",operator:"Free",type:"Fibre",box:"ULTRA",status:"Branche"},
{id:"f-875605",commercial:"Melodie Mendousse",date:"2026-01-07",heure:"15:30",ville:"Savenay",rue:"4 Rue Marigny",operator:"Free",type:"Fibre",box:"ULTRA",status:"Annule"},
{id:"f-875576",commercial:"Ali Atf",date:"2026-01-07",heure:"14:50",ville:"Pontchateau",rue:"4 Rue De La Julotterie",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"},
{id:"f-875541",commercial:"Leo Merde",date:"2026-01-07",heure:"14:12",ville:"Pontchateau",rue:"4 Rue De La Cadivais",operator:"Free",type:"Fibre",box:"ULTRA_LIGHT",status:"Branche"}
];
}

function makeVTAContracts() {
return [
{id:"vta-892842",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-03-06",heure:"17:18",ville:"Marans",rue:"7 RUEGAMBETTA",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-892526",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-03-05",heure:"18:56",ville:"Thouars",rue:"3 RUE DEROME",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-892510",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-03-05",heure:"18:32",ville:"Thouars",rue:"12 RUE DENFERT ROCHEREAU",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-892495",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-03-05",heure:"18:11",ville:"Thouars",rue:"17 IMPASSEDES MERISIERS",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-892443",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-03-05",heure:"17:09",ville:"Thouars",rue:"63 RUE DE LATREMOILLE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-892425",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-03-05",heure:"16:55",ville:"Thouars Pfo42732258Lk Viyas Valerie 0684018987 Pop Vente Valid�E",rue:"61 RUE DE LATREMOILLE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-892377",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-03-05",heure:"16:00",ville:"Thouars",rue:"14 ALLEE DESROSEAUX",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-892373",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-03-05",heure:"15:53",ville:"Thouars",rue:"10 RUE JULESRENARD",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-892361",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-03-05",heure:"15:45",ville:"Thouars Pfo42731661H0 Slimane Sami 0656796158 Ultra_Light_Player_Pop Vente Valid�E",rue:"10 RUE JULESRENARD",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-892344",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-03-05",heure:"15:28",ville:"Thouars",rue:"10 RUE DU PRESIDENT TYNDO",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-892332",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-03-05",heure:"15:13",ville:"Thouars",rue:"10 RUE DE LATREMOILLE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-892249",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-03-05",heure:"13:52",ville:"Thouars",rue:"14 RUE DE LATREMOILLE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-892032",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-03-04",heure:"17:50",ville:"Vouille",rue:"55 RUE DUGRAND PUITS",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-892030",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-03-04",heure:"17:44",ville:"Aigondigne",rue:"23 CHEMIN DE LA BARBINIERE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-892025",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-03-04",heure:"17:36",ville:"Niort",rue:"7 RUE C MARIE DE LA CONDAMINE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-892013",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-03-04",heure:"17:20",ville:"Niort",rue:"4 RUE C MARIE DE LA CONDAMINE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-892003",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-03-04",heure:"17:07",ville:"Vouille",rue:"3 RUE DE LAFLAGEOLLE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-891972",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-03-04",heure:"16:36",ville:"Aigondigne",rue:"22 CHEMIN DE LA BARBINIERE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-891911",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-03-04",heure:"15:25",ville:"Chauray Pfo42725484Bf Hebert Helene 0760647735 Pop Vente Valid�E",rue:"47 RUE SIMONEVEIL",operator:"Free",type:"Fibre",status:"En cours"},
{id:"vta-891904",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-03-04",heure:"15:19",ville:"Chauray Pfo42725417Hk Hebert Helene 0760647735 Pop Vente Valid�E",rue:"47 RUE SIMONEVEIL",operator:"Free",type:"Fibre",status:"En cours"},
{id:"vta-891890",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-03-04",heure:"15:01",ville:"Chauray Pfo4272525503 Hebert Helene 0760647735 Pop Vente Valid�E",rue:"47 RUE SIMONEVEIL",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-891873",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-03-04",heure:"14:44",ville:"Chauray Pfo42725140Vq Charpentreau Nino 0760647735 Pop Vente Valid�E",rue:"47 RUE SIMONEVEIL",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-891864",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-03-04",heure:"14:37",ville:"Chauray",rue:"146 BOULEVARD DES ARANDELLES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-891854",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-03-04",heure:"14:33",ville:"Chauray",rue:"20 RUE BERTHEMORISSOT",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-891592",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-03-03",heure:"18:46",ville:"Thouars",rue:"11 PLACE CLEMENT MENARD",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-891541",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-03-03",heure:"17:52",ville:"Thouars",rue:"15 CITE DESLACS",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-891521",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-03-03",heure:"17:26",ville:"Bressuire",rue:"9 RUE DESBORDERIES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-891511",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-03-03",heure:"17:15",ville:"Thouars",rue:"11 CITE DESLACS",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-891477",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-03-03",heure:"16:38",ville:"Thouars",rue:"16 CITE DESLACS",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-891470",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-03-03",heure:"16:24",ville:"Thouars",rue:"4 CITE DESLACS",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-891346",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-03-03",heure:"14:04",ville:"Thouars",rue:"18 RUE CAMILLE PELLETAN",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-891167",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-03-02",heure:"18:41",ville:"Niort",rue:"241 RUE DERIBRAY",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-891161",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-03-02",heure:"18:35",ville:"Bressuire",rue:"17 ALLEE GEORGES CHARPAK",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-891148",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-03-02",heure:"18:09",ville:"Niort",rue:"20 RUE HENRISELLIER",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-891116",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-03-02",heure:"17:35",ville:"Bressuire",rue:"64 BOULEVARD DE LA REPUBLIQUE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-891090",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-03-02",heure:"17:06",ville:"Niort",rue:"1 RUE CAMILLE FLAMMARION",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-891072",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-03-02",heure:"16:43",ville:"Niort",rue:"14 RUE JEAN BAPTISTE DELAMBRE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-891053",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-03-02",heure:"16:25",ville:"Rochelle",rue:"18 RUE JEAN PIERRE BLANCHARD",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890997",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-03-02",heure:"15:24",ville:"Niort",rue:"18 RUE JULESSIEGFRIED",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890898",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-03-02",heure:"13:31",ville:"Aiffres",rue:"19 IMPASSE DES ROUGES GORGES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890877",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-03-02",heure:"13:09",ville:"Aiffres",rue:"27 IMPASSE DES ROUGES GORGES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890862",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-03-02",heure:"12:45",ville:"Aiffres Pfo42711573Io Valeze Anais 0630572171 Ultra_Player_Pop Vente Valid�E",rue:"248 RUE DUFIEF SOLEIL",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890761",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-27",heure:"19:23",ville:"Bressuire",rue:"7 RUE DEJUILLOT",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890611",commercial:"Adam El Jazouli",vtaCode:"vta-aeljazouli",vtaResolved:false,date:"2026-02-27",heure:"14:34",ville:"Bressuire",rue:"77 RUE LEOPOLD MAROLLEAU",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890429",commercial:"Adam El Jazouli",vtaCode:"vta-aeljazouli",vtaResolved:false,date:"2026-02-26",heure:"18:59",ville:"Bessines Pfo42696470Kz Bremand Alain 0631860812 Pop Vente Valid�E",rue:"5 RUE DUBOURG",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890426",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-02-26",heure:"18:54",ville:"Rochelle",rue:"4 RUE JEAN PIERRE BLANCHARD",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890424",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-26",heure:"18:45",ville:"",rue:"69 RUE DUMARAIS Loretz d argenton FO36625528 PFO426964399O Trefoux Joelle 0777772337 POP inscription ok 18:42:29 vta-aeljazouli TALC 5 RUE DUBOURG",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890421",commercial:"Adam El Jazouli",vtaCode:"vta-aeljazouli",vtaResolved:false,date:"2026-02-26",heure:"18:42",ville:"Bessines Pfo426964360O Bremand Alain 0631860812 Pop Vente Valid�E",rue:"5 RUE DUBOURG",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890418",commercial:"Adam El Jazouli",vtaCode:"vta-aeljazouli",vtaResolved:false,date:"2026-02-26",heure:"18:38",ville:"",rue:"28 RUE DES 3MOINEAUX Saint symphorien FO36625506 PFO42696375ZG Le Du Bernadette 0615140599 POP 2026-03-04 RDV 2026-03- 11 inscription ok",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890413",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-02-26",heure:"18:33",ville:"Rochelle",rue:"20 AVENUE DEPARIS",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890401",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-02-26",heure:"18:05",ville:"Rochelle",rue:"12 AVENUE DEPARIS",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890398",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-26",heure:"18:04",ville:"",rue:"59 RUE DUMARAIS Loretz d argenton FO36625302 PFO42696176T4 Clairgeau Lydie 0778022042 ULTRA_LIGHT_PLAYER_POP r�sili� 18:04:03 vta-rgrasset TALC 5 RUE DE LAFREGATE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890396",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-26",heure:"18:04",ville:"Lagord",rue:"5 RUE DE LAFREGATE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890379",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-02-26",heure:"17:40",ville:"Rochelle",rue:"10 AVENUE DEPARIS",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890376",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-02-26",heure:"17:33",ville:"Rochelle Pfo426959660T Villemont Marie Pierre 0669188386 Pop Vente Valid�E",rue:"1 RUE DE LAFILATURE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890367",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-02-26",heure:"17:24",ville:"Frontenay",rue:"49 CITE LESTONNELLES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890358",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-26",heure:"17:16",ville:"",rue:"63 RUE DESBOULANGERS Loretz d argenton FO36624990 PFO42695800G3 Girault Ga�lle 0678725911 ULTRA_PLAYER_POP inscription ok 17:12:13 vta-zourhalm TALC 13 RUE DUMOULIN",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890354",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-02-26",heure:"17:12",ville:"Val En Vignes",rue:"13 RUE DUMOULIN",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890317",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-26",heure:"16:32",ville:"",rue:"20 RUE DUMARAIS Loretz d argenton FO36624694 PFO42695484C7 Renelier Marcel 0676076222 ULTRA_LIGHT_PLAYER_POP inscription ok 16:28:24 vta-bdjaballah TALC 17 CITE LESTONNELLES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890313",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-02-26",heure:"16:28",ville:"Frontenay",rue:"17 CITE LESTONNELLES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890309",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-02-26",heure:"16:22",ville:"Rochelle",rue:"36 RUE LEMOYNE D IBERVILLE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890302",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-02-26",heure:"16:14",ville:"Thouars",rue:"1 ALLEE JULESRENARD",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890287",commercial:"Adam El Jazouli",vtaCode:"vta-aeljazouli",vtaResolved:false,date:"2026-02-26",heure:"15:44",ville:"",rue:"31 RUE DES 3MOINEAUX Saint symphorien FO36624417 PFO42695135DZ DIOUF Matar 0616841350 ULTRA_PLAYER_POP 2026-03-02 SyncOK 2026- 03-06 connexion ok",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890281",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-02-26",heure:"15:31",ville:"Rochelle",rue:"36 RUE LEMOYNE D IBERVILLE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890274",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-02-26",heure:"15:29",ville:"Rochelle",rue:"12 AVENUE DES GRANDES VARENNES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890273",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-02-26",heure:"15:29",ville:"Frontenay",rue:"43 CITE LESTONNELLES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890258",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-02-26",heure:"15:06",ville:"Frontenay",rue:"42 CITE LESTONNELLES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890207",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-02-26",heure:"14:19",ville:"Rochelle",rue:"14 AVENUE DES GRANDES VARENNES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890181",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-02-26",heure:"13:37",ville:"Rochelle",rue:"24 AVENUE DES GRANDES VARENNES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890067",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-02-25",heure:"19:37",ville:"Niort",rue:"5 ALLEE DESCAPUCINES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890049",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-25",heure:"18:56",ville:"Niort",rue:"7 ALLEE DESCAPUCINES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-890048",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-02-25",heure:"18:54",ville:"Niort",rue:"5 ALLEE DESCAPUCINES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889987",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-25",heure:"17:51",ville:"Niort",rue:"24 RUE GEORGES CLEMENCEAU",operator:"Free",type:"Fibre",status:"En cours"},
{id:"vta-889952",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-02-25",heure:"17:09",ville:"Niort",rue:"10 RUE CHARLES AMEDEE CHABOSSEAU",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889918",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-25",heure:"16:32",ville:"Lagord",rue:"32 RUE DU VOILIER CHARENTE MARITIME",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889873",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-02-25",heure:"15:54",ville:"Rochelle Pfo42690188R0 Bilek Jessica 0684032961 Ultra_Player_Pop Mcafee(1) Vente Valid�E",rue:"4 RUE JEAN PIERRE BLANCHARD",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889823",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-25",heure:"15:07",ville:"Niort",rue:"47 RUEMIRABEAU",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889802",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-02-25",heure:"14:44",ville:"Bressuire",rue:"6 RUE DE LA CURE SAINT JEAN",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889783",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-02-25",heure:"14:18",ville:"Rochelle Pfo42689310Eq Ben Youssef 0781956788 Pop Vente Valid�E",rue:"20 RUE JEAN PIERRE BLANCHARD",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889782",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-02-25",heure:"14:17",ville:"Rochelle",rue:"16 RUE JEAN PIERRE BLANCHARD",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889780",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-02-25",heure:"14:16",ville:"Niort",rue:"61 RUE VALENTIN HAUY",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889755",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-02-25",heure:"13:49",ville:"Rochelle",rue:"7 RUE JULESCHERET",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889750",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-02-25",heure:"13:43",ville:"Rochelle",rue:"20 RUE JEAN PIERRE BLANCHARD",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889730",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-25",heure:"13:29",ville:"Niort",rue:"27 RUE SAINTJUST",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889717",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-25",heure:"13:19",ville:"Niort Pfo42688875Hq Laplace Boinot Emilie 0743515928 Ultra_Player_Pop Vente Valid�E",rue:"27 RUE SAINTJUST",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889697",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-25",heure:"12:58",ville:"Bressuire",rue:"3 RUE DE LATOURETTE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889675",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-25",heure:"12:40",ville:"Rochelle",rue:"81 RUEBRAILLE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889662",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-02-25",heure:"12:26",ville:"Rochelle",rue:"13 RUE JULESCHERET",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889632",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-02-25",heure:"12:01",ville:"Rochelle",rue:"13 RUE JULESCHERET",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889618",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-02-25",heure:"11:24",ville:"Rochelle",rue:"13 RUE JULESCHERET",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889613",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-02-25",heure:"11:07",ville:"Rochelle Pfo42687885Tc Chaumont Angelina 0643117452 Ultra_Player_Pop Vente Valid�E",rue:"13 RUE JULESCHERET",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889596",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-02-25",heure:"10:15",ville:"Rochelle",rue:"15 RUE JULESCHERET",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889548",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-02-24",heure:"18:25",ville:"Rochelle Pfo42685797Ku Gonfreville Raphael 0651262329 Ultra_Light_Player_Pop Vente Valid�E",rue:"60 RUEBRAILLE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889534",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-02-24",heure:"18:11",ville:"Bressuire",rue:"16 ALLEE DESSOUCIS",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889509",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-02-24",heure:"17:42",ville:"Rochelle",rue:"2 RUE CHARLES PERCIER",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889475",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-02-24",heure:"17:25",ville:"Bressuire",rue:"24 CHEMIN DEMAUGRAIN",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889460",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-02-24",heure:"17:04",ville:"Bressuire",rue:"20 RUE DE LHUMELET",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889421",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-24",heure:"16:10",ville:"Rochelle",rue:"184 AVENUE DU LIEUTENANT COLONEL BERNIER",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889420",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-02-24",heure:"16:09",ville:"Rochelle",rue:"11 ALLEE DEBRUXELLES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889415",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-02-24",heure:"16:03",ville:"Niort",rue:"1 SQUARE MADAME DE MAINTENON",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889397",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-02-24",heure:"15:40",ville:"Niort",rue:"10 RUE DEPIERRE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889396",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-24",heure:"15:40",ville:"Niort",rue:"1 SQUARE MADAME DE MAINTENON",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889380",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-02-24",heure:"15:22",ville:"Bressuire",rue:"8 RUE DESCOULIES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889362",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-24",heure:"15:06",ville:"Niort",rue:"1 SQUARE MADAME DE MAINTENON",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889353",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-02-24",heure:"14:50",ville:"Rochelle",rue:"16 RUE JEAN PIERRE BLANCHARD",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889307",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-24",heure:"14:08",ville:"Niort",rue:"2 SQUARE MADAME DE MAINTENON",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889277",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-02-24",heure:"13:43",ville:"Rochelle",rue:"24 AVENUE DULUXEMBOURG",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889268",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-02-24",heure:"13:34",ville:"Niort",rue:"20 RUE DEPIERRE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889266",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-24",heure:"13:31",ville:"Niort",rue:"1 SQUAREPLAISANCE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889258",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-02-24",heure:"13:27",ville:"Rochelle",rue:"18 RUE JEAN PIERRE BLANCHARD",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889253",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-02-24",heure:"13:24",ville:"Bressuire",rue:"12 RUE DESCOULIES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889217",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-24",heure:"12:51",ville:"Rochelle",rue:"59 RUEBRAILLE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889207",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-02-24",heure:"12:41",ville:"Rochelle",rue:"18 RUE JEAN PIERRE BLANCHARD",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889175",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-24",heure:"11:43",ville:"Rochelle",rue:"81 RUEBRAILLE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889161",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-24",heure:"11:14",ville:"Rochelle Pfo42682385Ma Rioual Josiane 0631283155 Ultra_Light_Player_Pop Mcafee(2) Vente Valid�E",rue:"81 RUEBRAILLE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889159",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-02-24",heure:"11:13",ville:"Rochelle",rue:"6 AVENUE DULUXEMBOURG",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889157",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-02-24",heure:"11:08",ville:"Rochelle Pfo42682247Df Sandrine Poinfon 0749583810 Ultra_Player_Pop Mcafee(2) Vente Valid�E",rue:"6 AVENUE DULUXEMBOURG",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889134",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-02-24",heure:"10:19",ville:"Rochelle",rue:"2 AVENUE DULUXEMBOURG",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889095",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-02-23",heure:"18:35",ville:"Vouhe",rue:"21 RUE DE LAGRAVETTE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889067",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-02-23",heure:"18:07",ville:"Niort",rue:"16 RUE GEORGES MELIES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889058",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-23",heure:"17:49",ville:"Niort",rue:"16 RUE GEORGES MELIES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889048",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-02-23",heure:"17:42",ville:"Niort",rue:"4 SQUARE MADAME DE MAINTENON",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-889038",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-02-23",heure:"17:33",ville:"Niort",rue:"6 RUE BARTHELEMY THIMONNIER",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-888982",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-02-23",heure:"16:45",ville:"Niort",rue:"14 PLACELOUIS JOUVET",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-888974",commercial:"Adam El Jazouli",vtaCode:"vta-aeljazouli",vtaResolved:false,date:"2026-02-23",heure:"16:35",ville:"Niort Pfo42679284Rz Guignard Enzo 0628915324 Ultra_Player_Pop Vente Valid�E",rue:"33 RUE JEAN DE LA FONTAINE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-888965",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-02-23",heure:"16:25",ville:"Niort",rue:"3 SQUARE MADAME DE MAINTENON",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-888925",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-02-23",heure:"16:00",ville:"Marans",rue:"14 RUE HENRITOUTANT",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-888911",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-02-23",heure:"15:43",ville:"Marans",rue:"59 SQUARE DUCLOS RAISON",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-888904",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-23",heure:"15:33",ville:"Marans",rue:"7 RUEGAMBETTA",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-888897",commercial:"Adam El Jazouli",vtaCode:"vta-aeljazouli",vtaResolved:false,date:"2026-02-23",heure:"15:26",ville:"Niort",rue:"50 RUE DESPRES FAUCHER",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-888881",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-02-23",heure:"15:11",ville:"Niort",rue:"4 SQUARE MADAME DE MAINTENON",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-888876",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-02-23",heure:"15:08",ville:"Marans",rue:"61 SQUARE DUCLOS RAISON",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-888853",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-02-23",heure:"14:45",ville:"Niort",rue:"4 PLACE LOUISJOUVET",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-888844",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-02-23",heure:"14:37",ville:"Marans",rue:"39 RUE ERNESTBONNEAU",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-888838",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-23",heure:"14:31",ville:"Niort",rue:"4 PLACE LOUISJOUVET",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-888833",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-02-23",heure:"14:26",ville:"Marans",rue:"73 SQUARE DUCLOS RAISON",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-888831",commercial:"Adam El Jazouli",vtaCode:"vta-aeljazouli",vtaResolved:false,date:"2026-02-23",heure:"14:24",ville:"Niort Pfo42677956Hj Dupr� Cloe 0634491631 Ultra_Light_Player_Pop Vente Valid�E",rue:"50 RUE DESPRES FAUCHER",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-888818",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-02-23",heure:"14:16",ville:"Niort",rue:"4 SQUARE MADAME DE MAINTENON",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-888816",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-02-23",heure:"14:13",ville:"Marans",rue:"38 RUE DALIGRE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-888810",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-02-23",heure:"14:06",ville:"Marans Pfo42677741Yv Achile Begarin 0650790157 Pop Mcafee(2) Vente Valid�E",rue:"38 RUE DALIGRE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-888797",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-23",heure:"13:49",ville:"Niort",rue:"6 PLACE LOUISJOUVET",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-888796",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-02-23",heure:"13:48",ville:"Niort",rue:"2 IMPASSE ANDRE AMPERE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-888790",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-23",heure:"13:42",ville:"Marans",rue:"36 RUE DE LAGREVE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-888782",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-02-23",heure:"13:32",ville:"Marans",rue:"31 RUE DALIGRE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-888764",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-02-23",heure:"13:14",ville:"Marans",rue:"2 RUE DESFOURS",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-888761",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-02-23",heure:"13:12",ville:"Niort",rue:"4 SQUARE MADAME DE MAINTENON",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-888760",commercial:"Adam El Jazouli",vtaCode:"vta-aeljazouli",vtaResolved:false,date:"2026-02-23",heure:"13:12",ville:"Niort",rue:"8 RUE DESPRES FAUCHER",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-888753",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-02-23",heure:"13:04",ville:"Niort",rue:"6 PLACE LOUISJOUVET",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-888744",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-02-23",heure:"12:59",ville:"Marans",rue:"47 AVENUE PAUL COUZINET",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-888738",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-23",heure:"12:52",ville:"Marans",rue:"1 RUE DES 3CHANDELIERS",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-888735",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-02-23",heure:"12:49",ville:"Marans",rue:"3 RUE DALIGRE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-887974",commercial:"vta-sakhannich",vtaCode:"vta-sakhannich",vtaResolved:false,date:"2026-02-19",heure:"11:30",ville:"Rochelle",rue:"48 RUE DE LA MARE A LA BESSE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-887580",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-02-17",heure:"19:21",ville:"",rue:"1 RUE DE LAVERSENNE Moncoutant sur sevre FO36587924 PFO426538213Y GEFFARD Marie chantal 0637978733 ULTRA_LIGHT_PLAYER_POP 2026-02-19 SyncOK 2026- 02-27 connexion ok",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-887562",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-17",heure:"18:55",ville:"Courlay",rue:"27 RUE SAINTELOI",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-887558",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-02-17",heure:"18:46",ville:"",rue:"2 RUE DE LAPAIX Moncoutant sur sevre FO36587784 PFO426536903L Nathalie Nebbout 0785451963 ULTRA_PLAYER_POP 2026-02-24 SyncOK 2026- 03-04 connexion ok",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-887542",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-02-17",heure:"18:25",ville:"",rue:"14 RUE DESCOQUELICOTS Moncoutant sur sevre FO36587547 PFO42653415KH Zouga ndoutome Cornelia julie 0759452819 POP 2026-02-19 SyncOK 2026- 03-02 connexion ok",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-887533",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-02-17",heure:"18:16",ville:"",rue:"4 RUE DUGAZON Moncoutant sur sevre FO36587625 PFO42653444F1 BAUGET Bernard 0631075398 ULTRA_LIGHT_PLAYER_POP 2026-02-23 SyncOK 2026- 02-27 connexion ok",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-887485",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-17",heure:"17:28",ville:"Cirieres",rue:"22 RUE DESNOISETIERS",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-887481",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-17",heure:"17:27",ville:"Courlay",rue:"42 RUE SAINTELOI",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-887446",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-02-17",heure:"16:48",ville:"",rue:"13 RUE DESCOQUELICOTS Moncoutant sur sevre FO36586805 PFO426525763Q Objois Beatrice 0784048459 ULTRA_PLAYER_POP 2026-02-19 SyncOK 2026- 02-25 connexion ok",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-887443",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-17",heure:"16:44",ville:"Cirieres",rue:"24 RUE DUPOINT DU JOUR",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-887402",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-17",heure:"16:08",ville:"",rue:"66 AVENUE DU MARECHAL JUIN Moncoutant sur sevre",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-887399",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-17",heure:"16:04",ville:"Courlay",rue:"46 RUE SAINTELOI",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-887373",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-17",heure:"15:38",ville:"Cirieres",rue:"1 RUE DUPOINT DU JOUR",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-887337",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-02-17",heure:"14:58",ville:"",rue:"2 RUE DESCOQUELICOTS Moncoutant sur sevre FO36586023 PFO42651575YL Lhommd� Jocelyne 0682930980 ULTRA_LIGHT_PLAYER_POP inscription ok 14:51:57 vta-aballuteaud TALC 3 RUE DUDOUE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-887328",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-02-17",heure:"14:51",ville:"",rue:"3 RUE DUDOUE Moncoutant sur sevre FO36585878 PFO42651516BQ GUILLET Magalie 0760740959 ULTRA_LIGHT_PLAYER_POP inscription ok 14:41:23",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-887289",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-02-17",heure:"14:05",ville:"",rue:"12 RUE DE LAVERSENNE Moncoutant sur sevre FO36585515 PFO42651140S8 BENEST Christophe 0777427296 POP r�sili� 13:44:37 vta-hnouar TALC 10 RUE DESDEPORTES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-887273",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-02-17",heure:"13:44",ville:"",rue:"10 RUE DESDEPORTES Moncoutant sur sevre FO36585588 PFO42651018JT Ferret J�r�me 0620183730 ULTRA_LIGHT_PLAYER_POP 2026-02-19 SyncOK 2026- 02-26 connexion ok",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-887215",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-17",heure:"13:04",ville:"Cirieres",rue:"7 ALLEE DEBEAUREGARD",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-886667",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-13",heure:"17:46",ville:"Royan",rue:"7 RUE ALBERTCAMUS",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-886616",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-13",heure:"16:43",ville:"Royan",rue:"7 RUE ALBERTCAMUS",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-886555",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-02-13",heure:"15:45",ville:"Royan",rue:"15 RUE DE LACLIE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-886484",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-13",heure:"14:19",ville:"Royan",rue:"5 RUE ALBERTCAMUS",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-886376",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-02-13",heure:"12:14",ville:"Royan",rue:"6 RUE DESLOUTRES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-886238",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-12",heure:"17:43",ville:"Royan",rue:"67 AVENUEDANIEL HEDDE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-886111",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-02-12",heure:"15:14",ville:"Royan",rue:"68 BOULEVARDDE LA MARNE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-886067",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-12",heure:"14:08",ville:"Royan",rue:"68 BOULEVARDDE LA MARNE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-886028",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-02-12",heure:"13:18",ville:"Royan",rue:"68 BOULEVARDDE LA MARNE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885928",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-11",heure:"19:45",ville:"Royan",rue:"70 AVENUEDANIEL HEDDE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885902",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-11",heure:"18:59",ville:"Royan",rue:"70 AVENUEDANIEL HEDDE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885890",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-02-11",heure:"18:36",ville:"",rue:"25 AVENUE DU GENERAL FAUCHER Saint maixent l",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885865",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-11",heure:"18:02",ville:"Royan",rue:"70 AVENUEDANIEL HEDDE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885857",commercial:"Adam El Jazouli",vtaCode:"vta-aeljazouli",vtaResolved:false,date:"2026-02-11",heure:"17:50",ville:"Exireuil Pfo42624766Mh Larzet Estelle 0667761477 Ultra_Player_Pop Vente Valid�E",rue:"7 RUE FRANCOIS COUPERIN",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885848",commercial:"Adam El Jazouli",vtaCode:"vta-aeljazouli",vtaResolved:false,date:"2026-02-11",heure:"17:43",ville:"Exireuil",rue:"7 RUE FRANCOIS COUPERIN",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885843",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-02-11",heure:"17:40",ville:"",rue:"25 AVENUE DU GENERAL FAUCHER Saint maixent l",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885780",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-11",heure:"16:26",ville:"Royan",rue:"46 AVENUEDANIEL HEDDE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885777",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-02-11",heure:"16:20",ville:"",rue:"1 RUE ERNESTPEROCHON Saint maixent l ecole FO36561164 PFO42623995KH Ferey Marguerite 0661820010 POP 2026-02-23 SyncOK 2026- 02-27 connexion ok",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885764",commercial:"Adam El Jazouli",vtaCode:"vta-aeljazouli",vtaResolved:false,date:"2026-02-11",heure:"16:10",ville:"Exireuil",rue:"6 RUE FRANCOIS COUPERIN",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885733",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-11",heure:"15:30",ville:"Creche",rue:"13 RUE COMMANDANT COUSTEAU",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885715",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-02-11",heure:"14:59",ville:"",rue:"1 RUE ERNESTPEROCHON Saint maixent l ecole PFO42623160ZC Meresse Nathalie 0617449178 ULTRA_PLAYER_POP vente valid�e J+7",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885690",commercial:"Adam El Jazouli",vtaCode:"vta-aeljazouli",vtaResolved:false,date:"2026-02-11",heure:"14:25",ville:"Exireuil",rue:"9 RUE JEAN PHILIPPE RAMEAU",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885637",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-02-11",heure:"13:24",ville:"Royan",rue:"32 RUE DESLOUTRES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885512",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-10",heure:"19:31",ville:"Royan",rue:"70 AVENUEDANIEL HEDDE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885461",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-10",heure:"18:16",ville:"Royan",rue:"70 AVENUEDANIEL HEDDE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885395",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-10",heure:"16:59",ville:"Royan",rue:"70 AVENUEDANIEL HEDDE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885275",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-02-10",heure:"14:30",ville:"Royan",rue:"59 AVENUEDANIEL HEDDE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885260",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-10",heure:"14:15",ville:"Royan",rue:"70 AVENUEDANIEL HEDDE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885212",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-02-10",heure:"13:20",ville:"Royan",rue:"4 IMPASSE DUGOUPIL",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885203",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-10",heure:"13:12",ville:"Royan",rue:"70 AVENUEDANIEL HEDDE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885202",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-02-10",heure:"13:08",ville:"Royan",rue:"14 RUE DEGAS 79329 Thouars FO36554384 PFO42616568SG BONNEAU Mathieu 0764750840 ULTRA_LIGHT_PLAYER_POP 2026-02-13 RDV 2026-02-20 inscription ok /postprod 12:35:12 vta-zourhalm TALC 57 AVENUEDANIEL HEDDE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885177",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-02-10",heure:"12:35",ville:"Royan",rue:"57 AVENUEDANIEL HEDDE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885154",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-10",heure:"12:14",ville:"Royan",rue:"82 AVENUE DEROCHEFORT",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885142",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-10",heure:"11:50",ville:"Royan",rue:"70 AVENUEDANIEL HEDDE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885085",commercial:"Adam El Jazouli",vtaCode:"vta-aeljazouli",vtaResolved:false,date:"2026-02-09",heure:"19:29",ville:"Exireuil",rue:"97 RUE DUNOYER",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885084",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-09",heure:"19:26",ville:"Royan",rue:"70 AVENUEDANIEL HEDDE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885067",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-02-09",heure:"18:39",ville:"",rue:"8 RUE GASTONCHERAU Saint maixent l ecole FO36551655 PFO42613486EK Sabelle Lucas 0785013715 POP 2026-02-12 RDV 2026-02- 19",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885001",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-02-09",heure:"17:25",ville:"",rue:"0 RUE DE LAIGUILLON Saint maixent l ecole FO36551005 PFO42612770MP Rousseau Jean Robert 0673912813 ULTRA_PLAYER_POP inscription ok",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-885000",commercial:"Adam El Jazouli",vtaCode:"vta-aeljazouli",vtaResolved:false,date:"2026-02-09",heure:"17:25",ville:"Exireuil",rue:"16 RUE DUCHENE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-884995",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-09",heure:"17:22",ville:"Royan",rue:"82 AVENUE DEROCHEFORT",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-884951",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-02-09",heure:"16:13",ville:"Royan",rue:"6 BOULEVARDFELIX REUTIN",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-884942",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-09",heure:"16:06",ville:"Royan",rue:"82 AVENUE DEROCHEFORT",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-884939",commercial:"Adam El Jazouli",vtaCode:"vta-aeljazouli",vtaResolved:false,date:"2026-02-09",heure:"16:04",ville:"Exireuil",rue:"11 RUE DUCHENE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-884938",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-02-09",heure:"16:04",ville:"Royan",rue:"7 IMPASSE DUGOUPIL",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-884930",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-09",heure:"15:54",ville:"Royan",rue:"68 AVENUEDANIEL HEDDE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-884866",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-02-09",heure:"14:41",ville:"",rue:"0 RUE DE LAIGUILLON Saint maixent l ecole FO36549563 PFO42611145VM Sourisseau Pascale 0687599785 ULTRA_LIGHT_PLAYER_POP 2026-02-12 SyncOK 2026- 02-19",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-884848",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-02-09",heure:"14:27",ville:"",rue:"0 RUE DE LAIGUILLON Saint maixent l ecole FO36549562 PFO42611202KI Doublier Patrick 0778188605 POP r�sili�",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-884846",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-02-09",heure:"14:25",ville:"Exireuil",rue:"23 RUE DUCHENE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-884817",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-09",heure:"13:58",ville:"Royan",rue:"68 AVENUEDANIEL HEDDE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-884788",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-09",heure:"13:40",ville:"Royan",rue:"82 AVENUE DEROCHEFORT",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-884760",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-02-09",heure:"13:06",ville:"Royan",rue:"63 AVENUEDANIEL HEDDE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-884713",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-09",heure:"11:58",ville:"Royan",rue:"68 AVENUEDANIEL HEDDE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-883904",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-02-04",heure:"18:27",ville:"Niort",rue:"111 RUE DETELOUZE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-883900",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-04",heure:"18:23",ville:"Niort",rue:"29 RUE DE LACORDERIE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-883883",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-04",heure:"17:58",ville:"Niort",rue:"8 RUE GUYGUILLOTEAU",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-883869",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-04",heure:"17:43",ville:"Niort",rue:"2 RUE GUYGUILLOTEAU",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-883857",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-04",heure:"17:25",ville:"Niort",rue:"27 RUE DE LACORDERIE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-883818",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-04",heure:"16:37",ville:"Niort",rue:"29 RUE DE LACORDERIE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-883784",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-02-04",heure:"16:06",ville:"Niort",rue:"7 RUE LAURENT BONNEVAY",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-883703",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-04",heure:"14:42",ville:"Niort",rue:"12 RUE GUYGUILLOTEAU",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-883693",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-02-04",heure:"14:27",ville:"Niort",rue:"19 RUE LAURENT BONNEVAY",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-883639",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-02-04",heure:"13:36",ville:"Niort",rue:"12 RUE HENRISELLIER",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-883636",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-04",heure:"13:35",ville:"Niort",rue:"12 RUE GUYGUILLOTEAU",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-883610",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-02-04",heure:"13:13",ville:"Niort",rue:"31 RUE DE LACORDERIE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-883590",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-04",heure:"12:47",ville:"Niort",rue:"12 RUE GUYGUILLOTEAU",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-883507",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-03",heure:"19:11",ville:"",rue:"16 ALLEE DU MARTIN PECHEUR Nueil les aubiers",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-883506",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-03",heure:"19:10",ville:"Mauleon",rue:"5 PLACE DULAVOIR",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-883441",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-03",heure:"17:48",ville:"",rue:"12 COURS SAINT ANTOINE Nueil les aubiers",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-883276",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-03",heure:"14:59",ville:"",rue:"1 RUE DU MARTIN PECHEUR Nueil les aubiers",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-883220",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-02-03",heure:"14:04",ville:"",rue:"2 IMPASSE DESPEUPLIERS Nueil les aubiers FO36522083 PFO42580716EX Desnoielle Maryline 0671510589 ULTRA_LIGHT_PLAYER_POP 2026-02-05 SyncOK 2026- 02-10 connexion ok",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-883023",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-02-02",heure:"17:57",ville:"Bressuire",rue:"11 RUEHERAULT",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-882977",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-02-02",heure:"17:12",ville:"Bressuire",rue:"9 RUE ANATOLE FRANCE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-882826",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-02-02",heure:"14:46",ville:"Bressuire",rue:"7 RUE DESFOURRES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-882795",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-02-02",heure:"14:17",ville:"Bressuire Pfo42574014Pi Lucas Jean-Marie 0780236001 Ultra_Light_Player_Pop Vente",rue:"7 RUE DESFOURRES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-882750",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-02-02",heure:"13:48",ville:"Bressuire",rue:"6 RUE DU BOISROUX",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-882620",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-31",heure:"15:00",ville:"Thouars",rue:"13 ALLEE DESROSEAUX",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-882597",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-01-30",heure:"18:27",ville:"Cerizay",rue:"9 ALLEE DUMIDI",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-882590",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-30",heure:"18:18",ville:"Bressuire",rue:"72 RUE DE LAGRANGE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-882574",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-01-30",heure:"17:51",ville:"Cerizay",rue:"3 RUE EUGENETHOMAZEAU",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-882546",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-30",heure:"16:42",ville:"Bressuire",rue:"72 RUE DE LAGRANGE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-882446",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-30",heure:"14:21",ville:"Cerizay",rue:"2 RUE EXPEDITION ANTARCTICA",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-882406",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-01-30",heure:"13:06",ville:"Cerizay",rue:"13 RUE DUCHAT BOTTE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-882399",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-30",heure:"12:55",ville:"Cerizay",rue:"1 RUE DU CHATBOTTE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-882380",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-01-30",heure:"12:34",ville:"Cerizay",rue:"13 RUE DUCHAT BOTTE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-882278",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-29",heure:"18:10",ville:"",rue:"24 PLACE DU CHAMP DE FOIRE Nueil les aubiers",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-882217",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-29",heure:"17:24",ville:"",rue:"15 RUE CHARLES AUBRY Nueil les aubiers",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-882205",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-29",heure:"17:17",ville:"Thouars",rue:"4 ALLEE DATHENES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-882174",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-29",heure:"16:53",ville:"Argentonnay",rue:"3 RUE D ANJOU 79329 Thouars FO36500249 PFO42557042P8 Billy Alexis 0621987328 POP 2026-02-02 SyncOK 2026-02-10 connexion ok VRF 16:25:06 vta-zourhalm TALC 29 RUE PORTEVIRESCHE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-882145",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-01-29",heure:"16:25",ville:"Argentonnay",rue:"29 RUE PORTEVIRESCHE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-882138",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-29",heure:"16:18",ville:"Argentonnay",rue:"9 RUE DUSTADE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-882118",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-29",heure:"16:01",ville:"",rue:"56 RUE SAINTJOSEPH Nueil les aubiers FO36499867 PFO42556617QU VU THI LOUN 0619525873 POP 2026-01-30 SyncOK 2026- 02-06 connexion ok",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-882106",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-29",heure:"15:52",ville:"Thouars",rue:"8 ALLEERACINE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-882102",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-29",heure:"15:51",ville:"",rue:"1 RUE DESJUSTICES Nueil les aubiers FO36499809 PFO42556544B2 Gazeau Genevi�ve 0661235662 ULTRA_LIGHT_PLAYER_POP 2026-02-02 SyncOK 2026- 02-12 connexion ok",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-882092",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-01-29",heure:"15:38",ville:"Argentonnay",rue:"32 RUE SAINTGEORGES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-882057",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-01-29",heure:"15:05",ville:"Thouars",rue:"19 RUE DESTRASBOURG",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-882053",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-29",heure:"15:02",ville:"Argentonnay",rue:"3 RUE DEVENDEE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-881857",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-28",heure:"19:13",ville:"Pin",rue:"11 ALLEE JOSEPH GUILLOTEAU",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-881828",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-28",heure:"18:25",ville:"",rue:"12 RUEFONTAINE Saint amand sur sevre FO36496405 PFO42552661ZR Leduc Gwena�l 0764453487 ULTRA_LIGHT_PLAYER_POP 2026-01-30 SyncOK 2026- 02-07 connexion ok",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-881821",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-28",heure:"18:11",ville:"Pin",rue:"8 ALLEE JOSEPH GUILLOTEAU",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-881802",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-28",heure:"17:56",ville:"",rue:"9 RUE DE LATRANQUILLITE Saint amand sur sevre FO36496261 PFO425524828G Quentin J�r�me 0630785068 ULTRA_PLAYER_POP 2026-02-02 SyncOK 2026- 02-13 connexion ok",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-881781",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-28",heure:"17:42",ville:"",rue:"1 IMPASSE DESBLEUETS Nueil les aubiers FO36496167 PFO425523183L Lafleur Cynthia 0785976134 ULTRA_PLAYER_POP 2026-01-30 SyncOK 2026- 02-06 connexion ok",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-881747",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-28",heure:"17:09",ville:"",rue:"7 RUE DE LATRANQUILLITE Saint amand sur sevre FO36495888 PFO42552030UW Gilon S�bastien 0677390434 ULTRA_PLAYER_POP 2026-02-02 SyncOK 2026- 02-10 connexion ok",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-881709",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-28",heure:"16:39",ville:"",rue:"62 RUE DE LASEVRE Saint amand sur sevre FO36495638 PFO425517234Z Fie Emmanuel 0629318985 ULTRA_LIGHT_PLAYER_POP 2026-01-30 RDV 2026-02- 09 inscription ok",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-881689",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-28",heure:"16:23",ville:"Pin",rue:"3 ALLEE JOSEPH GUILLOTEAU",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-881658",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-28",heure:"15:53",ville:"",rue:"21 RUE SAINTCHARLES Nueil les aubiers FO36495440 PFO42551503F7 Moreau Joel 0630967383 ULTRA_PLAYER_POP 2026-01-30 SyncOK 2026- 02-07 connexion ok",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-881653",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-28",heure:"15:50",ville:"Combrand",rue:"7 SQUARE DESPRIMEVERES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-881602",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-28",heure:"15:15",ville:"",rue:"5 IMPASSE DUPARC Nueil les aubiers FO36495005 PFO42551012VK Besnard Laurence 0666261935 ULTRA_PLAYER_POP 2026-01-29 SyncOK 2026- 02-05 connexion ok",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-881599",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-28",heure:"15:12",ville:"Combrand",rue:"6 RUE DESJARDINS",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-881550",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-28",heure:"14:14",ville:"Combrand",rue:"2 RUE DEJOUANNET",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-881541",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-28",heure:"14:02",ville:"Combrand",rue:"20 SQUARE DES PRIMEVERES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-881529",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-28",heure:"13:43",ville:"",rue:"32 RUE DE LAFABRIQUE Nueil les aubiers FO36494353 PFO42550258O3 Bourasseau Helene 0680766846 ULTRA_LIGHT_PLAYER_POP 2026-01-30 SyncOK 2026- 02-09 connexion ok",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-881518",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-28",heure:"13:36",ville:"",rue:"2 ALLEE DESARCADES Saint amand sur sevre FO36494341 PFO425502402H Jean marie Loiseau 0670063668 ULTRA_LIGHT_PLAYER_POP 2026-01-30 SyncOK 2026- 02-06 connexion ok",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-881500",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-28",heure:"13:13",ville:"Combrand",rue:"13 RUE DU GENERAL DE GAULLE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-881400",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-01-27",heure:"18:47",ville:"Mauleon",rue:"8 RUE NICOLASMODAINE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-881320",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-01-27",heure:"17:37",ville:"Mauleon",rue:"35 RUE COUSSEAU DE L EPINAY",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-881232",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-27",heure:"16:23",ville:"Mauleon",rue:"4 RUE DE LATUILERIE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-881207",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-27",heure:"15:54",ville:"Thouars",rue:"14 ALLEE DESROSEAUX",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-881167",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-27",heure:"14:57",ville:"",rue:"21 GRAND RUE 79079 Mauleon FO36490275 PFO42545573TC Leroux Claudie 0650030198 POP 2026-01-29 SyncOK 2026-02-06 connexion ok VRF 14:44:06 vta-yhabbouba TALC 14 RUE COUSSEAU DE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-881150",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-01-27",heure:"14:44",ville:"Mauleon",rue:"14 RUE COUSSEAU DE L EPINAY",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-881104",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-27",heure:"13:53",ville:"Thouars",rue:"18 ALLEE DESROSEAUX",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-881062",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-27",heure:"12:54",ville:"Mauleon",rue:"1 RUE DE LAMOTTE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-880992",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-26",heure:"19:34",ville:"Mauleon",rue:"55 RUE DUCOMMERCE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-880988",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-01-26",heure:"19:19",ville:"Mauleon",rue:"95 RUE SAINTEANNE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-880944",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-01-26",heure:"18:05",ville:"Mauleon Pfo425413116G Journaud Thierry 0603923927 Pop Vente",rue:"109 RUESAINTE ANNE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-880908",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-01-26",heure:"17:18",ville:"Mauleon",rue:"99 RUE SAINTEANNE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-880889",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-01-26",heure:"16:52",ville:"Mauleon",rue:"13 RUE DEGAS 79329 Thouars FO36485938 PFO42540666MV GIRARD Alexandra 0670843259 POP 2026-01-27 SyncOK 2026-02-06 connexion ok VRF 16:50:22 vta-zourhalm TALC 70 RUE SAINTEANNE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-880887",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-01-26",heure:"16:50",ville:"Mauleon",rue:"70 RUE SAINTEANNE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-880801",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-01-26",heure:"15:13",ville:"Thouars",rue:"1 ALLEE JULESRENARD",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-880778",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-01-26",heure:"14:53",ville:"Thouars Pfo42539531Jd Mokhtar Mandy 0602285694 Ultra_Player_Pop Vente",rue:"1 ALLEE JULESRENARD",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-880733",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-01-26",heure:"14:12",ville:"Thouars",rue:"17 BOULEVARDDU 8 MAI",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-880718",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-01-26",heure:"13:57",ville:"Mauleon",rue:"20 RUE DE LACOURONNE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-880706",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-26",heure:"13:47",ville:"Mauleon",rue:"8 RUE DE LAVENDEE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-880700",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-01-26",heure:"13:30",ville:"Thouars",rue:"1 ALLEE JULESRENARD",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-880568",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-23",heure:"17:55",ville:"Rochelle",rue:"114 AVENUE DEROMPSAY",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-880551",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-23",heure:"17:36",ville:"Rochelle",rue:"9 RUE JULESCHERET",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-880542",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-23",heure:"17:24",ville:"Rochelle Pfo425294867I Paradot Isabelle 0626965443 Ultra_Player_Pop Vente",rue:"9 RUE JULESCHERET",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-880534",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-23",heure:"17:03",ville:"Rochelle Pfo42529387Ny Parador Isabelle 0626965443 Ultra_Player_Pop Vente",rue:"9 RUE JULESCHERET",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-880445",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-23",heure:"14:39",ville:"Rochelle",rue:"3 ALLEE DUROUERGUE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-880322",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-22",heure:"19:18",ville:"Rochelle",rue:"11 RUE JULESCHERET",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-880269",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-01-22",heure:"18:05",ville:"",rue:"2 RUE DUSABOTIER Saint pierre des echaubrognes FO36471993 PFO4252492344 Landreau Annie 0686575687 POP 2026-01-26 SyncOK 2026- 02-11",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-880246",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-22",heure:"17:33",ville:"Cerizay",rue:"9 RUE DU CHATBOTTE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-880202",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-22",heure:"16:47",ville:"Cerizay",rue:"7 RUE DU CHATBOTTE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-880195",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-01-22",heure:"16:36",ville:"",rue:"5 RUE DE LACOURSERIE Saint pierre des echaubrognes FO36471454 PFO42524214S2 Audebeau Marie-therese 0681094689 POP 2026-01-27 SyncOK 2026- 02-16",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-880183",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-01-22",heure:"16:23",ville:"Cerizay",rue:"2 RUE EXPEDITION ANTARCTICA",operator:"Free",type:"Fibre",status:"En attente RDV"},
{id:"vta-880179",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-01-22",heure:"16:18",ville:"",rue:"3 RUE DESNOISETIERS Saint pierre des echaubrognes FO36471281 PFO42524105SA Hardy Patrick 0661797618 ULTRA_PLAYER_POP 2026-01-27 SyncOK 2026- 02-02",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-880098",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-22",heure:"15:14",ville:"Cerizay",rue:"2 IMPASSE DESBLEUETS",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-880096",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-01-22",heure:"15:13",ville:"Cerizay",rue:"2 IMPASSE DESBLEUETS",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-880078",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-01-22",heure:"14:51",ville:"Rochelle",rue:"9 AVENUE LOUIS GUILLET",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-880049",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-22",heure:"14:28",ville:"Rochelle",rue:"9 RUE DU COMTE DE NICE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-880034",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-22",heure:"14:12",ville:"Rochelle Pfo42523082Za Hafsi Nadine 0689563627 Ultra_Player_Pop Vente",rue:"9 RUE DU COMTE DE NICE",operator:"Free",type:"Fibre",status:"En attente RDV"},
{id:"vta-880015",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-01-22",heure:"13:45",ville:"",rue:"19 RUE DE LACROIX VERTE Saint pierre des echaubrognes FO36470213 PFO42522891B0 Charrier Michel 0636752678 ULTRA_PLAYER_POP 2026-01-27 RDV 2026-02- 11 r�sili�",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-879975",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-22",heure:"13:10",ville:"Rochelle",rue:"9 RUE DU COMTE DE NICE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-879948",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-22",heure:"12:59",ville:"Cerizay",rue:"21 RUE DE LATTRE DE TASSIGNY",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-879921",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-01-22",heure:"12:39",ville:"Cerizay",rue:"3 RUE DE LATTRE DE TASSIGNY",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-879898",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-22",heure:"11:49",ville:"Rochelle Pfo42522099Np Colle Josiane 0780517323 Pop Vente",rue:"15 RUE DU COMTE DE NICE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-879893",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-22",heure:"11:35",ville:"Rochelle",rue:"36 AVENUE DEPARIS",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-879863",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-01-21",heure:"21:23",ville:"Rochelle",rue:"5 ALLEE DUQUERCY",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-879856",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-01-21",heure:"19:52",ville:"Rochelle",rue:"5 ALLEE DUQUERCY",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-879844",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-21",heure:"19:22",ville:"Rochelle",rue:"13 RUE DUBOURBONNAIS",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-879842",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-01-21",heure:"19:19",ville:"Cerizay Pfo425202276N G�Rard Clarisse 0668391931 Ultra_Player_Pop Vente",rue:"14 RUE DELONGCHAMP",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-879837",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-01-21",heure:"19:09",ville:"Cerizay",rue:"10 RUE ALPHONSE DAUDET",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-879829",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-01-21",heure:"18:56",ville:"Cerizay",rue:"9 RUE DU GENERAL CATROUX",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-879812",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-21",heure:"18:33",ville:"Rochelle",rue:"7 RUE DUBOURBONNAIS",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-879811",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-01-21",heure:"18:33",ville:"Cerizay",rue:"12 RUE DELONGCHAMP",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-879744",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-01-21",heure:"17:15",ville:"Cerizay",rue:"9 RUE DESACACIAS",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-879739",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-21",heure:"17:10",ville:"Rochelle Pfo42519336No Regnier Thomas 0769676231 Ultra_Player_Pop Vente",rue:"12 RUE DE LARTOIS",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-879725",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-01-21",heure:"17:00",ville:"Cerizay",rue:"17 RUE DU GENERAL CATROUX",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-879707",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-01-21",heure:"16:46",ville:"Cerizay Pfo42519083Ln Gerard Clarisse 0668391931 Ultra_Player_Pop Vente",rue:"14 RUE DELONGCHAMP",operator:"Free",type:"Fibre",status:"En cours"},
{id:"vta-879532",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-01-21",heure:"13:35",ville:"Rochelle",rue:"3 ALLEE DUPERIGORD",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-879488",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-01-21",heure:"12:40",ville:"Rochelle Pfo42517218Gp Morvan Emmanuel 0780852273 Pop Vente",rue:"3 ALLEE DUPERIGORD",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-879444",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-21",heure:"11:05",ville:"Rochelle Pfo42516487Bo Croize Jean Pierre 0624442920 Pop Vente",rue:"1 ALLEE DUROUERGUE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-879418",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-20",heure:"19:22",ville:"Marans",rue:"81 RUE DALIGRE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-879399",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-20",heure:"18:41",ville:"Andilly",rue:"6 RUE DUCIMETIERE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-879307",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-01-20",heure:"16:55",ville:"Bressuire",rue:"50 RUE DE FAYE L ABBESSE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-879291",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-01-20",heure:"16:32",ville:"Bressuire",rue:"14 IMPASSE DELA VERSENNE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-879256",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-20",heure:"15:47",ville:"Marans",rue:"29 RUE DUCOLOMBIER",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-879229",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-01-20",heure:"15:17",ville:"Bressuire",rue:"16 ALLEE DELA FONTAINE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-879109",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-20",heure:"12:25",ville:"Andilly",rue:"10 RUE DU 19MARS 1962",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-879031",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-01-19",heure:"18:39",ville:"Rochelle",rue:"26 RUE DESEGLANTIERS",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-878989",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-19",heure:"17:42",ville:"Rochelle",rue:"120 AVENUE DEROMPSAY",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-878546",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-17",heure:"15:04",ville:"Niort",rue:"8 RUE DES PETITES JUSTICES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-878501",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-16",heure:"19:12",ville:"Niort",rue:"95 RUE DES 3COIGNEAUX",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-878486",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-16",heure:"18:40",ville:"Niort",rue:"95 RUE DES 3COIGNEAUX",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-878484",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-01-16",heure:"18:38",ville:"Chauray",rue:"239 RUE DUPIED GRIFFIER",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-878480",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-01-16",heure:"18:29",ville:"Niort",rue:"38 RUE EDMOND PROUST",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-878452",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-16",heure:"17:44",ville:"Aytre",rue:"15 RUE DE LACARAVELLE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-878449",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-16",heure:"17:39",ville:"Niort",rue:"97 RUE DES 3COIGNEAUX",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-878406",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-16",heure:"16:53",ville:"Niort",rue:"2 AVENUE CHARLES DE GAULLE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-878311",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-16",heure:"14:21",ville:"Rochelle",rue:"136 RUE EMILENORMANDIN",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-878284",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-16",heure:"13:35",ville:"Aytre",rue:"28 RUE DE LACORVETTE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-878245",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-16",heure:"12:24",ville:"Rochelle",rue:"21 ALLEE DEBRUXELLES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-878206",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-15",heure:"19:52",ville:"Aytre",rue:"14 PLACE DUCOUREAU",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-878202",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-01-15",heure:"19:43",ville:"Aytre Pfo424929642E Krajewski Romain 0626643821 Ultra_Light_Player_Pop Vente",rue:"9 AVENUE DU COMMANDANT LYSIACK",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-878151",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-15",heure:"18:05",ville:"Niort",rue:"4 RUE SAMUEL DE CHAMPLAIN",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-878149",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-15",heure:"17:59",ville:"Niort Pfo42492307To Le Floc'H Brigitte 0756848233 Ultra_Player_Pop Vente",rue:"4 RUE SAMUEL DE CHAMPLAIN",operator:"Free",type:"Fibre",status:"En cours"},
{id:"vta-878143",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-15",heure:"17:48",ville:"Niort Pfo42492247Wf Le Floc'H Brigitte 0781115300 Ultra_Player_Pop Vente",rue:"4 RUE SAMUEL DE CHAMPLAIN",operator:"Free",type:"Fibre",status:"En attente RDV"},
{id:"vta-878138",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-15",heure:"17:35",ville:"Niort",rue:"6 RUE DE LAMANIVELLE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-878133",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-01-15",heure:"17:31",ville:"Aytre",rue:"9 AVENUE DU COMMANDANT LYSIACK",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-878123",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-01-15",heure:"17:16",ville:"Niort",rue:"4 RUE PIERRE ANDRE DE SUFFREN",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-878105",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-01-15",heure:"16:53",ville:"Niort",rue:"6 RUE GEORGES MELIES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-878048",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-01-15",heure:"15:55",ville:"Niort",rue:"1 RUE GEORGES MELIES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-878039",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-01-15",heure:"15:40",ville:"Niort",rue:"4 PLACE LOUISJOUVET",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-878006",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-01-15",heure:"15:07",ville:"Niort Pfo42491014Fc Bajot Alain 0627276064 Ultra_Light_Player_Pop Vente",rue:"4 PLACE LOUISJOUVET",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877976",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-01-15",heure:"14:29",ville:"Rochelle",rue:"3 ALLEE DUROUERGUE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877974",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-15",heure:"14:28",ville:"Aytre",rue:"23 AVENUE DU COMMANDANT LYSIACK",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877947",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-01-15",heure:"13:47",ville:"Aytre",rue:"9 AVENUE DU COMMANDANT LYSIACK",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877929",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-15",heure:"13:18",ville:"Niort",rue:"2 PLACE LOUISJOUVET",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877887",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-15",heure:"12:30",ville:"Niort",rue:"3 RUE DESPAPILLONS",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877886",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-15",heure:"12:29",ville:"Aytre",rue:"12 RUE DE LACARAVELLE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877878",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-01-15",heure:"11:59",ville:"Niort",rue:"65 AVENUE DE LA VENISE VERTE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877849",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-14",heure:"20:29",ville:"Aytre",rue:"28 RUE PIERRELOTI",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877815",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-01-14",heure:"18:25",ville:"Niort",rue:"20 RUE JULESSIEGFRIED",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877802",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-01-14",heure:"18:11",ville:"Aytre",rue:"45 RUE DEVERDUN",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877796",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-01-14",heure:"18:04",ville:"Niort",rue:"15 RUE MAURICE CHEVALIER",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877786",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-14",heure:"17:55",ville:"Aytre",rue:"6 SQUARE LOUISE MICHEL",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877770",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-01-14",heure:"17:38",ville:"Niort",rue:"1 RUE PAULPAINLEVE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877763",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-01-14",heure:"17:28",ville:"Aytre",rue:"45 RUE DEVERDUN",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877753",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-01-14",heure:"17:17",ville:"Aytre",rue:"32 AVENUE DU COMMANDANT LYSIACK",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877738",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-14",heure:"17:00",ville:"Aytre",rue:"45 RUE DEVERDUN",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877707",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-01-14",heure:"16:28",ville:"Aytre",rue:"32 AVENUE DU COMMANDANT LYSIACK",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877678",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-14",heure:"16:05",ville:"Aytre",rue:"45 RUE DEVERDUN",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877666",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-01-14",heure:"15:56",ville:"Niort",rue:"20 RUE GEORGES MELIES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877661",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-14",heure:"15:43",ville:"Aytre",rue:"28 RUE PIERRELOTI",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877650",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-01-14",heure:"15:34",ville:"Aytre",rue:"32 AVENUE DU COMMANDANT LYSIACK",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877645",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-01-14",heure:"15:32",ville:"Aytre",rue:"5 BOULEVARD DU COMMANDANT CHARCOT",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877625",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-14",heure:"15:08",ville:"Aytre",rue:"5 BOULEVARD DU COMMANDANT CHARCOT",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877613",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-14",heure:"14:58",ville:"Aytre",rue:"28 RUE PIERRELOTI",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877551",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-01-14",heure:"14:05",ville:"Aytre",rue:"32 AVENUE DU COMMANDANT LYSIACK",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877509",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-14",heure:"13:26",ville:"Niort",rue:"56 RUE MAURICE CAILLARD",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877505",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-14",heure:"13:22",ville:"Aytre",rue:"11 PLACE DELA TARTANE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877450",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-14",heure:"11:28",ville:"",rue:"4 RUE DES ILES 17028 Aytre FO36435321 PFO4248394288 Descubes Benoit 0670667904 ULTRA_LIGHT_PLAYER_POP 2026-01-16 SyncOK 2026-01-26 connexion ok VRF 19:39:56 vta-rgrasset TALC 58 RUE ALPHONSE DE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877396",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-13",heure:"19:39",ville:"Rochelle",rue:"58 RUE ALPHONSE DE SAINTONGE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877392",commercial:"Lyna Belkessa",vtaCode:"vta-bdjaballah",vtaResolved:false,date:"2026-01-13",heure:"19:22",ville:"Rochefort",rue:"15 AVENUE MARCEL DASSAULT",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877335",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-01-13",heure:"18:23",ville:"Niort",rue:"12 RUE JULESSIEGFRIED",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877316",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-13",heure:"18:01",ville:"",rue:"5 GRANDE RUE 17267 Nuaille d aunis FO36433158 PFO424814342B Gouineau G�raldine 0669510486 ULTRA_LIGHT_PLAYER_POP 2026-01-16 SyncOK 2026- 01-31 connexion ok VRF",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877299",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-01-13",heure:"17:43",ville:"Niort",rue:"2 RUE GUILLAUME APOLLINAIRE",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877291",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-01-13",heure:"17:30",ville:"Niort",rue:"12 RUE JULESSIEGFRIED",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877272",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-13",heure:"17:15",ville:"Sainte Soulle",rue:"3 RUE DU 14JUILLET",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877239",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-01-13",heure:"16:34",ville:"Niort",rue:"10 RUE JULESSIEGFRIED",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877191",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-01-13",heure:"15:26",ville:"Niort",rue:"27 RUE HENRIBECQUEREL",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877154",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-13",heure:"14:36",ville:"Niort",rue:"80 RUE MAURICE CAILLARD",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877145",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-01-13",heure:"14:26",ville:"Sainte Soulle",rue:"23 RUE DE LAUNIS",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877125",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-01-13",heure:"14:06",ville:"Niort",rue:"35 RUE HENRIBECQUEREL",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877085",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-13",heure:"13:33",ville:"Niort",rue:"80 RUE MAURICE CAILLARD",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877073",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-13",heure:"13:18",ville:"Sainte Soulle",rue:"18 RUE DEBERRY",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877071",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-13",heure:"13:14",ville:"",rue:"28 GRANDERUE Nuaille d aunis FO36430790 PFO42478903M4 Simon Chantal 0630822457 POP 2026-01-15 SyncOK 2026- 01-23 connexion ok",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877015",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-13",heure:"12:14",ville:"Sainte Soulle",rue:"4 CHEMIN DESBASSETRIES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877014",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-13",heure:"12:12",ville:"Niort",rue:"80 RUE MAURICE CAILLARD",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-877012",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-01-13",heure:"12:07",ville:"Niort",rue:"4 SQUARE MADAME DE MAINTENON",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-876962",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-12",heure:"19:01",ville:"Lagord",rue:"65 RUE DESGONTHIERES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-876903",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-01-12",heure:"17:41",ville:"Niort",rue:"21 RUE EDOUARD BELIN",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-876880",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-12",heure:"17:11",ville:"Lagord",rue:"12 RUE DE LAMOUSSON",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-876861",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-01-12",heure:"16:49",ville:"Niort",rue:"21 RUE EDOUARD BELIN",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-876829",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-12",heure:"16:13",ville:"Niort",rue:"1 IMPASSE DESMYOSOTIS",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-876807",commercial:"Ouissem Ouirini",vtaCode:"vta-yhabbouba",vtaResolved:false,date:"2026-01-12",heure:"15:50",ville:"Niort",rue:"1 SQUARE MADAME DE MAINTENON",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-876797",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-12",heure:"15:42",ville:"Lagord",rue:"16 RUE EUGENE FAVRIT",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-876782",commercial:"Pablo Grasset",vtaCode:"vta-rgrasset",vtaResolved:false,date:"2026-01-12",heure:"15:26",ville:"Lagord",rue:"7 RUE DESALIZES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-876750",commercial:"Stephane Legrand",vtaCode:"vta-dmagne",vtaResolved:false,date:"2026-01-12",heure:"14:54",ville:"Niort",rue:"2 IMPASSE DESSAUGES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-876730",commercial:"Sandra Pereira",vtaCode:"vta-aballuteaud",vtaResolved:false,date:"2026-01-12",heure:"14:25",ville:"Lagord",rue:"24 RUE DUMETEIL",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-876655",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-01-12",heure:"13:23",ville:"Niort",rue:"6 IMPASSE DESSAUGES",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-876650",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-12",heure:"13:10",ville:"Rochelle",rue:"34 RUE HENRIIV",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-876646",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-01-12",heure:"13:06",ville:"Niort",rue:"10 RUE MARCEL CERDAN",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-876634",commercial:"Abdel Nouar",vtaCode:"vta-hnouar",vtaResolved:false,date:"2026-01-12",heure:"12:46",ville:"Lagord",rue:"23 RUE DUMETEIL",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-876614",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-01-12",heure:"12:35",ville:"Niort",rue:"10 RUE MARCEL CERDAN",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-876588",commercial:"William Goujon",vtaCode:"vta-bziegler",vtaResolved:false,date:"2026-01-12",heure:"12:01",ville:"Niort",rue:"2 RUE GEORGES CARPENTIER",operator:"Free",type:"Fibre",status:"Valide"},
{id:"vta-876579",commercial:"Abdellah Cheikh",vtaCode:"vta-zourhalm",vtaResolved:false,date:"2026-01-12",heure:"11:31",ville:"Niort",rue:"26 RUE MAURICE CHEVALIER",operator:"Free",type:"Fibre",status:"Valide"}
];
}
function carnetToContracts(rows) {
  var vstMap = {};
  DEMO_TEAM.forEach(function(m) {
    var parts = m.name.split(' ');
    var code = 'vst-' + parts[0][0].toLowerCase() + parts[parts.length - 1].toLowerCase();
    vstMap[code] = m.name;
    // Also register explicitly assigned vstCodes
    (m.vstCodes || []).forEach(function(c) { vstMap[c] = m.name; });
  });
  // Manual overrides where system login doesn't match the naming pattern (kept as safety net)
  Object.assign(vstMap, {
    'vst-lmertz':              'Leo Merde',
    'vst-hnouar':              'Abdel Nouar',
    'vst-dbelkessa':           'Lyna Belkessa',
    'vst-adahmani':            'Hamid Atroune',
    'vst-bouchrif':            'Abdellah Cheikh',
    'vst-dclavereuil':         'Djany Legrand',
    'vst-dpouilly':            'Nora Wahid',
    'vst-droode':              'Paul Geriltault',
    'vst-eluc':                'William Goujon',
    'vst-kelahmadi':           'Ouissem Ouirini',
  });

  function cleanBox(box) {
    if (!box) return '';
    if (box.indexOf('ULTRA_LIGHT') === 0) return 'ULTRA_LIGHT';
    if (box.indexOf('ULTRA') === 0) return 'ULTRA';
    if (box.indexOf('POP') === 0) return 'POP';
    return box;
  }

  var statusMap = {
    'inscription ok': 'En attente RDV',
    'inscription ok /postprod': 'En attente RDV',
    'vente valid\u00e9e': 'RDV pris',
    'vente valid\u00e9e j+7': 'RDV pris J+7',
    'connexion ok': 'Branch\u00e9',
    'connexion ok vrf': 'Branch\u00e9 VRF',
    'r\u00e9sili\u00e9': 'R\u00e9sili\u00e9',
    'vente abandon\u00e9e': 'Annul\u00e9',
  };

  return rows.map(function(r) {
    var login = (r.login || '').trim();
    var dt = (r.date_inscription || '').split(' ');
    var date = dt[0] || '';
    var heure = dt[1] ? dt[1].substring(0, 5) : '';
    var status = statusMap[(r.etat_commande || '').toLowerCase()] || r.etat_commande || '';
    var box = cleanBox(r.box || '');
    var ville = (r.ville || '').trim();

    if (login.startsWith('vta-')) {
      var group = VTA_GROUPS[login];
      var commercial = group ? group[0] : login;
      return {
        id: 'vta-' + r.id_abo,
        commercial: commercial,
        vtaCode: login,
        vtaResolved: false,
        date: date,
        heure: heure,
        ville: ville,
        rue: r.adresse || '',
        operator: 'Free',
        type: 'Fibre',
        box: box,
        status: status || 'Valide',
      };
    } else {
      return {
        id: 'f-' + r.id_abo,
        commercial: vstMap[login] || login,
        vstLogin: login,
        date: date,
        heure: heure,
        ville: ville,
        rue: r.adresse || '',
        operator: 'Free',
        type: 'Fibre',
        box: box,
        status: status,
      };
    }
  });
}

const DEMO_CONTRACTS = carnetData.length > 0 ? carnetToContracts(carnetData) : makeDemoContracts().concat(makeVTAContracts());

// STATUS COLORS
function statusColor(status) {
if (status === "Branché" || status === "Branché VRF" || status === "Branche") return "#32CD32";
if (status === "RDV pris" || status === "RDV pris J+7" || status === "Valide") return "#808000";
if (status === "Résilié" || status === "Annulé" || status === "Annule") return "#B22222";
return "#D97706"; // En attente RDV
}

// UI COMPONENTS
function Badge({ children, color }) {
const c = color || "#6E6E73";
return (
<span style={{ display: "inline-flex", alignItems: "center", padding: "2px 9px", borderRadius: 99, fontSize: 11, fontWeight: 600, color: c, background: c + "18", letterSpacing: 0.1 }}>
{children}
</span>
);
}

function Card({ children, style, onClick }) {
return (
<div onClick={onClick} style={{ background: "#FFFFFF", borderRadius: 18, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.05)", cursor: onClick ? "pointer" : "default", transition: "box-shadow 0.18s", ...style }}
  onMouseEnter={onClick ? function(e) { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)"; } : undefined}
  onMouseLeave={onClick ? function(e) { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.05)"; } : undefined}
>
{children}
</div>
);
}

function Btn({ children, onClick, v, s, icon, style, disabled }) {
const variant = v || "primary";
const size = s || "md";
const sz = size === "sm" ? { padding: "5px 13px", fontSize: 12, borderRadius: 99 } : { padding: "8px 18px", fontSize: 13, borderRadius: 99 };
const vs = {
  primary: { background: "#0071E3", color: "#fff" },
  secondary: { background: "#F5F5F7", color: "#1D1D1F", border: "1px solid rgba(0,0,0,0.08)" },
  danger: { background: "#FF3B3010", color: "#FF3B30", border: "1px solid #FF3B3020" },
  ghost: { background: "transparent", color: "#6E6E73" }
};
return (
<button disabled={disabled} onClick={onClick}
  style={{ display: "inline-flex", alignItems: "center", gap: 5, border: "none", fontWeight: 500, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: disabled ? 0.4 : 1, letterSpacing: -0.1, transition: "opacity 0.15s, transform 0.1s", ...sz, ...(vs[variant] || vs.primary), ...style }}
  onMouseDown={function(e) { if (!disabled) e.currentTarget.style.transform = "scale(0.97)"; }}
  onMouseUp={function(e) { e.currentTarget.style.transform = "scale(1)"; }}
  onMouseLeave={function(e) { e.currentTarget.style.transform = "scale(1)"; }}
>
{children}
</button>
);
}

function Sel({ value, onChange, options, placeholder, style }) {
return (
<select value={value} onChange={function(e) { onChange(e.target.value); }}
  style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.1)", fontSize: 13, fontFamily: "inherit", background: "#fff", outline: "none", cursor: "pointer", color: "#1D1D1F", ...style }}>
{placeholder && <option value="">{placeholder}</option>}
{options.map(function(o) {
var val = typeof o === "string" ? o : o.value;
var label = typeof o === "string" ? o : o.label;
return <option key={val} value={val}>{label}</option>;
})}
</select>
);
}

function Inp({ value, onChange, placeholder, style, type }) {
return (
<input type={type || "text"} value={value} onChange={function(e) { onChange(e.target.value); }} placeholder={placeholder}
  onFocus={function(e) { e.target.style.borderColor = "#0071E3"; e.target.style.boxShadow = "0 0 0 3px rgba(0,113,227,0.12)"; }}
  onBlur={function(e) { e.target.style.borderColor = "rgba(0,0,0,0.1)"; e.target.style.boxShadow = "none"; }}
  style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.1)", fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%", transition: "border-color 0.15s, box-shadow 0.15s", background: "#fff", color: "#1D1D1F", ...style }} />
);
}

function Modal({ open, onClose, title, children }) {
if (!open) return null;
return (
<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
<div onClick={function(e) { e.stopPropagation(); }} style={{ background: "#FFFFFF", borderRadius: 22, padding: 28, width: 480, maxWidth: "92vw", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 32px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)" }}>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
<h3 style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.4, color: "#1D1D1F" }}>{title}</h3>
<button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 99, background: "#F5F5F7", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#6E6E73" }}>✕</button>
</div>
{children}
</div>
</div>
);
}

function StatCard({ label, value, sub, color }) {
var c = color || "#1D1D1F";
return (
<Card style={{ flex: 1, minWidth: 130, padding: "18px 20px" }}>
<div style={{ fontSize: 11, color: "#AEAEB2", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>{label}</div>
<div style={{ fontSize: 30, fontWeight: 700, color: c, lineHeight: 1, letterSpacing: -1 }}>{value}</div>
{sub && <div style={{ fontSize: 12, color: "#6E6E73", marginTop: 5 }}>{sub}</div>}
</Card>
);
}

var TABS = [
{ id: "cloche", label: "🔔" },
{ id: "dashboard", label: "Dashboard" },
{ id: "contracts", label: "Contrats" },
{ id: "objectifs", label: "Objectifs" },
{ id: "cars", label: "Voitures" },
{ id: "team", label: "Équipe" },
{ id: "map", label: "Carte" },
{ id: "secteurs", label: "Secteurs" },
{ id: "import", label: "Import" },
{ id: "carnet", label: "Carnet" },
];

// MAIN APP
export default function App() {
const [tab, setTab] = useState("cloche");
const [team, setTeam] = useState([]);
const [cars, setCars] = useState([]);
const [contracts, setContracts] = useState([]);
const [objectives, setObjectives] = useState({});
const [dailyPlan, setDailyPlan] = useState(null);
const [loading, setLoading] = useState(true);
const [scraperStatus, setScraperStatus] = useState(null);
const [lastSync, setLastSync] = useState(null);
const [groups, setGroups] = useState([]);

useEffect(function() {
var unsubPlan, unsubObj;
(async function() {
// Migration one-shot localStorage → Firestore pour dailyPlan et objectives
try {
  var dpLs = localStorage.getItem(STORAGE_KEYS.dailyPlan);
  if (dpLs) { var dpSnap = await getDoc(doc(db, "agency", STORAGE_KEYS.dailyPlan)); if (!dpSnap.exists()) await store.set(STORAGE_KEYS.dailyPlan, JSON.parse(dpLs)); }
  var obLs = localStorage.getItem(STORAGE_KEYS.objectives);
  if (obLs) { var obSnap = await getDoc(doc(db, "agency", STORAGE_KEYS.objectives)); if (!obSnap.exists()) await store.set(STORAGE_KEYS.objectives, JSON.parse(obLs)); }
} catch(e) {}
// Listeners temps réel — s'abonner après migration pour récupérer direct la bonne donnée
unsubPlan = onSnapshot(doc(db, "agency", STORAGE_KEYS.dailyPlan), function(snap) {
  setDailyPlan(snap.exists() ? (snap.data().data || null) : null);
});
unsubObj = onSnapshot(doc(db, "agency", STORAGE_KEYS.objectives), function(snap) {
  setObjectives(snap.exists() ? (snap.data().data || {}) : {});
});
// Nettoyer les anciennes clés v1/v2
var oldKeys = ["agency-team-v1","agency-cars-v1","agency-contracts-v1","agency-daily-plan-v1","agency-objectives-v1","agency-team-v2","agency-cars-v2","agency-contracts-v2","agency-daily-plan-v2","agency-objectives-v2"];
for (var k of oldKeys) { try { await store.delete(k); } catch(e) {} }

// Charger ou initialiser avec données propres (migration localStorage → Firestore si vide)
var teamData = await store.get(STORAGE_KEYS.team);
if (!teamData) { try { var lsT = localStorage.getItem(STORAGE_KEYS.team); if (lsT) { teamData = JSON.parse(lsT); await store.set(STORAGE_KEYS.team, teamData); } } catch(e) {} }
// Si v4 vide, tenter de récupérer depuis v3
if (!teamData) { teamData = await store.get("agency-team-v3") || null; }
// Toujours enrichir les membres avec vstCodes/lentCodes si absents ou vides
// ([] est truthy en JS donc on vérifie .length === 0 explicitement)
if (teamData) {
  var needsSave = false;
  teamData = teamData.map(function(m) {
    var demo = DEMO_TEAM.find(function(d) { return d.id === m.id || d.name === m.name; });
    var needsVst = !m.vstCodes || m.vstCodes.length === 0;
    var needsLent = !m.lentCodes;
    if (!needsVst && !needsLent) return m;
    needsSave = true;
    return Object.assign({}, m, {
      vstCodes: needsVst ? ((demo && demo.vstCodes) || []) : m.vstCodes,
      lentCodes: needsLent ? [] : m.lentCodes,
    });
  });
  if (needsSave) store.set(STORAGE_KEYS.team, teamData);
}
setTeam(teamData || DEMO_TEAM);
var carsData = await store.get(STORAGE_KEYS.cars);
if (!carsData) { try { var lsC = localStorage.getItem(STORAGE_KEYS.cars); if (lsC) { carsData = JSON.parse(lsC); await store.set(STORAGE_KEYS.cars, carsData); } } catch(e) {} }
setCars(carsData || DEMO_CARS);
// Les contrats : partir toujours de DEMO_CONTRACTS + appliquer les résolutions VTA sauvegardées
var savedResolutions = await store.get(STORAGE_KEYS.contracts);
if (!savedResolutions) { try { var lsCo = localStorage.getItem(STORAGE_KEYS.contracts); if (lsCo) { savedResolutions = JSON.parse(lsCo); await store.set(STORAGE_KEYS.contracts, savedResolutions); } } catch(e) {} }
savedResolutions = savedResolutions || {};
// savedResolutions est un dict {id -> {commercial, vtaResolved}} pour les contrats modifiés
var mergedContracts = DEMO_CONTRACTS.map(function(c) {
  var saved = savedResolutions[c.id];
  return saved ? Object.assign({}, c, saved) : c;
});
setContracts(mergedContracts);
var loadedTeam = await store.get(STORAGE_KEYS.team) || DEMO_TEAM;
var loadedGroups = await store.get(STORAGE_KEYS.groups);
if (!loadedGroups) { try { var lsG = localStorage.getItem(STORAGE_KEYS.groups); if (lsG) { loadedGroups = JSON.parse(lsG); await store.set(STORAGE_KEYS.groups, loadedGroups); } } catch(e) {} }
loadedGroups = loadedGroups || [];
var renamedGroups = loadedGroups.map(function(g) {
  if (g.memberIds.length > 0) {
    var leader = loadedTeam.find(function(m) { return m.id === g.memberIds[0]; });
    if (leader) return Object.assign({}, g, { name: "Équipe de " + leader.name.split(' ')[0] });
  }
  return g;
});
store.set(STORAGE_KEYS.groups, renamedGroups);
setGroups(renamedGroups);
setLoading(false);
})();
return function() { if (unsubPlan) unsubPlan(); if (unsubObj) unsubObj(); };
}, []);

// ─── Poll du serveur Flask local toutes les 60s ───────────────────────────
useEffect(function() {
  var FLASK = "http://localhost:5001";

  async function pollFlask() {
    try {
      // Vérifier le statut
      var sr = await fetch(FLASK + "/status", { signal: AbortSignal.timeout(3000) });
      if (!sr.ok) throw new Error("HTTP " + sr.status);
      var status = await sr.json();
      setScraperStatus(status);
      setLastSync(status.last_sync);

      // Récupérer les contrats récents (aujourd'hui + hier)
      var cr = await fetch(FLASK + "/contracts/new", { signal: AbortSignal.timeout(5000) });
      var data = await cr.json();

      if (data.contracts && data.contracts.length > 0) {
        // Merger avec les contrats existants (dédoublonnage par id)
        setContracts(function(prev) {
          var existingIds = new Set(prev.map(function(c) { return c.id; }));
          var added = data.contracts.filter(function(c) { return !existingIds.has(c.id); });
          if (added.length === 0) return prev;
          console.log("[Flask] " + added.length + " nouveaux contrats reçus.");
          var merged = prev.concat(added);
          // Sauvegarder les overrides
          var overrides = {};
          merged.forEach(function(contract) {
            var orig = DEMO_CONTRACTS.find(function(d) { return d.id === contract.id; });
            if (!orig) overrides[contract.id] = { commercial: contract.commercial, vtaResolved: contract.vtaResolved, date: contract.date, heure: contract.heure, ville: contract.ville, rue: contract.rue, status: contract.status };
          });
          store.set(STORAGE_KEYS.contracts, overrides);
          return merged;
        });
      }
    } catch (e) {
      setScraperStatus(null); // serveur non disponible
    }
  }

  // Poll immédiat puis toutes les 60s
  pollFlask();
  var interval = setInterval(pollFlask, 60000);
  return function() { clearInterval(interval); };
}, []);

var saveTeam = function(t) { setTeam(t); store.set(STORAGE_KEYS.team, t); };
var saveCars = function(c) { setCars(c); store.set(STORAGE_KEYS.cars, c); };
var saveContracts = function(c) {
  setContracts(c);
  // Sauvegarder uniquement les overrides (contrats modifiés vs DEMO)
  var overrides = {};
  c.forEach(function(contract) {
    var orig = DEMO_CONTRACTS.find(function(d) { return d.id === contract.id; });
    if (!orig || contract.commercial !== orig.commercial || contract.vtaResolved !== orig.vtaResolved) {
      overrides[contract.id] = { commercial: contract.commercial, vtaResolved: contract.vtaResolved };
    }
  });
  store.set(STORAGE_KEYS.contracts, overrides);
};
var saveDailyPlan = function(p) { setDailyPlan(p); store.set(STORAGE_KEYS.dailyPlan, p); };
var saveObjectives = function(o) { setObjectives(o); store.set(STORAGE_KEYS.objectives, o); };
var saveGroups = function(g) { setGroups(g); store.set(STORAGE_KEYS.groups, g); };

if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#F5F5F7", fontFamily: "-apple-system, sans-serif" }}><p style={{ color: "#AEAEB2", fontSize: 13, fontWeight: 400 }}>Chargement…</p></div>;

return (

<div style={{ fontFamily: "-apple-system, 'SF Pro Display', 'SF Pro Text', BlinkMacSystemFont, sans-serif", background: "#F5F5F7", minHeight: "100vh", color: "#1D1D1F" }}>
<style>{`
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { -webkit-font-smoothing: antialiased; }
  button { -webkit-tap-highlight-color: transparent; font-family: inherit; }
  input, select { font-family: inherit; }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 99px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.22); }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .tab-content { animation: fadeIn 0.22s ease; }
  @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
`}</style>

  <header style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)", borderBottom: "1px solid rgba(0,0,0,0.06)", padding: "0 32px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(145deg, #0071E3 0%, #34C759 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: -0.5 }}>A</div>
      <span style={{ fontWeight: 600, fontSize: 15, color: "#1D1D1F", letterSpacing: -0.3 }}>Agence</span>
    </div>
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {scraperStatus !== null ? (
        <span title={"Dernière sync : " + (lastSync ? new Date(lastSync).toLocaleTimeString("fr-FR") : "—")}
          style={{ fontSize: 11, fontWeight: 500, color: scraperStatus.ok ? "#34C759" : "#FF3B30",
            background: scraperStatus.ok ? "#E8F8ED" : "#FFEDEC", borderRadius: 99, padding: "3px 10px",
            display: "flex", alignItems: "center", gap: 4, cursor: "default" }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: scraperStatus.ok ? "#34C759" : "#FF3B30", display: "inline-block" }} />
          {scraperStatus.syncing ? "Sync…" : scraperStatus.ok ? "Live" : "Erreur"}
        </span>
      ) : (
        <span title="Serveur Flask non démarré — voir README"
          style={{ fontSize: 11, fontWeight: 500, color: "#AEAEB2", background: "#F5F5F7", borderRadius: 99, padding: "3px 10px",
            display: "flex", alignItems: "center", gap: 4, cursor: "default" }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: "#AEAEB2", display: "inline-block" }} />
          Offline
        </span>
      )}
      <span style={{ fontSize: 12, fontWeight: 500, color: "#6E6E73", background: "#F5F5F7", borderRadius: 99, padding: "3px 10px" }}>{team.filter(function(m) { return m.active; }).length} actifs</span>
      <span style={{ fontSize: 12, fontWeight: 500, color: "#6E6E73", background: "#F5F5F7", borderRadius: 99, padding: "3px 10px" }}>{cars.length} voitures</span>
    </div>
  </header>

  <nav style={{ display: "flex", gap: 0, padding: "0 24px", background: "rgba(255,255,255,0.9)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderBottom: "1px solid rgba(0,0,0,0.06)", overflowX: "auto" }}>
    {TABS.map(function(t) {
      var active = tab === t.id;
      return (
        <button key={t.id} onClick={function() { setTab(t.id); }} style={{
          display: "flex", alignItems: "center", gap: 5, padding: "0 16px", height: 44,
          border: "none", background: "none", cursor: "pointer", fontSize: 13,
          fontWeight: active ? 600 : 400, color: active ? "#0071E3" : "#6E6E73",
          borderBottom: active ? "2px solid #0071E3" : "2px solid transparent",
          whiteSpace: "nowrap", transition: "color 0.15s, border-color 0.15s",
          letterSpacing: -0.1,
        }}>{t.label}</button>
      );
    })}
  </nav>

  <main style={{ padding: "28px 32px", maxWidth: 1100, margin: "0 auto" }} className="tab-content" key={tab}>
    {tab === "dashboard" && <DashboardTab team={team} contracts={contracts} saveContracts={saveContracts} dailyPlan={dailyPlan} cars={cars} lastSync={lastSync} scraperStatus={scraperStatus} objectives={objectives} />}
    {tab === "team" && <TeamTab team={team} saveTeam={saveTeam} contracts={contracts} saveContracts={saveContracts} groups={groups} saveGroups={saveGroups} />}
    {tab === "cars" && <CarsTab team={team} cars={cars} saveCars={saveCars} dailyPlan={dailyPlan} saveDailyPlan={saveDailyPlan} groups={groups} />}
    {tab === "contracts" && <ContractsTab contracts={contracts} team={team} dailyPlan={dailyPlan} cars={cars} saveContracts={saveContracts} />}
    {tab === "map" && <MapTab />}
    {tab === "secteurs" && <SecteursTab />}
    {tab === "objectifs" && <ObjectifsTab team={team} contracts={contracts} objectives={objectives} saveObjectives={saveObjectives} />}
    {tab === "cloche" && <ClocheTab team={team} contracts={contracts} />}
    {tab === "import" && <ImportTab team={team} saveTeam={saveTeam} contracts={contracts} saveContracts={saveContracts} />}
    {tab === "carnet" && <CarnetTab />}
  </main>
</div>
);
}

// DASHBOARD
function DashboardTab({ team, contracts, saveContracts, dailyPlan, cars, lastSync, scraperStatus, objectives }) {
// ── Dates & données ────────────────────────────────────────────────────────────
var today    = new Date().toISOString().split("T")[0];
var d3ago    = new Date(Date.now() - 3*86400000).toISOString().split("T")[0];
var weekStart = (function(){ var d = new Date(); d.setDate(d.getDate() - (d.getDay()||7) + 1); return d.toISOString().split("T")[0]; })();
var moStart  = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
var todayC   = contracts.filter(function(c){ return c.date === today; });
var weekC    = contracts.filter(function(c){ return c.date >= weekStart && c.date <= today; });
var monthC   = contracts.filter(function(c){ return c.date >= moStart  && c.date <= today; });
var brMois   = monthC.filter(function(c){ return c.status === "Branché" || c.status === "Branché VRF"; });
var tauxBr   = monthC.length > 0 ? Math.round(brMois.length / monthC.length * 100) : 0;
var brColor  = tauxBr >= 60 ? "#34C759" : tauxBr >= 40 ? "#FF9F0A" : "#FF3B30";
var wBy = {};
weekC.forEach(function(c){ wBy[c.commercial] = (wBy[c.commercial] || 0) + 1; });
var ranking = Object.entries(wBy).sort(function(a, b) { return b[1] - a[1]; });

var pending = getPendingResolutions(contracts, team, dailyPlan, cars || []);
var manualPending = pending.filter(function(p) { return p.type === 'manual'; });
var autoPending = pending.filter(function(p) { return p.type === 'auto' && p.autoTo && p.contract.commercial !== p.autoTo.name; });

function resolveContract(contractId, memberName, isVta) {
  saveContracts(contracts.map(function(c) {
    if (c.id !== contractId) return c;
    return Object.assign({}, c, { commercial: memberName, vtaResolved: isVta ? true : c.vtaResolved });
  }));
}

function applyAutoResolutions() {
  var updated = contracts.slice();
  autoPending.forEach(function(p) {
    for (var i = 0; i < updated.length; i++) {
      if (updated[i].id === p.contract.id) {
        updated[i] = Object.assign({}, updated[i], { commercial: p.autoTo.name, vtaResolved: p.contract.vtaCode ? true : updated[i].vtaResolved });
        break;
      }
    }
  });
  saveContracts(updated);
}

var ResolutionWidget = (manualPending.length > 0 || autoPending.length > 0) ? (
  <Card style={{ borderLeft: "4px solid #FF9F0A" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <span style={{ fontSize: 18 }}>⚡</span>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#1D1D1F" }}>
        Résolutions en attente
      </h3>
      {manualPending.length > 0 && <span style={{ fontSize: 11, fontWeight: 700, background: "#FF3B30", color: "#fff", borderRadius: 99, padding: "2px 7px" }}>{manualPending.length} à confirmer</span>}
      {autoPending.length > 0 && <span style={{ fontSize: 11, fontWeight: 700, background: "#34C759", color: "#fff", borderRadius: 99, padding: "2px 7px" }}>{autoPending.length} auto</span>}
    </div>

    {manualPending.length > 0 && (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#FF3B30", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 }}>À confirmer</div>
        {manualPending.map(function(p) {
          var c = p.contract;
          return (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#FFF8F0", borderRadius: 10, marginBottom: 6, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 120 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#1D1D1F" }}>{c.ville || '—'}</span>
                {c.rue && <span style={{ fontSize: 11, color: "#6E6E73", marginLeft: 6 }}>{c.rue}</span>}
                <div style={{ fontSize: 11, color: "#AEAEB2", marginTop: 2 }}>
                  {c.heure || c.date} · {c.status} · <span style={{ color: "#FF9F0A" }}>{p.reason}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {p.candidates.map(function(m) {
                  return (
                    <button key={m.id} onClick={function() { resolveContract(c.id, m.name, !!c.vtaCode); }}
                      style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid " + ROLE_COLORS[m.role], background: "#fff", color: ROLE_COLORS[m.role], fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      {m.name.split(' ')[0]}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    )}

    {autoPending.length > 0 && (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#34C759", letterSpacing: 0.8, textTransform: "uppercase", flex: 1 }}>Résolutions automatiques</div>
          <button onClick={applyAutoResolutions} style={{ padding: "4px 12px", borderRadius: 8, border: "none", background: "#34C759", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            Appliquer tout ({autoPending.length})
          </button>
        </div>
        {autoPending.map(function(p) {
          var c = p.contract;
          return (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", background: "#F0FFF4", borderRadius: 10, marginBottom: 5, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "#34C759", fontWeight: 700, minWidth: 16 }}>→</span>
              <div style={{ flex: 1, minWidth: 100 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#1D1D1F" }}>{c.ville || '—'}</span>
                <span style={{ fontSize: 11, color: "#6E6E73", marginLeft: 6 }}>{c.status}</span>
                <div style={{ fontSize: 11, color: "#AEAEB2", marginTop: 1 }}>{p.reason}</div>
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#6E6E73" }}>{c.commercial}</span>
                <span style={{ fontSize: 11, color: "#AEAEB2" }}>→</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#34C759" }}>{p.autoTo.name}</span>
              </div>
              <button onClick={function() { resolveContract(c.id, p.autoTo.name, !!c.vtaCode); }}
                style={{ padding: "3px 10px", borderRadius: 7, border: "1px solid #34C75950", background: "#34C75910", color: "#34C759", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                ✓
              </button>
            </div>
          );
        })}
      </div>
    )}
  </Card>
) : null;

// ── Voitures du jour ──────────────────────────────────────────────────────────
var passengerIds = new Set();
(cars || []).forEach(function(car){
  var cp = dailyPlan && dailyPlan[car.id];
  if (cp && cp.members) cp.members.forEach(function(id){ passengerIds.add(id); });
});
function isCarInactive(car){ return car.driverId ? passengerIds.has(car.driverId) : false; }
var CAR_PALETTE = ["#0071E3","#34C759","#FF9F0A","#AF52DE","#FF2D55","#5AC8FA","#FF6B35"];
var activePlannedCars = (cars || []).filter(function(car){
  if (isCarInactive(car)) return false;
  var cp = dailyPlan && dailyPlan[car.id];
  return cp && (cp.sector || (cp.members && cp.members.length > 0));
});

// ── Tendance 7j ───────────────────────────────────────────────────────────────
var last7 = [];
for (var i7 = 6; i7 >= 0; i7--) {
  var d7 = new Date(Date.now() - i7 * 86400000);
  var ds7 = d7.toISOString().split("T")[0];
  last7.push({ date: ds7, label: d7.toLocaleDateString("fr-FR", { weekday:"short" }).slice(0,3), count: contracts.filter(function(c){ return c.date === ds7; }).length });
}
var maxDay = Math.max.apply(null, last7.map(function(d){ return d.count; }).concat([1]));

// ── Objectifs semaine ─────────────────────────────────────────────────────────
function getWkKey(ds){ var d = new Date(ds+"T12:00:00"); d.setDate(d.getDate()-(d.getDay()||7)+1); return d.toISOString().split("T")[0]; }
var weekObjectives = ((objectives||{})[getWkKey(today)])||{};
var activeNM = team.filter(function(m){ return m.active && m.role !== "Manager"; });
var objMembers = activeNM.filter(function(m){ return (weekObjectives[m.name]||0)>0; })
  .sort(function(a,b){ return (weekObjectives[b.name]||0)-(weekObjectives[a.name]||0); });

// ── Alertes ───────────────────────────────────────────────────────────────────
var alertes = [];
activeNM.forEach(function(m){
  var sorted = contracts.filter(function(c){ return c.commercial === m.name; }).sort(function(a,b){ return b.date.localeCompare(a.date); });
  if (sorted.length === 0 || sorted[0].date < d3ago) alertes.push({ col:"#FF3B30", bg:"#FEE2E2", icon:"🔴", text:m.name.split(" ")[0]+" — aucun contrat depuis +3j" });
});
var anMois = monthC.filter(function(c){ return c.status === "Annulé" || c.status === "Résilié"; });
if (monthC.length >= 5 && anMois.length/monthC.length > 0.2) alertes.push({ col:"#FF9F0A", bg:"#FFF7E6", icon:"🟠", text:"Annulations : "+Math.round(anMois.length/monthC.length*100)+"% ce mois ("+anMois.length+" contrats)" });
var totObj = activeNM.reduce(function(s,m){ return s+(weekObjectives[m.name]||0); },0);
var totReal = activeNM.reduce(function(s,m){ return s+(wBy[m.name]||0); },0);
if (totObj>0 && (new Date().getDay()===0||new Date().getDay()>=3) && totReal/totObj<0.5) alertes.push({ col:"#FF9F0A", bg:"#FFF7E6", icon:"⚠️", text:"Objectif semaine à risque : "+totReal+"/"+totObj+" ("+Math.round(totReal/totObj*100)+"%)" });
var attenteOld = contracts.filter(function(c){ return c.status === "En attente RDV" && c.date < d3ago; });
if (attenteOld.length > 0) alertes.push({ col:"#0071E3", bg:"#EFF6FF", icon:"🔵", text:attenteOld.length+" contrat"+(attenteOld.length>1?"s":"")+" en attente RDV depuis +3j" });

var medals = ["🥇","🥈","🥉"];

return (
<div style={{ display:"flex", flexDirection:"column", gap:24 }}>
{ResolutionWidget}

{/* ── Stat cards ── */}
<div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
  <StatCard label="Aujourd'hui" value={todayC.length} color="#0071E3" />
  <StatCard label="Cette semaine" value={weekC.length} color="#34C759" />
  <StatCard label="Ce mois" value={monthC.length} color="#FF9F0A" />
  <StatCard label="Branchement mois" value={tauxBr+"%"} color={brColor} sub={brMois.length+"/"+monthC.length+" branchés"} />
</div>

{/* ── Voitures + Tendance ── */}
<div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:16 }}>
  <Card>
    <h3 style={{ margin:"0 0 14px", fontSize:14, fontWeight:700, color:"#1D1D1F", letterSpacing:-0.3 }}>🚗 Voitures du jour</h3>
    {!dailyPlan ? (
      <p style={{ color:"#AEAEB2", fontSize:13, margin:0 }}>Plan voitures non configuré</p>
    ) : activePlannedCars.length === 0 ? (
      <p style={{ color:"#AEAEB2", fontSize:13, margin:0 }}>Aucune voiture planifiée</p>
    ) : (
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {activePlannedCars.map(function(car, idx){
          var cp = dailyPlan[car.id] || {};
          var color = CAR_PALETTE[idx % CAR_PALETTE.length];
          var driver = team.find(function(m){ return m.id === car.driverId; });
          var passengers = (cp.members||[]).map(function(id){ return team.find(function(m){ return m.id===id; }); }).filter(Boolean).filter(function(m){ return !driver || m.id!==driver.id; });
          var allMembers = driver ? [driver].concat(passengers) : passengers;
          return (
            <div key={car.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:color+"12", borderRadius:10, borderLeft:"3px solid "+color }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:700, color:color, marginBottom:4 }}>
                  {cp.sector || <span style={{ color:"#AEAEB2", fontWeight:400 }}>Secteur non défini</span>}
                  {cp.zoneType === "talc" && <span style={{ fontSize:10, background:color, color:"#fff", borderRadius:4, padding:"1px 5px", marginLeft:6 }}>TALC</span>}
                </div>
                <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                  {allMembers.map(function(m, mi){
                    return <span key={m.id} style={{ fontSize:11, fontWeight:mi===0?700:500, color:"#1D1D1F", background:"#fff", borderRadius:20, padding:"2px 8px", border:"1px solid "+color+"50" }}>{mi===0?"🚗 ":""}{m.name.split(" ")[0]}</span>;
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </Card>

  <Card>
    <h3 style={{ margin:"0 0 14px", fontSize:14, fontWeight:700, color:"#1D1D1F", letterSpacing:-0.3 }}>Tendance 7j</h3>
    <div style={{ display:"flex", gap:4, alignItems:"flex-end", height:90, paddingTop:8 }}>
      {last7.map(function(d){
        var h = Math.max(4, Math.round(d.count/maxDay*70));
        var isToday = d.date === today;
        return (
          <div key={d.date} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
            {d.count > 0 && <div style={{ fontSize:10, fontWeight:700, color:isToday?"#0071E3":"#6E6E73" }}>{d.count}</div>}
            <div style={{ flex:1, display:"flex", alignItems:"flex-end", width:"100%" }}>
              <div style={{ width:"100%", height:d.count>0?h:4, borderRadius:4, background:isToday?"#0071E3":d.count>0?"#C7E0FF":"#F0F0F0" }} />
            </div>
            <div style={{ fontSize:9, color:isToday?"#0071E3":"#AEAEB2", fontWeight:isToday?700:400 }}>{d.label}</div>
          </div>
        );
      })}
    </div>
  </Card>
</div>

{/* ── Classement + Objectifs ── */}
<div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
  <Card>
    <h3 style={{ margin:"0 0 14px", fontSize:14, fontWeight:600, color:"#1D1D1F", letterSpacing:-0.3 }}>Classement semaine</h3>
    {ranking.length === 0 ? <p style={{ color:"#AEAEB2", fontSize:13, margin:0 }}>Aucun contrat cette semaine</p> : ranking.slice(0,6).map(function(entry, i){
      return (
        <div key={entry[0]} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
          <div style={{ width:22, textAlign:"center", fontSize:i<3?16:11, color:i>=3?"#AEAEB2":undefined }}>{i<3?medals[i]:i+1}</div>
          <div style={{ flex:1, fontSize:13, fontWeight:500, color:"#1D1D1F" }}>{entry[0]}</div>
          <span style={{ fontSize:14, fontWeight:700, color:"#1D1D1F" }}>{entry[1]}</span>
        </div>
      );
    })}
  </Card>

  <Card>
    <h3 style={{ margin:"0 0 14px", fontSize:14, fontWeight:600, color:"#1D1D1F", letterSpacing:-0.3 }}>Objectifs semaine</h3>
    {objMembers.length === 0 ? (
      <p style={{ color:"#AEAEB2", fontSize:13, margin:0 }}>Aucun objectif fixé pour cette semaine</p>
    ) : objMembers.map(function(m){
      var obj = weekObjectives[m.name]||0;
      var real = wBy[m.name]||0;
      var pct = obj>0 ? Math.min(100, Math.round(real/obj*100)) : 0;
      var col = pct>=100?"#34C759":pct>=60?"#FF9F0A":"#FF3B30";
      return (
        <div key={m.name} style={{ marginBottom:10 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
            <span style={{ fontSize:12, fontWeight:500, color:"#1D1D1F" }}>{m.name.split(" ")[0]}</span>
            <span style={{ fontSize:12, fontWeight:700, color:col }}>{real}<span style={{ color:"#AEAEB2", fontWeight:400 }}>/{obj}</span></span>
          </div>
          <div style={{ height:4, background:"#E5E5EA", borderRadius:99, overflow:"hidden" }}>
            <div style={{ width:pct+"%", height:"100%", background:col, borderRadius:99 }} />
          </div>
        </div>
      );
    })}
  </Card>
</div>

{/* ── Alertes ── */}
{alertes.length > 0 && (
  <Card>
    <h3 style={{ margin:"0 0 12px", fontSize:14, fontWeight:700, color:"#1D1D1F", letterSpacing:-0.3 }}>Alertes</h3>
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {alertes.map(function(a, i){
        return (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:a.bg, borderRadius:8 }}>
            <span style={{ fontSize:13 }}>{a.icon}</span>
            <span style={{ fontSize:12, color:a.col, fontWeight:600 }}>{a.text}</span>
          </div>
        );
      })}
    </div>
  </Card>
)}
</div>
);
}

// TEAM
function TeamTab({ team, saveTeam, contracts, saveContracts, groups, saveGroups }) {
const [mo, setMo] = useState(false);
const [em, setEm] = useState(null);
const [f, setF] = useState({ name: "", role: "Debutant", operators: ["Free"], permis: false, voiture: false, vstCodes: [], lentCodes: [] });
const [fl, setFl] = useState("");
const [vue, setVue] = useState("liste");
const [picker, setPicker] = useState(null);
const [vstInputs, setVstInputs] = useState({});
const [vstAddOpen, setVstAddOpen] = useState(null);
const [fVstInput, setFVstInput] = useState("");
const [fLentCode, setFLentCode] = useState("");
const [fLentBorrower, setFLentBorrower] = useState("");

function openAdd() { setEm(null); setF({ name: "", role: "Debutant", operators: ["Free"], permis: false, voiture: false, vstCodes: [], lentCodes: [] }); setFVstInput(""); setFLentCode(""); setFLentBorrower(""); setMo(true); }
function openEdit(m) { setEm(m); setF({ name: m.name, role: m.role, operators: Array.isArray(m.operators) ? m.operators : [m.operator || "Free"], permis: m.permis, voiture: m.voiture, vstCodes: m.vstCodes ? m.vstCodes.slice() : [], lentCodes: m.lentCodes ? m.lentCodes.slice() : [] }); setFVstInput(""); setFLentCode(""); setFLentBorrower(""); setMo(true); }
function save() {
if (!f.name.trim()) return;
if (em) { saveTeam(team.map(function(m) { return m.id === em.id ? Object.assign({}, m, f) : m; })); }
else { saveTeam([...team, { id: Date.now(), ...f, active: true }]); }
setMo(false);
}

function assignVstCode(login, memberId) {
  var newTeam = team.map(function(m) {
    if (m.id === memberId) {
      var codes = (m.vstCodes || []).filter(function(c) { return c !== login; });
      return Object.assign({}, m, { vstCodes: codes.concat(login) });
    }
    // Remove from any other member who had this code
    return Object.assign({}, m, { vstCodes: (m.vstCodes || []).filter(function(c) { return c !== login; }) });
  });
  saveTeam(newTeam);
  var member = newTeam.find(function(m) { return m.id === memberId; });
  if (member && saveContracts) {
    var updated = contracts.map(function(c) {
      if (c.commercial === login) return Object.assign({}, c, { commercial: member.name });
      return c;
    });
    saveContracts(updated);
  }
}

function addVstCodeToMember(code, memberId) {
  var trimmed = code.trim().toLowerCase();
  if (!trimmed) return;
  if (!trimmed.startsWith('vst-')) trimmed = 'vst-' + trimmed;
  saveTeam(team.map(function(m) {
    if (m.id === memberId) {
      var codes = (m.vstCodes || []);
      if (codes.indexOf(trimmed) >= 0) return m;
      return Object.assign({}, m, { vstCodes: codes.concat(trimmed) });
    }
    return m;
  }));
}

function removeVstCodeFromMember(code, memberId) {
  saveTeam(team.map(function(m) {
    if (m.id === memberId) return Object.assign({}, m, { vstCodes: (m.vstCodes || []).filter(function(c) { return c !== code; }) });
    return m;
  }));
}

var roleOrder = { "Manager": 0, "Assistant Manager": 1, "Formateur": 2, "Confirme": 3, "Debutant": 4 };

// Reverse map: borrowerId → [{code, lenderName}]
var borrowerMap = {};
team.forEach(function(m) {
  (m.lentCodes || []).forEach(function(lc) {
    if (!borrowerMap[lc.borrowerId]) borrowerMap[lc.borrowerId] = [];
    borrowerMap[lc.borrowerId].push({ code: lc.code, lenderName: m.name });
  });
});

function MemberCard({ m, onClick }) {
  var borrowed = borrowerMap[m.id] || [];
  return (
    <Card style={{ padding: 14, opacity: m.active ? 1 : 0.5, cursor: onClick ? "pointer" : "default" }} onClick={onClick}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: ROLE_COLORS[m.role] + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: ROLE_COLORS[m.role] }}>{m.name[0]}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1D1D1F", letterSpacing: -0.2 }}>{m.name}</div>
          <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap", alignItems: "center" }}>
            <Badge color={ROLE_COLORS[m.role]}>{ROLE_LABELS[m.role]}</Badge>
            {(Array.isArray(m.operators) ? m.operators : [m.operator]).filter(Boolean).map(function(op) { return <Badge key={op} color={OP_COLORS[op]}>{op}</Badge>; })}
            {m.permis && <Badge color="#34C759">Permis</Badge>}
            {m.voiture && <Badge color="#7C3AED">Voiture</Badge>}
            {!m.active && <Badge color="#FF3B30">Inactif</Badge>}
            {borrowed.map(function(bc) { return <Badge key={bc.code} color="#FF9F0A">Code de {bc.lenderName.split(' ')[0]}</Badge>; })}
          </div>
        </div>
      </div>
    </Card>
  );
}

return (
<div>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
  <div style={{ display: "flex", gap: 6 }}>
    <Btn s="sm" v={vue === "liste" ? "primary" : "secondary"} onClick={function() { setVue("liste"); }}>Liste ({team.length})</Btn>
    <Btn s="sm" v={vue === "orga" ? "primary" : "secondary"} onClick={function() { setVue("orga"); }}>Organigramme</Btn>
    <Btn s="sm" v={vue === "vst" ? "primary" : "secondary"} onClick={function() { setVue("vst"); }}>Codes VST</Btn>
  </div>
  <div style={{ display: "flex", gap: 6 }}>
    {vue === "liste" && ROLES.map(function(r) {
      var count = team.filter(function(m) { return m.role === r; }).length;
      if (!count) return null;
      return <Btn key={r} s="sm" v={fl === r ? "primary" : "secondary"} onClick={function() { setFl(fl === r ? "" : r); }}>{r} ({count})</Btn>;
    })}
    {vue !== "vst" && <Btn onClick={openAdd}>+ Ajouter</Btn>}
  </div>
</div>

{vue === "liste" && ROLES.map(function(role) {
  var members = team.filter(function(m) { return m.role === role && (!fl || m.role === fl); });
  if (!members.length) return null;
  return (
    <div key={role} style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ width: 4, height: 20, borderRadius: 2, background: ROLE_COLORS[role] }} />
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: ROLE_COLORS[role] }}>{role}s ({members.length})</h3>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
        {members.map(function(m) { return <MemberCard key={m.id} m={m} onClick={function() { openEdit(m); }} />; })}
      </div>
    </div>
  );
})}

{vue === "orga" && (function() {
  var GROUP_PALETTE = ["#0071E3","#34C759","#FF9F0A","#AF52DE","#FF2D55","#5AC8FA","#FF6B35","#00B4D8","#06D6A0","#E63946"];

  function addGroup() { saveGroups([...groups, { id: Date.now(), name: "Nouvelle équipe", memberIds: [] }]); }
  function deleteGroup(gid) { saveGroups(groups.filter(function(g) { return g.id !== gid; })); }
  function renameGroup(gid, name) { saveGroups(groups.map(function(g) { return g.id === gid ? Object.assign({}, g, { name: name }) : g; })); }
  function removeMember(gid, mid) { saveGroups(groups.map(function(g) { return g.id === gid ? Object.assign({}, g, { memberIds: g.memberIds.filter(function(id) { return id !== mid; }) }) : g; })); }
  function addMember(gid, mid) {
    var member = team.find(function(m) { return m.id === mid; });
    saveGroups(groups.map(function(g) {
      if (g.id === gid) {
        var newIds = g.memberIds.indexOf(mid) >= 0 ? g.memberIds : g.memberIds.concat(mid);
        var updates = { memberIds: newIds };
        if (g.memberIds.length === 0 && member) {
          updates.name = "Équipe de " + member.name.split(' ')[0];
        }
        return Object.assign({}, g, updates);
      }
      return g;
    }));
  }

  function initials(name) { var p = name.split(' '); return (p[0][0] + (p[p.length-1][0] || '')).toUpperCase(); }

  function Avatar({ name, role, size }) {
    var sz = size || 48;
    return (
      <div style={{ width: sz, height: sz, borderRadius: sz, background: ROLE_COLORS[role] + "22", border: "2px solid " + ROLE_COLORS[role] + "44", display: "flex", alignItems: "center", justifyContent: "center", fontSize: sz * 0.33, fontWeight: 700, color: ROLE_COLORS[role], flexShrink: 0 }}>
        {initials(name)}
      </div>
    );
  }

  function MemberTile({ m, onRemove, isLeader, accent }) {
    var ops = Array.isArray(m.operators) ? m.operators : [m.operator].filter(Boolean);
    return (
      <div style={{ background: "#fff", borderRadius: 14, padding: isLeader ? "14px 16px" : "10px 14px", boxShadow: "0 1px 4px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", display: "flex", alignItems: "center", gap: 12, position: "relative", borderLeft: isLeader ? "3px solid " + accent : "none", minWidth: isLeader ? 200 : 170 }}>
        <Avatar name={m.name} role={m.role} size={isLeader ? 46 : 38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: isLeader ? 14 : 13, fontWeight: 600, color: "#1D1D1F", letterSpacing: -0.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
          <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: ROLE_COLORS[m.role], background: ROLE_COLORS[m.role] + "15", padding: "1px 6px", borderRadius: 99 }}>{ROLE_LABELS[m.role]}</span>
            {ops.map(function(op) { return <span key={op} style={{ fontSize: 10, fontWeight: 600, color: OP_COLORS[op], background: OP_COLORS[op] + "18", padding: "1px 6px", borderRadius: 99 }}>{op}</span>; })}
          </div>
        </div>
        {onRemove && (
          <button onClick={onRemove} style={{ position: "absolute", top: 5, right: 5, background: "none", border: "none", cursor: "pointer", color: "#C7C7CC", fontSize: 16, lineHeight: 1, padding: 2, borderRadius: 99, display: "flex", alignItems: "center" }} title="Retirer">×</button>
        )}
      </div>
    );
  }

  function PickerModal({ gid, available, onClose }) {
    var [search, setSearch] = useState("");
    var filtered = available.filter(function(m) { return m.name.toLowerCase().indexOf(search.toLowerCase()) >= 0; });
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
        <div style={{ background: "#fff", borderRadius: 20, padding: 24, width: 360, maxHeight: "70vh", display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={function(e) { e.stopPropagation(); }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1D1D1F" }}>Ajouter un membre</div>
          <input autoFocus value={search} onChange={function(e) { setSearch(e.target.value); }} placeholder="Rechercher..." style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #E5E5EA", fontSize: 13, outline: "none" }} />
          <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {filtered.length === 0 && <div style={{ color: "#AEAEB2", fontSize: 13, textAlign: "center", padding: 20 }}>Aucun membre disponible</div>}
            {filtered.map(function(m) {
              var ops = Array.isArray(m.operators) ? m.operators : [m.operator].filter(Boolean);
              return (
                <div key={m.id} onClick={function() { addMember(gid, m.id); onClose(); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12, cursor: "pointer", background: "#F5F5F7", transition: "background 0.1s" }}
                  onMouseEnter={function(e) { e.currentTarget.style.background = "#E8E8ED"; }}
                  onMouseLeave={function(e) { e.currentTarget.style.background = "#F5F5F7"; }}>
                  <Avatar name={m.name} role={m.role} size={36} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1D1D1F" }}>{m.name}</div>
                    <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: ROLE_COLORS[m.role] }}>{ROLE_LABELS[m.role]}</span>
                      {ops.map(function(op) { return <span key={op} style={{ fontSize: 10, color: OP_COLORS[op] }}>{op}</span>; })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <Btn v="secondary" onClick={onClose}>Fermer</Btn>
        </div>
      </div>
    );
  }

  var assignedIds = new Set();
  groups.forEach(function(g) { g.memberIds.forEach(function(id) { assignedIds.add(id); }); });
  var unassigned = team.filter(function(m) { return !assignedIds.has(m.id); });

  return (
    <div>
      {picker && <PickerModal gid={picker} available={team.filter(function(m) { return groups.find(function(g) { return g.id === picker; }).memberIds.indexOf(m.id) < 0; })} onClose={function() { setPicker(null); }} />}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <span style={{ fontSize: 13, color: "#6E6E73" }}>{team.length} membres · {groups.length} équipe{groups.length !== 1 ? "s" : ""}{unassigned.length > 0 ? " · " + unassigned.length + " sans équipe" : ""}</span>
        <Btn onClick={addGroup}>+ Nouvelle équipe</Btn>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {groups.map(function(g, gi) {
          var accent = GROUP_PALETTE[gi % GROUP_PALETTE.length];
          var members = g.memberIds.map(function(id) { return team.find(function(m) { return m.id === id; }); }).filter(Boolean);
          var leader = members[0];
          var rest = members.slice(1);
          var available = team.filter(function(m) { return g.memberIds.indexOf(m.id) < 0; });

          return (
            <div key={g.id} style={{ background: "#FAFAFA", borderRadius: 18, border: "1px solid #E5E5EA", overflow: "hidden" }}>
              {/* Group header */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: "1px solid #F0F0F0", background: accent + "08" }}>
                <div style={{ width: 10, height: 10, borderRadius: 99, background: accent, flexShrink: 0 }} />
                <input value={g.name} onChange={function(e) { renameGroup(g.id, e.target.value); }}
                  style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "#1D1D1F", background: "transparent", border: "none", outline: "none", letterSpacing: -0.3 }} />
                <span style={{ fontSize: 12, color: "#AEAEB2", fontWeight: 500 }}>{members.length} membre{members.length !== 1 ? "s" : ""}</span>
                <button onClick={function() { deleteGroup(g.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#C7C7CC", fontSize: 18, lineHeight: 1, padding: "0 2px" }} title="Supprimer">×</button>
              </div>

              {/* Group body */}
              <div style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap" }}>
                {/* Leader */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: accent, letterSpacing: 0.8, textTransform: "uppercase" }}>Référent</span>
                  {leader
                    ? <MemberTile m={leader} onRemove={function() { removeMember(g.id, leader.id); }} isLeader={true} accent={accent} />
                    : <div style={{ width: 200, height: 68, border: "2px dashed " + accent + "44", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", color: accent + "88", fontSize: 12 }}>Aucun référent</div>
                  }
                </div>

                {/* Connector */}
                {rest.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", padding: "0 12px", marginTop: 22 }}>
                    <svg width="32" height="2"><line x1="0" y1="1" x2="32" y2="1" stroke={accent} strokeWidth="2" strokeDasharray="4 3" /></svg>
                  </div>
                )}

                {/* Members */}
                {rest.length > 0 && (
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#AEAEB2", letterSpacing: 0.8, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Commerciaux</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {rest.map(function(m) { return <MemberTile key={m.id} m={m} onRemove={function() { removeMember(g.id, m.id); }} isLeader={false} accent={accent} />; })}
                    </div>
                  </div>
                )}

                {/* Add button */}
                {available.length > 0 && (
                  <div style={{ marginTop: 22, marginLeft: 12 }}>
                    <button onClick={function() { setPicker(g.id); }} style={{ width: 38, height: 38, borderRadius: 99, border: "2px dashed " + accent + "66", background: accent + "0A", cursor: "pointer", color: accent, fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 300 }}>+</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Unassigned */}
        {unassigned.length > 0 && (
          <div style={{ background: "#FAFAFA", borderRadius: 18, border: "1px dashed #D2D2D7", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderBottom: "1px solid #F0F0F0" }}>
              <div style={{ width: 10, height: 10, borderRadius: 99, background: "#AEAEB2", flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: "#AEAEB2", flex: 1 }}>Sans équipe</span>
              <span style={{ fontSize: 12, color: "#AEAEB2" }}>{unassigned.length} membre{unassigned.length !== 1 ? "s" : ""}</span>
            </div>
            <div style={{ padding: "16px 18px", display: "flex", flexWrap: "wrap", gap: 8 }}>
              {unassigned.map(function(m) { return <MemberTile key={m.id} m={m} onRemove={null} isLeader={false} accent="#AEAEB2" />; })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
})()}

{vue === "vst" && (function() {
  // Build a map of all VST codes to their assigned member name
  var codeToName = {};
  team.forEach(function(m) { (m.vstCodes || []).forEach(function(c) { codeToName[c] = m.name; }); });

  // Unresolved = contracts where commercial still starts with 'vst-'
  var unresGroups = {};
  contracts.forEach(function(c) {
    if (c.commercial && c.commercial.startsWith('vst-')) {
      if (!unresGroups[c.commercial]) unresGroups[c.commercial] = [];
      unresGroups[c.commercial].push(c);
    }
  });
  var unresList = Object.keys(unresGroups).sort();

  return (
    <div>
      {/* Unresolved codes */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 4, height: 20, borderRadius: 2, background: "#FF3B30" }} />
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#FF3B30" }}>
            Codes non attribués {unresList.length > 0 ? "(" + unresList.length + ")" : "— tout est résolu ✓"}
          </h3>
        </div>
        {unresList.length === 0 && (
          <p style={{ fontSize: 13, color: "#AEAEB2", margin: 0 }}>Tous les codes sont attribués à un commercial.</p>
        )}
        {unresList.map(function(login) {
          var ctrs = unresGroups[login];
          return (
            <Card key={login} style={{ padding: "12px 16px", marginBottom: 8, borderLeft: "3px solid #FF3B30" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <code style={{ fontSize: 13, fontWeight: 700, color: "#FF3B30", background: "#FF3B3010", padding: "3px 8px", borderRadius: 6 }}>{login}</code>
                <span style={{ fontSize: 12, color: "#6E6E73" }}>{ctrs.length} contrat{ctrs.length > 1 ? "s" : ""}</span>
                <span style={{ fontSize: 11, color: "#AEAEB2" }}>dernier : {ctrs[ctrs.length - 1].date || "—"}</span>
                <div style={{ marginLeft: "auto" }}>
                  <Sel
                    value=""
                    placeholder="Attribuer à..."
                    onChange={function(v) { if (v) assignVstCode(login, parseInt(v)); }}
                    options={team.filter(function(m) { return m.active; }).sort(function(a,b) { return a.name.localeCompare(b.name); }).map(function(m) { return { value: String(m.id), label: m.name }; })}
                  />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* All team members with their codes */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 4, height: 20, borderRadius: 2, background: "#0071E3" }} />
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#1D1D1F" }}>Codes par commercial</h3>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {team.filter(function(m) { return m.active; }).sort(function(a,b) { return a.name.localeCompare(b.name); }).map(function(m) {
            var codes = m.vstCodes || [];
            var inputVal = vstInputs[m.id] || "";
            return (
              <Card key={m.id} style={{ padding: "10px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: ROLE_COLORS[m.role] + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: ROLE_COLORS[m.role], flexShrink: 0 }}>{m.name[0]}</div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#1D1D1F", minWidth: 150 }}>{m.name}</span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1, alignItems: "center" }}>
                    {codes.map(function(code) {
                      return (
                        <span key={code} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#0071E310", border: "1px solid #0071E330", borderRadius: 8, padding: "2px 8px", fontSize: 12, fontWeight: 600, color: "#0071E3" }}>
                          {code}
                          <button onClick={function() { removeVstCodeFromMember(code, m.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#0071E380", fontSize: 14, lineHeight: 1, padding: 0, display: "flex", alignItems: "center" }}>×</button>
                        </span>
                      );
                    })}
                    {codes.length === 0 && <span style={{ fontSize: 12, color: "#AEAEB2", fontStyle: "italic" }}>Aucun code attribué</span>}
                  </div>
                  <button onClick={function(e) { e.stopPropagation(); setVstAddOpen(vstAddOpen === m.id ? null : m.id); var v = {}; v[m.id] = ""; setVstInputs(Object.assign({}, vstInputs, v)); }}
                    style={{ width: 28, height: 28, borderRadius: 8, border: "1px dashed #0071E360", background: vstAddOpen === m.id ? "#0071E310" : "transparent", cursor: "pointer", color: "#0071E3", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 300, flexShrink: 0 }}>
                    {vstAddOpen === m.id ? "×" : "+"}
                  </button>
                  {vstAddOpen === m.id && <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      autoFocus
                      value={inputVal}
                      onChange={function(e) { var v = {}; v[m.id] = e.target.value; setVstInputs(Object.assign({}, vstInputs, v)); }}
                      onKeyDown={function(e) {
                        if (e.key === 'Escape') { setVstAddOpen(null); return; }
                        if (e.key === 'Enter' && inputVal.trim()) {
                          addVstCodeToMember(inputVal, m.id);
                          var v = {}; v[m.id] = ""; setVstInputs(Object.assign({}, vstInputs, v));
                          setVstAddOpen(null);
                        }
                      }}
                      placeholder="vst-xxx + Entrée"
                      style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #0071E340", fontSize: 12, width: 140, fontFamily: "monospace", outline: "none", background: "#F5F9FF" }}
                    />
                    <Btn s="sm" v="secondary" onClick={function() {
                      if (inputVal.trim()) {
                        addVstCodeToMember(inputVal, m.id);
                        var v = {}; v[m.id] = ""; setVstInputs(Object.assign({}, vstInputs, v));
                        setVstAddOpen(null);
                      }
                    }}>✓</Btn>
                  </div>}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
})()}

<Modal open={mo} onClose={function() { setMo(false); }} title={em ? "Modifier" : "Ajouter"}>
<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
<div><label style={{ fontSize: 12, fontWeight: 600, color: "#6E6E73", display: "block", marginBottom: 4 }}>Nom</label><Inp value={f.name} onChange={function(v) { setF(Object.assign({}, f, { name: v })); }} placeholder="Nom" /></div>
<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
<div><label style={{ fontSize: 12, fontWeight: 600, color: "#6E6E73", display: "block", marginBottom: 4 }}>Role</label><Sel value={f.role} onChange={function(v) { setF(Object.assign({}, f, { role: v })); }} options={ROLES} style={{ width: "100%" }} /></div>
<div><label style={{ fontSize: 12, fontWeight: 600, color: "#6E6E73", display: "block", marginBottom: 4 }}>Opérateurs</label><div style={{ display: "flex", gap: 12, marginTop: 4 }}>{OPERATORS.map(function(op) { var checked = (f.operators || []).indexOf(op) >= 0; return <label key={op} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}><input type="checkbox" checked={checked} onChange={function(e) { var ops = (f.operators || []).filter(function(x) { return x !== op; }); if (e.target.checked) ops = ops.concat(op); setF(Object.assign({}, f, { operators: ops })); }} /><Badge color={OP_COLORS[op]}>{op}</Badge></label>; })}</div></div>
</div>
<div style={{ display: "flex", gap: 20 }}>
<label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}><input type="checkbox" checked={f.permis} onChange={function(e) { setF(Object.assign({}, f, { permis: e.target.checked })); }} />Permis</label>
<label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}><input type="checkbox" checked={f.voiture} onChange={function(e) { setF(Object.assign({}, f, { voiture: e.target.checked })); }} />Voiture</label>
</div>
<div>
  <label style={{ fontSize: 12, fontWeight: 600, color: "#6E6E73", display: "block", marginBottom: 6 }}>Codes VST</label>
  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
    {(f.vstCodes || []).map(function(code) {
      return (
        <span key={code} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#0071E310", border: "1px solid #0071E330", borderRadius: 8, padding: "2px 8px", fontSize: 12, fontWeight: 600, color: "#0071E3" }}>
          {code}
          <button type="button" onClick={function() { setF(Object.assign({}, f, { vstCodes: (f.vstCodes || []).filter(function(c) { return c !== code; }) })); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#0071E380", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
        </span>
      );
    })}
    {(f.vstCodes || []).length === 0 && <span style={{ fontSize: 12, color: "#AEAEB2", fontStyle: "italic" }}>Aucun code</span>}
  </div>
  <div style={{ display: "flex", gap: 6 }}>
    <input
      value={fVstInput}
      onChange={function(e) { setFVstInput(e.target.value); }}
      onKeyDown={function(e) {
        if (e.key === 'Enter' && fVstInput.trim()) {
          e.preventDefault();
          var code = fVstInput.trim().toLowerCase();
          if (!code.startsWith('vst-')) code = 'vst-' + code;
          if ((f.vstCodes || []).indexOf(code) < 0) setF(Object.assign({}, f, { vstCodes: (f.vstCodes || []).concat(code) }));
          setFVstInput("");
        }
      }}
      placeholder="vst-xxx + Entrée"
      style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)", fontSize: 12, fontFamily: "monospace", outline: "none" }}
    />
    <Btn s="sm" v="secondary" onClick={function() {
      if (fVstInput.trim()) {
        var code = fVstInput.trim().toLowerCase();
        if (!code.startsWith('vst-')) code = 'vst-' + code;
        if ((f.vstCodes || []).indexOf(code) < 0) setF(Object.assign({}, f, { vstCodes: (f.vstCodes || []).concat(code) }));
        setFVstInput("");
      }
    }}>Ajouter</Btn>
  </div>
</div>
{(f.vstCodes || []).length > 0 && (
<div>
  <label style={{ fontSize: 12, fontWeight: 600, color: "#6E6E73", display: "block", marginBottom: 6 }}>Codes temporaires prêtés à</label>
  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
    {(f.lentCodes || []).map(function(lc) {
      var borrower = team.find(function(m) { return m.id === lc.borrowerId; });
      return (
        <div key={lc.code + lc.borrowerId} style={{ display: "flex", alignItems: "center", gap: 8, background: "#FF9F0A0D", border: "1px solid #FF9F0A30", borderRadius: 8, padding: "5px 10px" }}>
          <code style={{ fontSize: 12, fontWeight: 700, color: "#FF9F0A" }}>{lc.code}</code>
          <span style={{ fontSize: 12, color: "#6E6E73" }}>→</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#1D1D1F", flex: 1 }}>{borrower ? borrower.name : "?"}</span>
          <button type="button" onClick={function() { setF(Object.assign({}, f, { lentCodes: (f.lentCodes || []).filter(function(x) { return !(x.code === lc.code && x.borrowerId === lc.borrowerId); }) })); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#AEAEB2", fontSize: 14, padding: 0 }}>×</button>
        </div>
      );
    })}
    {(f.lentCodes || []).length === 0 && <span style={{ fontSize: 12, color: "#AEAEB2", fontStyle: "italic" }}>Aucun prêt actif</span>}
  </div>
  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
    <Sel
      value={fLentCode}
      placeholder="Code à prêter..."
      onChange={function(code) {
        setFLentCode(code);
        if (code && fLentBorrower) {
          var bid = parseInt(fLentBorrower);
          if (!(f.lentCodes || []).find(function(x) { return x.code === code && x.borrowerId === bid; }))
            setF(Object.assign({}, f, { lentCodes: (f.lentCodes || []).concat({ code: code, borrowerId: bid }) }));
          setFLentCode(""); setFLentBorrower("");
        }
      }}
      options={(f.vstCodes || []).map(function(c) { return { value: c, label: c }; })}
      style={{ flex: 1 }}
    />
    <span style={{ fontSize: 12, color: "#6E6E73" }}>→</span>
    <Sel
      value={fLentBorrower}
      placeholder="Prêter à..."
      onChange={function(bid) {
        setFLentBorrower(bid);
        if (bid && fLentCode) {
          var borrowerId = parseInt(bid);
          if (!(f.lentCodes || []).find(function(x) { return x.code === fLentCode && x.borrowerId === borrowerId; }))
            setF(Object.assign({}, f, { lentCodes: (f.lentCodes || []).concat({ code: fLentCode, borrowerId: borrowerId }) }));
          setFLentCode(""); setFLentBorrower("");
        }
      }}
      options={team.filter(function(m) { return m.active && (!em || m.id !== em.id); }).sort(function(a,b) { return a.name.localeCompare(b.name); }).map(function(m) { return { value: String(m.id), label: m.name }; })}
      style={{ flex: 1 }}
    />
  </div>
</div>
)}
<div style={{ display: "flex", gap: 10 }}>
<Btn onClick={save} style={{ flex: 1 }}>{em ? "Enregistrer" : "Ajouter"}</Btn>
{em && <Btn v="secondary" onClick={function() { saveTeam(team.map(function(m) { return m.id === em.id ? Object.assign({}, m, { active: !m.active }) : m; })); setMo(false); }}>{em.active ? "Desactiver" : "Reactiver"}</Btn>}
{em && <Btn v="danger" onClick={function() { saveTeam(team.filter(function(m) { return m.id !== em.id; })); setMo(false); }}>Suppr</Btn>}
</div>
</div>
</Modal>

</div>
);
}

// Secteur autocomplete — suggestions from all known sectors (JACHERE + JACHERE_TALC)
var ALL_SECTORS = Object.keys(JACHERE).map(function(n) { return { name: n, talc: false }; })
  .concat(Object.keys(JACHERE_TALC).map(function(n) { return { name: n, talc: true }; }));

function SectorAutocomplete({ value, onSelect }) {
  var [open, setOpen] = useState(false);
  var q = (value || "").trim().toUpperCase();
  var matches = q.length >= 1 ? ALL_SECTORS.filter(function(s) {
    return s.name.toUpperCase().indexOf(q) >= 0 && s.name.toUpperCase() !== q;
  }) : [];
  return (
    <div style={{ position: "relative" }}>
      <input
        value={value}
        onChange={function(e) { onSelect(e.target.value, null); setOpen(true); }}
        onFocus={function() { setOpen(true); }}
        onBlur={function() { setTimeout(function() { setOpen(false); }, 150); }}
        placeholder="Secteur..."
        style={{ fontSize: 11, padding: "3px 8px", borderRadius: 8, border: "1px solid #E5E5EA", outline: "none", width: 100, color: "#1D1D1F", background: "#fff", fontFamily: "inherit" }}
      />
      {open && matches.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: "#fff", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", zIndex: 200, minWidth: 160, overflow: "hidden", border: "1px solid #E5E5EA" }}>
          {matches.slice(0, 6).map(function(s) {
            return (
              <div key={s.name} onMouseDown={function() { onSelect(s.name, s.talc ? "talc" : "stratygo"); setOpen(false); }}
                style={{ padding: "8px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                onMouseEnter={function(e) { e.currentTarget.style.background = "#F5F5F7"; }}
                onMouseLeave={function(e) { e.currentTarget.style.background = ""; }}>
                <span>{s.name}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: s.talc ? "#FF9F0A" : "#6E6E73", background: s.talc ? "#FF9F0A18" : "#6E6E7318", borderRadius: 20, padding: "2px 6px" }}>{s.talc ? "TALC" : "Stratygo"}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CommuneAutocomplete({ value, onChange, sectorName, isTalc }) {
  var [open, setOpen] = useState(false);
  var sectorData = sectorName ? (isTalc ? JACHERE_TALC[sectorName] : JACHERE[sectorName]) : null;
  var communes = sectorData ? sectorData.communes : [];
  var q = (value || "").trim().toUpperCase();
  var matches = communes.filter(function(c) {
    return q.length >= 1 && c.v.indexOf(q) >= 0 && c.v !== q;
  });
  return (
    <div style={{ position: "relative" }}>
      <input
        value={value}
        onChange={function(e) { onChange(e.target.value); setOpen(true); }}
        onFocus={function() { setOpen(true); }}
        onBlur={function() { setTimeout(function() { setOpen(false); }, 150); }}
        placeholder={sectorName ? "Commune..." : "Secteur d'abord"}
        disabled={!sectorName}
        style={{ fontSize: 11, padding: "4px 8px", borderRadius: 8, border: "1px solid #E5E5EA", outline: "none", width: 130, color: "#1D1D1F", background: sectorName ? "#fff" : "#F5F5F7", fontFamily: "inherit", boxSizing: "border-box" }}
      />
      {open && matches.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: "#fff", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", zIndex: 300, minWidth: 150, overflow: "hidden", border: "1px solid #E5E5EA" }}>
          {matches.slice(0, 7).map(function(c) {
            return (
              <div key={c.v} onMouseDown={function() { onChange(c.v); setOpen(false); }}
                style={{ padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", color: "#1D1D1F" }}
                onMouseEnter={function(e) { e.currentTarget.style.background = "#F5F5F7"; }}
                onMouseLeave={function(e) { e.currentTarget.style.background = ""; }}>
                <span>{c.v}</span>
                <span style={{ fontSize: 10, color: "#AEAEB2" }}>{c.p.toLocaleString("fr-FR")} pr.</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// CARS
function CarsTab({ team, cars, saveCars, dailyPlan, saveDailyPlan, groups }) {
  var CAR_PALETTE = ["#0071E3","#34C759","#FF9F0A","#AF52DE","#FF2D55","#5AC8FA","#FF6B35","#00B4D8"];
  const [plan, setPlan] = useState(dailyPlan || {});
  const [dragging, setDragging] = useState(null); // { memberId, fromCarId }
  const [dropTarget, setDropTarget] = useState(null); // carId or "pool"
  const [picker, setPicker] = useState(null); // carId
  const [mo, setMo] = useState(false);
  const [ec, setEc] = useState(null);
  const [cf, setCf] = useState({ name: "", seats: 5, driverId: null });

  var at = team.filter(function(m) { return m.active; });

  // Passengers first: all members explicitly added to a car
  var passengerIds = new Set();
  cars.forEach(function(car) {
    var cp = plan[car.id];
    if (cp && cp.members) cp.members.forEach(function(id) { passengerIds.add(id); });
  });

  // A car is inactive today if its driver is riding as passenger in another car
  function isCarInactive(car) { return car.driverId ? passengerIds.has(car.driverId) : false; }

  // inCar = passengers + drivers of ACTIVE cars only
  var inCar = new Set(passengerIds);
  cars.forEach(function(car) {
    if (car.driverId && !isCarInactive(car)) inCar.add(car.driverId);
  });
  var unassigned = at.filter(function(m) { return !inCar.has(m.id); });

  function updatePlan(np) { setPlan(np); saveDailyPlan(np); }

  function addPassenger(cid, mid) {
    var u = JSON.parse(JSON.stringify(plan));
    if (!u[cid]) u[cid] = { members: [], sector: "", zoneType: "stratygo", vtaCode: "" };
    if (u[cid].members.indexOf(mid) < 0) u[cid].members.push(mid);
    updatePlan(u);
  }

  function removePassenger(cid, mid) {
    var u = JSON.parse(JSON.stringify(plan));
    if (!u[cid]) return;
    u[cid].members = u[cid].members.filter(function(i) { return i !== mid; });
    updatePlan(u);
  }

  function moveToPool(mid, fromCarId) {
    var u = JSON.parse(JSON.stringify(plan));
    if (fromCarId && u[fromCarId]) {
      u[fromCarId].members = u[fromCarId].members.filter(function(i) { return i !== mid; });
    }
    updatePlan(u);
  }

  function movePassenger(mid, fromCarId, toCarId) {
    var u = JSON.parse(JSON.stringify(plan));
    if (fromCarId && u[fromCarId]) {
      u[fromCarId].members = u[fromCarId].members.filter(function(i) { return i !== mid; });
    }
    if (!u[toCarId]) u[toCarId] = { members: [], sector: "", zoneType: "stratygo", vtaCode: "" };
    if (u[toCarId].members.indexOf(mid) < 0) u[toCarId].members.push(mid);
    updatePlan(u);
  }

  function setSector(cid, s) {
    var u = JSON.parse(JSON.stringify(plan));
    if (!u[cid]) u[cid] = { members: [], sector: "", zoneType: "stratygo", vtaCode: "" };
    u[cid].sector = s; updatePlan(u);
  }

  function setZoneType(cid, z) {
    var u = JSON.parse(JSON.stringify(plan));
    if (!u[cid]) u[cid] = { members: [], sector: "", zoneType: "stratygo", vtaCode: "" };
    u[cid].zoneType = z; if (z === "stratygo") u[cid].vtaCode = "";
    updatePlan(u);
  }

  function setMemberCommune(cid, mid, commune) {
    var u = JSON.parse(JSON.stringify(plan));
    if (!u[cid]) u[cid] = { members: [], sector: "", zoneType: "stratygo", vtaCode: "" };
    if (!u[cid].memberCommunes) u[cid].memberCommunes = {};
    u[cid].memberCommunes[mid] = commune;
    updatePlan(u);
  }

  function setVtaCode(cid, v) {
    var u = JSON.parse(JSON.stringify(plan));
    if (!u[cid]) u[cid] = { members: [], sector: "", zoneType: "talc", vtaCode: "" };
    u[cid].vtaCode = v; updatePlan(u);
  }

  function saveCar() {
    if (!cf.name.trim()) return;
    if (ec) saveCars(cars.map(function(c) { return c.id === ec.id ? Object.assign({}, c, cf) : c; }));
    else saveCars([...cars, { id: Date.now(), ...cf }]);
    setMo(false); setEc(null);
  }

  function resetDay() {
    var np = {};
    cars.forEach(function(car) {
      var old = plan[car.id] || {};
      np[car.id] = { members: [], sector: old.sector || "", zoneType: old.zoneType || "stratygo", vtaCode: old.vtaCode || "" };
    });
    updatePlan(np);
  }

  // Reverse map: person name → VTA code
  var VTA_PERSON_MAP = {};
  Object.keys(VTA_GROUPS).forEach(function(code) {
    VTA_GROUPS[code].forEach(function(name) {
      if (!VTA_PERSON_MAP[name]) VTA_PERSON_MAP[name] = code;
    });
  });

  function initials(name) { var p = name.split(' '); return (p[0][0] + (p[p.length-1][0] || '')).toUpperCase(); }

  function Avatar({ name, role, size }) {
    var sz = size || 40;
    return (
      <div style={{ width: sz, height: sz, borderRadius: sz, background: ROLE_COLORS[role] + "22", border: "2px solid " + ROLE_COLORS[role] + "55", display: "flex", alignItems: "center", justifyContent: "center", fontSize: sz * 0.33, fontWeight: 700, color: ROLE_COLORS[role], flexShrink: 0 }}>
        {initials(name)}
      </div>
    );
  }

  function MemberTile({ m, onRemove, isDriver, accent, isDrag, fromCarId, showVta }) {
    var ops = Array.isArray(m.operators) ? m.operators : [m.operator].filter(Boolean);
    var vtaCode = showVta ? VTA_PERSON_MAP[m.name] : null;
    return (
      <div
        draggable={isDrag}
        onDragStart={isDrag ? function(e) { e.dataTransfer.effectAllowed = "move"; setDragging({ memberId: m.id, fromCarId: fromCarId }); } : undefined}
        onDragEnd={function() { setDragging(null); setDropTarget(null); }}
        style={{ background: "#fff", borderRadius: 14, padding: isDriver ? "14px 16px" : "10px 14px", boxShadow: "0 2px 8px rgba(0,0,0,0.09), 0 0 0 1px rgba(0,0,0,0.05)", display: "flex", alignItems: "center", gap: 10, position: "relative", borderLeft: "3px solid " + accent + (isDriver ? "" : "99"), minWidth: isDriver ? 185 : 160, opacity: dragging && dragging.memberId === m.id ? 0.4 : 1, cursor: isDrag ? "grab" : "default", transition: "opacity 0.15s", flexShrink: 0 }}>
        <Avatar name={m.name} role={m.role} size={isDriver ? 44 : 38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: isDriver ? 14 : 13, fontWeight: 600, color: "#1D1D1F", letterSpacing: -0.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
          <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: ROLE_COLORS[m.role], background: ROLE_COLORS[m.role] + "20", padding: "1px 6px", borderRadius: 99 }}>{ROLE_LABELS[m.role]}</span>
            {ops.map(function(op) { return <span key={op} style={{ fontSize: 10, fontWeight: 700, color: OP_COLORS[op], background: OP_COLORS[op] + "20", padding: "1px 6px", borderRadius: 99 }}>{op}</span>; })}
            {m.permis && <span style={{ fontSize: 10, fontWeight: 600, color: "#34C759", background: "#34C75920", padding: "1px 6px", borderRadius: 99 }}>Permis</span>}
            {vtaCode && <span style={{ fontSize: 10, fontWeight: 700, color: "#FF3B30", background: "#FF3B3012", padding: "1px 6px", borderRadius: 99, letterSpacing: 0.2 }}>{vtaCode}</span>}
          </div>
        </div>
        {onRemove && <button onClick={onRemove} style={{ position: "absolute", top: 5, right: 5, background: "none", border: "none", cursor: "pointer", color: "#C7C7CC", fontSize: 16, lineHeight: 1, padding: 2 }}>×</button>}
      </div>
    );
  }

  function PickerModal({ car, available, onClose }) {
    var [search, setSearch] = useState("");
    var driver = car.driverId ? team.find(function(m) { return m.id === car.driverId; }) : null;
    var driverOps = driver ? (Array.isArray(driver.operators) ? driver.operators : [driver.operator].filter(Boolean)) : [];
    var driverGroup = groups ? groups.find(function(g) { return driver && g.memberIds.indexOf(car.driverId) >= 0; }) : null;

    function score(m) {
      var s = 0;
      if (driverGroup && driverGroup.memberIds.indexOf(m.id) >= 0) s += 2;
      var mOps = Array.isArray(m.operators) ? m.operators : [m.operator].filter(Boolean);
      if (driverOps.some(function(op) { return mOps.indexOf(op) >= 0; })) s += 1;
      return s;
    }

    var sorted = available.slice().sort(function(a, b) { return score(b) - score(a); });
    var filtered = sorted.filter(function(m) { return m.name.toLowerCase().indexOf(search.toLowerCase()) >= 0; });

    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
        <div style={{ background: "#fff", borderRadius: 20, padding: 24, width: 380, maxHeight: "72vh", display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={function(e) { e.stopPropagation(); }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1D1D1F" }}>Ajouter dans {car.name}</div>
          <input autoFocus value={search} onChange={function(e) { setSearch(e.target.value); }} placeholder="Rechercher..." style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #E5E5EA", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
          <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {filtered.length === 0 && <div style={{ color: "#AEAEB2", fontSize: 13, textAlign: "center", padding: 20 }}>Aucun membre disponible</div>}
            {filtered.map(function(m) {
              var s = score(m);
              var ops = Array.isArray(m.operators) ? m.operators : [m.operator].filter(Boolean);
              return (
                <div key={m.id} onClick={function() { addPassenger(car.id, m.id); onClose(); }}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12, cursor: "pointer", background: s >= 2 ? "#F0FDF4" : s >= 1 ? "#EFF6FF" : "#F5F5F7", border: s >= 2 ? "1px solid #34C75928" : s >= 1 ? "1px solid #0071E328" : "1px solid transparent", transition: "filter 0.1s" }}
                  onMouseEnter={function(e) { e.currentTarget.style.filter = "brightness(0.96)"; }}
                  onMouseLeave={function(e) { e.currentTarget.style.filter = ""; }}>
                  <Avatar name={m.name} role={m.role} size={36} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1D1D1F" }}>{m.name}</div>
                    <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: ROLE_COLORS[m.role] }}>{ROLE_LABELS[m.role]}</span>
                      {ops.map(function(op) { return <span key={op} style={{ fontSize: 10, color: OP_COLORS[op], fontWeight: 600 }}>{op}</span>; })}
                    </div>
                  </div>
                  {s >= 2 && <span style={{ fontSize: 10, fontWeight: 700, color: "#34C759", background: "#F0FDF4", padding: "2px 7px", borderRadius: 99, flexShrink: 0 }}>Équipe</span>}
                  {s === 1 && <span style={{ fontSize: 10, fontWeight: 700, color: "#0071E3", background: "#EFF6FF", padding: "2px 7px", borderRadius: 99, flexShrink: 0 }}>Opérateur</span>}
                </div>
              );
            })}
          </div>
          <Btn v="secondary" onClick={onClose}>Fermer</Btn>
        </div>
      </div>
    );
  }

  var pickerCar = picker ? cars.find(function(c) { return c.id === picker; }) : null;

  return (
    <div>
      {pickerCar && (
        <PickerModal
          car={pickerCar}
          available={at.filter(function(m) {
            // Not the driver of this car
            if (pickerCar.driverId === m.id) return false;
            // Not already a passenger in this car
            var cp = plan[pickerCar.id];
            if (cp && cp.members && cp.members.indexOf(m.id) >= 0) return false;
            // Not already a passenger in another car
            if (passengerIds.has(m.id)) return false;
            return true;
          })}
          onClose={function() { setPicker(null); }}
        />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: -0.4, color: "#1D1D1F" }}>Voitures</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6E6E73" }}>{unassigned.length} non assignés · {cars.length} voitures</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn v="secondary" onClick={resetDay}>Réinitialiser la journée</Btn>
          <Btn onClick={function() { setEc(null); setCf({ name: "", seats: 5, driverId: null }); setMo(true); }}>+ Voiture</Btn>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {cars.map(function(car, ci) {
          var accent = CAR_PALETTE[ci % CAR_PALETTE.length];
          var cp = plan[car.id] || { members: [], sector: "", zoneType: "stratygo", vtaCode: "" };
          var driver = car.driverId ? team.find(function(m) { return m.id === car.driverId; }) : null;
          var passengers = (cp.members || []).map(function(id) { return team.find(function(m) { return m.id === id; }); }).filter(Boolean);
          var maxPass = car.seats - (driver ? 1 : 0);
          var canAdd = passengers.length < maxPass;
          var isDrop = dropTarget === car.id;
          var inactive = isCarInactive(car);

          // Find which car the driver is riding in today
          var driverRidingIn = inactive && driver ? cars.find(function(c) {
            var cp2 = plan[c.id];
            return cp2 && cp2.members && cp2.members.indexOf(car.driverId) >= 0;
          }) : null;

          return (
            <div key={car.id}
              style={{ background: inactive ? "#F5F5F7" : isDrop ? accent + "07" : "#FAFAFA", borderRadius: 18, border: inactive ? "1px solid #E5E5EA" : isDrop ? "2px solid " + accent + "55" : "1px solid #E5E5EA", overflow: "hidden", transition: "background 0.15s, border-color 0.15s", opacity: inactive ? 0.6 : 1 }}
              onDragOver={inactive ? undefined : function(e) { e.preventDefault(); setDropTarget(car.id); }}
              onDragLeave={inactive ? undefined : function(e) { if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null); }}
              onDrop={inactive ? undefined : function(e) {
                e.preventDefault(); setDropTarget(null);
                if (!dragging) return;
                if (dragging.fromCarId === car.id) return;
                if (driver && dragging.memberId === car.driverId) return;
                if (passengers.length >= maxPass) return;
                movePassenger(dragging.memberId, dragging.fromCarId, car.id);
                setDragging(null);
              }}>

              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 18px", borderBottom: "1px solid #F0F0F0", background: inactive ? "#EEEEEF" : accent + "08", flexWrap: "wrap" }}>
                <div style={{ width: 10, height: 10, borderRadius: 99, background: inactive ? "#AEAEB2" : accent, flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: inactive ? "#AEAEB2" : "#1D1D1F", letterSpacing: -0.3, flex: 1 }}>{car.name}</span>
                {inactive
                  ? <span style={{ fontSize: 11, fontWeight: 600, color: "#AEAEB2", background: "#E5E5EA", padding: "2px 8px", borderRadius: 99 }}>
                      {driver ? driver.name.split(' ')[0] : "Conducteur"} est en voiture avec {driverRidingIn ? driverRidingIn.name.replace("Voiture de ", "").replace("Voiture d'", "") : "quelqu'un"}
                    </span>
                  : <>
                      <span style={{ fontSize: 12, color: "#AEAEB2", fontWeight: 500 }}>{passengers.length + (driver ? 1 : 0)}/{car.seats}</span>
                      <SectorAutocomplete value={cp.sector || ""} onSelect={function(name, zoneType) {
                        var u = JSON.parse(JSON.stringify(plan));
                        if (!u[car.id]) u[car.id] = { members: [], sector: "", zoneType: "stratygo", vtaCode: "" };
                        u[car.id].sector = name;
                        if (zoneType) { u[car.id].zoneType = zoneType; if (zoneType === "stratygo") u[car.id].vtaCode = ""; }
                        updatePlan(u);
                      }} />
                      <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid #E5E5EA" }}>
                        <button onClick={function() { setZoneType(car.id, "stratygo"); }} style={{ padding: "3px 8px", fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer", background: cp.zoneType !== "talc" ? "#1D1D1F" : "#F5F5F7", color: cp.zoneType !== "talc" ? "#fff" : "#AEAEB2", fontFamily: "inherit" }}>Stratygo</button>
                        <button onClick={function() { setZoneType(car.id, "talc"); }} style={{ padding: "3px 8px", fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer", background: cp.zoneType === "talc" ? "#FF3B30" : "#F5F5F7", color: cp.zoneType === "talc" ? "#fff" : "#AEAEB2", fontFamily: "inherit" }}>TALC</button>
                      </div>
                    </>
                }
                <button onClick={function() { setEc(car); setCf({ name: car.name, seats: car.seats, driverId: car.driverId || null }); setMo(true); }} style={{ background: "#F0F0F0", border: "none", cursor: "pointer", fontSize: 11, color: "#6E6E73", padding: "3px 8px", borderRadius: 6, fontFamily: "inherit" }}>Éditer</button>
              </div>

              {/* Body: horizontal layout — only if active */}
              {!inactive && <div style={{ padding: "16px 18px", display: "flex", alignItems: "flex-start", gap: 0 }}>
                {/* Driver */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start", flexShrink: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: accent, letterSpacing: 0.8, textTransform: "uppercase" }}>Conducteur</span>
                  {driver
                    ? <>
                        <MemberTile m={driver} isDriver={true} accent={accent} isDrag={false} fromCarId={car.id} showVta={cp.zoneType === "talc"} />
                        <CommuneAutocomplete value={(cp.memberCommunes && cp.memberCommunes[driver.id]) || ""} onChange={function(v) { setMemberCommune(car.id, driver.id, v); }} sectorName={cp.sector} isTalc={cp.zoneType === "talc"} />
                      </>
                    : <div style={{ width: 185, height: 70, border: "2px dashed " + accent + "44", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", color: accent + "88", fontSize: 12 }}>Aucun conducteur</div>
                  }
                </div>

                {/* Connector */}
                <div style={{ display: "flex", alignItems: "center", padding: "0 10px", marginTop: 26 }}>
                  <svg width="28" height="2" style={{ flexShrink: 0 }}><line x1="0" y1="1" x2="28" y2="1" stroke={accent} strokeWidth="2" strokeDasharray="4 3" /></svg>
                </div>

                {/* Passengers */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#AEAEB2", letterSpacing: 0.8, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Passagers ({passengers.length}/{maxPass})</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    {passengers.map(function(m) {
                      return (
                        <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <MemberTile m={m} onRemove={function() { removePassenger(car.id, m.id); }} isDriver={false} accent={accent} isDrag={true} fromCarId={car.id} showVta={cp.zoneType === "talc"} />
                          <CommuneAutocomplete value={(cp.memberCommunes && cp.memberCommunes[m.id]) || ""} onChange={function(v) { setMemberCommune(car.id, m.id, v); }} sectorName={cp.sector} isTalc={cp.zoneType === "talc"} />
                        </div>
                      );
                    })}
                    {passengers.length === 0 && !isDrop && (
                      <span style={{ color: "#C7C7CC", fontSize: 12, padding: "6px 0" }}>Glissez des membres ici ou utilisez +</span>
                    )}
                    {isDrop && dragging && (
                      <div style={{ width: 155, height: 60, border: "2px dashed " + accent, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", color: accent, fontSize: 12, fontWeight: 600 }}>Déposer ici</div>
                    )}
                    {canAdd && (
                      <button onClick={function() { setPicker(car.id); }} style={{ width: 38, height: 38, borderRadius: 99, border: "2px dashed " + accent + "66", background: accent + "0A", cursor: "pointer", color: accent, fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 300, flexShrink: 0 }}>+</button>
                    )}
                  </div>
                </div>
              </div>}

              {/* TALC: show summary of codes in car */}
              {!inactive && cp.zoneType === "talc" && (driver || passengers.length > 0) && (
                <div style={{ padding: "0 18px 14px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: "#AEAEB2", fontWeight: 600 }}>Codes VTA :</span>
                  {[driver, ...passengers].filter(Boolean).map(function(m) {
                    var code = VTA_PERSON_MAP[m.name];
                    if (!code) return null;
                    return <span key={m.id} style={{ fontSize: 11, fontWeight: 700, color: "#FF3B30", background: "#FF3B3010", padding: "2px 8px", borderRadius: 99 }}>{code} <span style={{ fontWeight: 400, color: "#6E6E73" }}>({m.name.split(' ')[0]})</span></span>;
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Unassigned pool */}
      <div style={{ marginTop: 24, background: dropTarget === "pool" ? "#F0F0F0" : "#FAFAFA", borderRadius: 18, border: "1px dashed #D2D2D7", overflow: "hidden", transition: "background 0.15s" }}
        onDragOver={function(e) { e.preventDefault(); setDropTarget("pool"); }}
        onDragLeave={function(e) { if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null); }}
        onDrop={function(e) {
          e.preventDefault(); setDropTarget(null);
          if (!dragging || !dragging.fromCarId) return;
          moveToPool(dragging.memberId, dragging.fromCarId);
          setDragging(null);
        }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderBottom: "1px solid #F0F0F0" }}>
          <div style={{ width: 10, height: 10, borderRadius: 99, background: "#AEAEB2", flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#AEAEB2", flex: 1 }}>Non assignés</span>
          <span style={{ fontSize: 12, color: "#AEAEB2" }}>{unassigned.length} membre{unassigned.length !== 1 ? "s" : ""}</span>
        </div>
        <div style={{ padding: "16px 18px", display: "flex", flexWrap: "wrap", gap: 8 }}>
          {unassigned.length === 0 && <span style={{ fontSize: 12, color: "#C7C7CC" }}>Tout le monde est assigné 🎉</span>}
          {unassigned.map(function(m) {
            return <MemberTile key={m.id} m={m} isDriver={false} accent="#AEAEB2" isDrag={true} fromCarId={null} />;
          })}
        </div>
      </div>

      {/* Car modal */}
      <Modal open={mo} onClose={function() { setMo(false); setEc(null); }} title={ec ? "Modifier la voiture" : "Ajouter une voiture"}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Inp value={cf.name} onChange={function(v) { setCf(Object.assign({}, cf, { name: v })); }} placeholder="Nom de la voiture" />
          <Inp type="number" value={cf.seats} onChange={function(v) { setCf(Object.assign({}, cf, { seats: Number(v) })); }} placeholder="Nombre de places" />
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#6E6E73", display: "block", marginBottom: 4 }}>Conducteur habituel</label>
            <Sel value={cf.driverId || ""} onChange={function(v) { setCf(Object.assign({}, cf, { driverId: v ? Number(v) : null })); }}
              placeholder="Aucun conducteur"
              options={team.filter(function(m) { return m.active; }).map(function(m) { return { value: m.id, label: m.name + " (" + ROLE_LABELS[m.role] + ")" }; })}
              style={{ width: "100%" }} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn onClick={saveCar} style={{ flex: 1 }}>{ec ? "Enregistrer" : "Ajouter"}</Btn>
            {ec && <Btn v="danger" onClick={function() { saveCars(cars.filter(function(c) { return c.id !== ec.id; })); setMo(false); setEc(null); }}>Supprimer</Btn>}
          </div>
        </div>
      </Modal>
    </div>
  );
}

// CONTRACTS
function ContractsTab({ contracts, team, dailyPlan, cars, saveContracts }) {
const [view, setView] = useState(null); // null | "today" | "week" | "month" | "quality"
const [fD, setFD] = useState("");
const [fC, setFC] = useState("");
const [fO, setFO] = useState("");
const [fS, setFS] = useState("");
const [showAll, setShowAll] = useState(false);
const [qCom, setQCom] = useState(null); // selected commercial in quality detail
const [qFrom, setQFrom] = useState("");
const [qTo, setQTo] = useState("");
const [selectedCom, setSelectedCom] = useState(null); // recap commercial
const [comFrom, setComFrom] = useState("");
const [comTo, setComTo] = useState("");

// ── shared helpers ──────────────────────────────────────────────────────────
var pendingVTA = contracts.filter(function(c) { return c.vtaCode && !c.vtaResolved; });
function resolveAllVTA() {
  var updated = contracts.map(function(c) {
    if (!c.vtaCode || c.vtaResolved) return c;
    var group = VTA_GROUPS[c.vtaCode];
    if (!group) return Object.assign({}, c, { vtaResolved: true });
    var resolved = c.commercial;
    if (dailyPlan) {
      var presentIds = [];
      Object.values(dailyPlan).forEach(function(entry) { if (entry && entry.members) presentIds = presentIds.concat(entry.members); });
      var presentNames = presentIds.map(function(id) { var m = team.find(function(t) { return t.id === id; }); return m ? m.name : null; }).filter(Boolean);
      var inGroup = group.filter(function(name) { return presentNames.indexOf(name) >= 0; });
      if (inGroup.length === 1) resolved = inGroup[0];
    }
    return Object.assign({}, c, { commercial: resolved, vtaResolved: true });
  });
  saveContracts(updated);
}

var COM_PALETTE = ["#0071E3","#34C759","#FF9F0A","#AF52DE","#FF3B30","#5AC8FA","#FF2D55","#5856D6","#32ADE6","#FF6961"];
var comColorCache = {};
var comColorI = 0;
var allComs = Array.from(new Set(contracts.map(function(c) { return c.commercial; }))).sort();
function comColor(name) {
  if (!comColorCache[name]) comColorCache[name] = COM_PALETTE[comColorI++ % COM_PALETTE.length];
  return comColorCache[name];
}
allComs.forEach(function(n) { comColor(n); });

function topComs(list) {
  var counts = {};
  list.forEach(function(c) { counts[c.commercial] = (counts[c.commercial] || 0) + 1; });
  return Object.entries(counts).sort(function(a,b) { return b[1] - a[1]; });
}

function CRow(c, i) {
  var col = comColor(c.commercial);
  var initials = c.commercial.split(" ").map(function(w){ return w[0]; }).slice(0,2).join("").toUpperCase();
  var sCol = statusColor(c.status);
  return (
    <div key={c.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 16px", borderTop: i > 0 ? "1px solid rgba(0,0,0,0.05)" : "none" }}>
      <div style={{ width:34, height:34, borderRadius:99, background:col+"20", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
        <span style={{ fontSize:11, fontWeight:800, color:col }}>{initials}</span>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
          <span style={{ fontSize:13, fontWeight:700, color:col }}>{c.commercial.split(" ")[0]}</span>
          {c.vtaCode && !c.vtaResolved && <span style={{ fontSize:10, fontWeight:700, color:"#FF9F0A", background:"#FF9F0A18", borderRadius:4, padding:"1px 5px" }}>VTA?</span>}
          <span style={{ fontSize:11, color:"#AEAEB2" }}>{c.heure}</span>
        </div>
        <div style={{ fontSize:13, fontWeight:600, color:"#1D1D1F", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
          {c.ville}{c.rue ? <span style={{ fontWeight:400, color:"#6E6E73" }}> · {c.rue}</span> : ""}
        </div>
      </div>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0 }}>
        <Badge color={sCol}>{c.status}</Badge>
        {c.box && <span style={{ fontSize:10, color:"#AEAEB2" }}>{c.box}</span>}
      </div>
    </div>
  );
}

function CList(list) {
  return <Card style={{ padding:0, overflow:"hidden" }}>{list.map(function(c,i){ return CRow(c,i); })}</Card>;
}

// ── date ranges ──────────────────────────────────────────────────────────────
var now = new Date();
var todayStr = now.toISOString().split("T")[0];
var yest = new Date(now); yest.setDate(now.getDate()-1);
var yestStr = yest.toISOString().split("T")[0];

var dow = now.getDay(); var dFromMon = dow === 0 ? 6 : dow - 1;
var wkStart = new Date(now); wkStart.setDate(now.getDate() - dFromMon);
var wkStartStr = wkStart.toISOString().split("T")[0];
var lwStart = new Date(wkStart); lwStart.setDate(wkStart.getDate()-7);
var lwSameEnd = new Date(lwStart); lwSameEnd.setDate(lwStart.getDate()+dFromMon);
var lwStartStr = lwStart.toISOString().split("T")[0];
var lwSameEndStr = lwSameEnd.toISOString().split("T")[0];

var moStart = new Date(now.getFullYear(), now.getMonth(), 1);
var moStartStr = moStart.toISOString().split("T")[0];
var pmStart = new Date(now.getFullYear(), now.getMonth()-1, 1);
var pmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
var pmStartStr = pmStart.toISOString().split("T")[0];
var pmEndStr = pmEnd.toISOString().split("T")[0];

var todayC   = contracts.filter(function(c){ return c.date === todayStr; });
var yestC    = contracts.filter(function(c){ return c.date === yestStr; });
var weekC    = contracts.filter(function(c){ return c.date >= wkStartStr && c.date <= todayStr; });
var lwC      = contracts.filter(function(c){ return c.date >= lwStartStr && c.date <= lwSameEndStr; });
var monthC   = contracts.filter(function(c){ return c.date >= moStartStr && c.date <= todayStr; });
var prevMonC = contracts.filter(function(c){ return c.date >= pmStartStr && c.date <= pmEndStr; });

function delta(a, b) {
  var d = a - b; if (d === 0) return null;
  return <span style={{ fontSize:12, fontWeight:700, color: d>0?"#34C759":"#FF3B30" }}>{d>0?"+":""}{d}</span>;
}

// ── DETAIL VIEWS ─────────────────────────────────────────────────────────────
if (view === "today") {
  // Build passengerIds for today
  var todayPassIds = new Set();
  if (dailyPlan && cars) {
    cars.forEach(function(car) {
      var cp = dailyPlan[car.id];
      if (cp && cp.members) cp.members.forEach(function(id) { todayPassIds.add(id); });
    });
  }
  function isCarInactiveT(car) { return car.driverId ? todayPassIds.has(car.driverId) : false; }
  function getCarMembersT(car) {
    var ms = [];
    if (car.driverId) { var drv = team.find(function(m){ return m.id === car.driverId; }); if (drv) ms.push(drv); }
    var cp = dailyPlan ? dailyPlan[car.id] : null;
    if (cp && cp.members) cp.members.forEach(function(id) { var m = team.find(function(t){ return t.id === id; }); if (m) ms.push(m); });
    return ms;
  }
  function personCountT(name) { return todayC.filter(function(c){ return c.commercial === name; }).length; }
  function memberCommuneT(car, memberId) {
    if (!dailyPlan || !dailyPlan[car.id]) return "";
    return (dailyPlan[car.id].memberCommunes || {})[memberId] || "";
  }
  function carTotalT(car) {
    return getCarMembersT(car).reduce(function(sum, m){ return sum + personCountT(m.name); }, 0);
  }
  // Find which car a driver rides in (for inactive display)
  function ridingInCarT(driverId) {
    if (!dailyPlan || !cars) return null;
    var found = cars.find(function(car) {
      var cp = dailyPlan[car.id];
      return cp && cp.members && cp.members.indexOf(driverId) >= 0;
    });
    return found || null;
  }
  var carsToShow = cars ? cars.filter(function(car) { return getCarMembersT(car).length > 0; }) : [];

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <Btn v="ghost" onClick={function(){ setView(null); }}>← Retour</Btn>
        <h2 style={{ margin:0, fontSize:20, fontWeight:800 }}>Aujourd'hui</h2>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginLeft:"auto" }}>
          {delta(todayC.length, yestC.length)}
          <span style={{ fontSize:12, color:"#AEAEB2" }}>vs hier ({yestC.length})</span>
        </div>
      </div>
      {!dailyPlan || carsToShow.length === 0 ? (
        <Card><div style={{ textAlign:"center", padding:40, color:"#AEAEB2" }}>Plan voitures non configuré</div></Card>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {carsToShow.map(function(car) {
            var inactive = isCarInactiveT(car);
            var members = getCarMembersT(car);
            var total = carTotalT(car);
            var ridingIn = inactive && car.driverId ? ridingInCarT(car.driverId) : null;
            return (
              <Card key={car.id} style={{ padding:0, overflow:"hidden", opacity: inactive ? 0.55 : 1 }}>
                <div style={{ padding:"12px 16px", background:"#F5F5F7", display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:14, fontWeight:700, color:"#1D1D1F" }}>{car.name}</span>
                  {inactive && (
                    <span style={{ fontSize:11, color:"#FF9F0A", fontWeight:600 }}>
                      {ridingIn ? "en voiture avec " + ridingIn.name : "inactive"}
                    </span>
                  )}
                  <div style={{ marginLeft:"auto", background: total > 0 ? "#0071E3" : "#E5E5EA", color: total > 0 ? "#fff" : "#AEAEB2", borderRadius:99, fontSize:13, fontWeight:800, padding:"2px 12px", minWidth:28, textAlign:"center" }}>{total}</div>
                </div>
                {members.map(function(m, i) {
                  var count = personCountT(m.name);
                  var commune = memberCommuneT(car, m.id);
                  var col = comColor(m.name);
                  var initials = m.name.split(" ").map(function(w){ return w[0]; }).slice(0,2).join("").toUpperCase();
                  var isDriver = car.driverId === m.id;
                  return (
                    <div key={m.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 16px", borderTop: i > 0 ? "1px solid rgba(0,0,0,0.05)" : "none" }}>
                      <div style={{ width:36, height:36, borderRadius:99, background:col+"20", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, position:"relative" }}>
                        <span style={{ fontSize:11, fontWeight:800, color:col }}>{initials}</span>
                        {isDriver && <div style={{ position:"absolute", bottom:-2, right:-2, width:12, height:12, borderRadius:99, background:"#FF9F0A", border:"2px solid #fff", display:"flex", alignItems:"center", justifyContent:"center" }}><span style={{ fontSize:7, color:"#fff" }}>🚗</span></div>}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:"#1D1D1F" }}>{m.name}</div>
                        {commune && <div style={{ fontSize:12, color:"#AEAEB2", marginTop:1 }}>{commune}</div>}
                      </div>
                      <div style={{ fontSize:22, fontWeight:800, color: count > 0 ? col : "#D1D1D6", minWidth:28, textAlign:"right" }}>{count}</div>
                    </div>
                  );
                })}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

if (view === "week") {
  // Build daily counts for Mon → today
  var weekDays = [];
  for (var wi = 0; wi <= dFromMon; wi++) {
    var wd = new Date(wkStart); wd.setDate(wkStart.getDate()+wi);
    var wdStr = wd.toISOString().split("T")[0];
    var wdCount = weekC.filter(function(c){ return c.date === wdStr; }).length;
    weekDays.push({ date: wdStr, label: wd.toLocaleDateString("fr-FR",{weekday:"short"}), count: wdCount });
  }
  var maxWd = Math.max.apply(null, weekDays.map(function(d){ return d.count; })) || 1;
  var bestDay = weekDays.reduce(function(best, d){ return d.count > best.count ? d : best; }, weekDays[0] || { count:0 });
  var comRankW = topComs(weekC);

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <Btn v="ghost" onClick={function(){ setView(null); }}>← Retour</Btn>
        <h2 style={{ margin:0, fontSize:20, fontWeight:800 }}>Cette semaine</h2>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginLeft:"auto" }}>
          {delta(weekC.length, lwC.length)}
          <span style={{ fontSize:12, color:"#AEAEB2" }}>vs sem. préc. ({lwC.length})</span>
        </div>
      </div>
      <div style={{ display:"flex", gap:12, marginBottom:20, flexWrap:"wrap" }}>
        <StatCard label="Contrats" value={weekC.length} color="#0071E3" />
        <StatCard label="Moy./jour" value={(weekC.length/(dFromMon+1||1)).toFixed(1)} color="#5856D6" />
        <StatCard label="Meilleur jour" value={bestDay.count + " (" + bestDay.label + ")"} color="#34C759" />
      </div>
      {/* Day bar chart */}
      <Card style={{ marginBottom:16, padding:20 }}>
        <h3 style={{ margin:"0 0 16px", fontSize:14, fontWeight:700 }}>Par jour</h3>
        <div style={{ display:"flex", alignItems:"flex-end", gap:8, height:80 }}>
          {weekDays.map(function(d) {
            var h = Math.max(d.count/maxWd*60, d.count>0?6:2);
            var isToday = d.date === todayStr;
            return (
              <div key={d.date} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                <div style={{ fontSize:12, fontWeight:800, color: d.count>0?"#1D1D1F":"#E5E5EA" }}>{d.count||""}</div>
                <div style={{ width:"100%", height:60, display:"flex", alignItems:"flex-end" }}>
                  <div style={{ width:"100%", height:h, borderRadius:"4px 4px 0 0", background: isToday?"#0071E3":"#34C759" }} />
                </div>
                <div style={{ fontSize:10, color: isToday?"#0071E3":"#AEAEB2", fontWeight: isToday?700:400, textTransform:"capitalize" }}>{d.label}</div>
              </div>
            );
          })}
        </div>
      </Card>
      {/* Top commerciaux */}
      {comRankW.length > 0 && (
        <Card style={{ marginBottom:16, padding:20 }}>
          <h3 style={{ margin:"0 0 14px", fontSize:14, fontWeight:700 }}>Classement semaine</h3>
          {comRankW.slice(0,5).map(function(entry, i) {
            var col = comColor(entry[0]);
            var pct = entry[1] / (comRankW[0][1]||1) * 100;
            return (
              <div key={entry[0]} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                <div style={{ width:22, fontSize:12, fontWeight:700, color:"#AEAEB2", textAlign:"center" }}>{i+1}</div>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <span style={{ fontSize:13, fontWeight:600 }}>{entry[0]}</span>
                    <span style={{ fontSize:13, fontWeight:800, color:col }}>{entry[1]}</span>
                  </div>
                  <div style={{ height:5, borderRadius:3, background:"#F5F5F7" }}>
                    <div style={{ width:pct+"%", height:"100%", borderRadius:3, background:col }} />
                  </div>
                </div>
              </div>
            );
          })}
        </Card>
      )}
      {weekC.length === 0
        ? <Card><div style={{ textAlign:"center", padding:40, color:"#AEAEB2" }}>Aucun contrat cette semaine</div></Card>
        : CList(weekC.slice().sort(function(a,b){ return (b.date+(b.heure||"")).localeCompare(a.date+(a.heure||"")); }))
      }
    </div>
  );
}

if (view === "month") {
  var comRankM = topComs(monthC);
  // Group by week number within month
  var weekGroups = {};
  monthC.forEach(function(c) {
    var d = new Date(c.date + "T12:00:00");
    var w = Math.ceil(d.getDate() / 7);
    var key = "Semaine " + w;
    if (!weekGroups[key]) weekGroups[key] = [];
    weekGroups[key].push(c);
  });
  var moName = now.toLocaleDateString("fr-FR", { month:"long", year:"numeric" });

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <Btn v="ghost" onClick={function(){ setView(null); }}>← Retour</Btn>
        <h2 style={{ margin:0, fontSize:20, fontWeight:800, textTransform:"capitalize" }}>{moName}</h2>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginLeft:"auto" }}>
          {delta(monthC.length, prevMonC.length)}
          <span style={{ fontSize:12, color:"#AEAEB2" }}>vs mois préc. ({prevMonC.length})</span>
        </div>
      </div>
      <div style={{ display:"flex", gap:12, marginBottom:20, flexWrap:"wrap" }}>
        <StatCard label="Contrats" value={monthC.length} color="#0071E3" />
        <StatCard label="Mois précédent" value={prevMonC.length} color="#AEAEB2" />
        <StatCard label="Actifs ce mois" value={new Set(monthC.map(function(c){return c.commercial;})).size} color="#AF52DE" />
      </div>
      {/* Commercial ranking */}
      <Card style={{ marginBottom:16, padding:20 }}>
        <h3 style={{ margin:"0 0 14px", fontSize:14, fontWeight:700 }}>Classement du mois</h3>
        {comRankM.length === 0 && <div style={{ color:"#AEAEB2", fontSize:13 }}>Aucun contrat</div>}
        {comRankM.map(function(entry, i) {
          var col = comColor(entry[0]);
          var pct = entry[1] / (comRankM[0][1]||1) * 100;
          var medal = i===0?"🥇":i===1?"🥈":i===2?"🥉":null;
          return (
            <div key={entry[0]} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
              <div style={{ width:22, fontSize:13, textAlign:"center" }}>{medal || <span style={{ fontSize:12, color:"#AEAEB2", fontWeight:700 }}>{i+1}</span>}</div>
              <div style={{ width:32, height:32, borderRadius:99, background:col+"20", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <span style={{ fontSize:11, fontWeight:800, color:col }}>{entry[0].split(" ").map(function(w){return w[0];}).slice(0,2).join("").toUpperCase()}</span>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                  <span style={{ fontSize:13, fontWeight:600 }}>{entry[0]}</span>
                  <span style={{ fontSize:14, fontWeight:800, color:col }}>{entry[1]}</span>
                </div>
                <div style={{ height:6, borderRadius:3, background:"#F5F5F7" }}>
                  <div style={{ width:pct+"%", height:"100%", borderRadius:3, background:col }} />
                </div>
              </div>
            </div>
          );
        })}
      </Card>
      {/* By week */}
      {Object.keys(weekGroups).sort().map(function(wk) {
        var wItems = weekGroups[wk].slice().sort(function(a,b){ return (b.date+(b.heure||"")).localeCompare(a.date+(a.heure||"")); });
        return (
          <div key={wk} style={{ marginBottom:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8, paddingLeft:4 }}>
              <span style={{ fontSize:13, fontWeight:700, color:"#1D1D1F" }}>{wk}</span>
              <span style={{ fontSize:12, color:"#AEAEB2" }}>{wItems.length} contrat{wItems.length>1?"s":""}</span>
            </div>
            {CList(wItems)}
          </div>
        );
      })}
      {monthC.length === 0 && <Card><div style={{ textAlign:"center", padding:40, color:"#AEAEB2" }}>Aucun contrat ce mois</div></Card>}
    </div>
  );
}

if (view === "quality") {
  function isBranche(c) { return c.status && (c.status === "Branché" || c.status === "Branché VRF"); }
  function isRdv(c) { return c.status && (c.status === "RDV pris" || c.status === "RDV pris J+7"); }
  function isAnnule(c) { return c.status === "Annulé" || c.status === "Résilié"; }

  // ── Date filtering ──────────────────────────────────────────────────────────
  var qContracts = contracts.filter(function(c) {
    if (qFrom && c.date < qFrom) return false;
    if (qTo && c.date > qTo) return false;
    return true;
  });

  var presetBtn = function(label, from, to) {
    var active = qFrom === from && qTo === to;
    return (
      <button key={label} onClick={function(){ setQFrom(from); setQTo(to); }} style={{
        padding:"5px 12px", borderRadius:20, border:"1px solid " + (active ? "#0071E3" : "#E5E5EA"),
        background: active ? "#0071E3" : "#fff", color: active ? "#fff" : "#1D1D1F",
        fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit"
      }}>{label}</button>
    );
  };

  var dateInputStyle = {
    padding:"5px 10px", borderRadius:8, border:"1px solid #E5E5EA", fontSize:12,
    fontFamily:"inherit", color:"#1D1D1F", background:"#fff", cursor:"pointer"
  };

  var DateRangeBar = (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16, flexWrap:"wrap" }}>
      {presetBtn("Tout", "", "")}
      {presetBtn("Cette semaine", wkStartStr, todayStr)}
      {presetBtn("Ce mois", moStartStr, todayStr)}
      <div style={{ display:"flex", alignItems:"center", gap:6, marginLeft:"auto" }}>
        <input type="date" value={qFrom} onChange={function(e){ setQFrom(e.target.value); }} style={dateInputStyle} />
        <span style={{ fontSize:12, color:"#AEAEB2" }}>→</span>
        <input type="date" value={qTo} onChange={function(e){ setQTo(e.target.value); }} style={dateInputStyle} />
      </div>
    </div>
  );

  // ── Metrics ─────────────────────────────────────────────────────────────────
  var totalQ = qContracts.length || 1;
  var branchesQ = qContracts.filter(isBranche).length;
  var rdvQ = qContracts.filter(isRdv).length;
  var attenteQ = qContracts.filter(function(c){ return c.status === "En attente RDV"; }).length;
  var annulesQ = qContracts.filter(isAnnule).length;
  var tauxGlobalQ = ((branchesQ + rdvQ) / totalQ * 100).toFixed(1);
  var tauxBrancheQ = (branchesQ / totalQ * 100).toFixed(1);
  var tauxRdvQ = (rdvQ / totalQ * 100).toFixed(1);
  var tauxAttenteQ = (attenteQ / totalQ * 100).toFixed(1);
  var tauxAnnuleQ = (annulesQ / totalQ * 100).toFixed(1);

  var comNamesQ = Array.from(new Set(qContracts.map(function(c){ return c.commercial; }))).sort();
  var comStatsQ = comNamesQ.map(function(name) {
    var cc = qContracts.filter(function(c){ return c.commercial === name; });
    var tot = cc.length || 1;
    var br = cc.filter(isBranche).length;
    var rd = cc.filter(isRdv).length;
    var at = cc.filter(function(c){ return c.status === "En attente RDV"; }).length;
    var an = cc.filter(isAnnule).length;
    return { name: name, total: cc.length, br: br, rd: rd, at: at, an: an,
      tGlobal: (br + rd) / tot * 100, tBr: br / tot * 100, tRd: rd / tot * 100, tAt: at / tot * 100, tAn: an / tot * 100,
      contracts: cc };
  }).sort(function(a,b){ return b.total - a.total; });

  // ── Detail: one commercial ──────────────────────────────────────────────────
  if (qCom) {
    var cs = comStatsQ.find(function(s){ return s.name === qCom; });
    if (!cs) { setQCom(null); return null; }
    var qualColor = cs.tGlobal >= 60 ? "#34C759" : cs.tGlobal >= 35 ? "#FF9F0A" : "#FF3B30";
    return (
      <div>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
          <Btn v="ghost" onClick={function(){ setQCom(null); }}>← Retour</Btn>
          <div style={{ width:36, height:36, borderRadius:99, background:comColor(cs.name)+"20", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <span style={{ fontSize:12, fontWeight:800, color:comColor(cs.name) }}>{cs.name.split(" ").map(function(w){ return w[0]; }).slice(0,2).join("").toUpperCase()}</span>
          </div>
          <h2 style={{ margin:0, fontSize:20, fontWeight:800 }}>{cs.name}</h2>
          <div style={{ marginLeft:"auto", fontSize:28, fontWeight:800, color:qualColor }}>{cs.tGlobal.toFixed(0)}%</div>
        </div>
        {DateRangeBar}
        <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
          {[
            { label:"Total", val:cs.total, col:"#1D1D1F" },
            { label:"Branchés", val:cs.br, col:"#34C759" },
            { label:"RDV Pris", val:cs.rd, col:"#1A7A3F" },
            { label:"En attente", val:cs.at, col:"#FF9F0A" },
            { label:"Annulés", val:cs.an, col:"#FF3B30" },
          ].map(function(item) {
            return (
              <Card key={item.label} style={{ flex:1, minWidth:80, padding:14, textAlign:"center" }}>
                <div style={{ fontSize:10, fontWeight:600, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>{item.label}</div>
                <div style={{ fontSize:28, fontWeight:800, color:item.col }}>{item.val}</div>
              </Card>
            );
          })}
        </div>
        <Card style={{ marginBottom:16, padding:20 }}>
          {[
            { label:"Taux branchement", sub:"qualité long terme", val:cs.tBr, col:"#34C759" },
            { label:"Taux RDV", sub:"qualité hebdomadaire", val:cs.tRd, col:"#1A7A3F" },
            { label:"En attente RDV", sub:"pipeline en cours", val:cs.tAt, col:"#FF9F0A" },
            { label:"Taux annulation", sub:"rétractations", val:cs.tAn, col:"#FF3B30" },
          ].map(function(item) {
            return (
              <div key={item.label} style={{ marginBottom:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6 }}>
                  <div>
                    <span style={{ fontSize:13, fontWeight:700 }}>{item.label}</span>
                    <span style={{ fontSize:11, color:"#AEAEB2", marginLeft:6 }}>{item.sub}</span>
                  </div>
                  <span style={{ fontSize:16, fontWeight:800, color:item.col }}>{item.val.toFixed(1)}%</span>
                </div>
                <div style={{ height:8, borderRadius:4, background:"#F5F5F7" }}>
                  <div style={{ width:Math.min(item.val,100)+"%", height:"100%", borderRadius:4, background:item.col }} />
                </div>
              </div>
            );
          })}
        </Card>
        {CList(cs.contracts.slice().sort(function(a,b){ return (b.date+(b.heure||"")).localeCompare(a.date+(a.heure||"")); }))}
      </div>
    );
  }

  // ── Overview ────────────────────────────────────────────────────────────────
  var globalQualCol = parseFloat(tauxGlobalQ) >= 60 ? "#34C759" : parseFloat(tauxGlobalQ) >= 35 ? "#FF9F0A" : "#FF3B30";
  var annuleCol = parseFloat(tauxAnnuleQ) > 15 ? "#FF3B30" : parseFloat(tauxAnnuleQ) > 8 ? "#FF9F0A" : "#34C759";
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <Btn v="ghost" onClick={function(){ setView(null); }}>← Retour</Btn>
        <h2 style={{ margin:0, fontSize:20, fontWeight:800 }}>Qualité</h2>
        <span style={{ fontSize:12, color:"#AEAEB2", marginLeft:4 }}>{qContracts.length} contrat{qContracts.length > 1 ? "s" : ""}</span>
      </div>
      {DateRangeBar}

      {/* Global metrics */}
      <div style={{ display:"flex", gap:12, marginBottom:24, flexWrap:"wrap" }}>
        <Card style={{ flex:2, minWidth:220, padding:20 }}>
          <div style={{ fontSize:11, fontWeight:600, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.5, marginBottom:8 }}>Qualité globale agence</div>
          <div style={{ fontSize:48, fontWeight:800, letterSpacing:-2, color:globalQualCol, lineHeight:1, marginBottom:14 }}>{tauxGlobalQ}%</div>
          <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
            <div>
              <div style={{ fontSize:10, color:"#AEAEB2", fontWeight:600, textTransform:"uppercase", letterSpacing:0.3, marginBottom:2 }}>Branchement</div>
              <div style={{ fontSize:18, fontWeight:800, color:"#34C759" }}>{tauxBrancheQ}%</div>
              <div style={{ fontSize:11, color:"#AEAEB2" }}>{branchesQ} contrats</div>
            </div>
            <div style={{ width:1, background:"#F0F0F0" }} />
            <div>
              <div style={{ fontSize:10, color:"#AEAEB2", fontWeight:600, textTransform:"uppercase", letterSpacing:0.3, marginBottom:2 }}>RDV pris</div>
              <div style={{ fontSize:18, fontWeight:800, color:"#1A7A3F" }}>{tauxRdvQ}%</div>
              <div style={{ fontSize:11, color:"#AEAEB2" }}>{rdvQ} contrats</div>
            </div>
            <div style={{ width:1, background:"#F0F0F0" }} />
            <div>
              <div style={{ fontSize:10, color:"#AEAEB2", fontWeight:600, textTransform:"uppercase", letterSpacing:0.3, marginBottom:2 }}>En attente</div>
              <div style={{ fontSize:18, fontWeight:800, color:"#FF9F0A" }}>{tauxAttenteQ}%</div>
              <div style={{ fontSize:11, color:"#AEAEB2" }}>{attenteQ} contrats</div>
            </div>
          </div>
        </Card>
        <Card style={{ flex:1, minWidth:120, padding:20, textAlign:"center", display:"flex", flexDirection:"column", justifyContent:"center" }}>
          <div style={{ fontSize:11, fontWeight:600, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.5, marginBottom:8 }}>Taux annulation</div>
          <div style={{ fontSize:42, fontWeight:800, letterSpacing:-2, color:annuleCol, lineHeight:1 }}>{tauxAnnuleQ}%</div>
          <div style={{ fontSize:12, color:"#AEAEB2", marginTop:8 }}>{annulesQ} contrat{annulesQ > 1 ? "s" : ""}</div>
        </Card>
        {pendingVTA.length > 0 && (
          <Card style={{ flex:1, minWidth:110, padding:16, textAlign:"center", cursor:"pointer", border:"2px solid #FF9F0A30" }} onClick={resolveAllVTA}>
            <div style={{ fontSize:11, fontWeight:600, color:"#FF9F0A", textTransform:"uppercase", letterSpacing:0.5, marginBottom:6 }}>VTA à résoudre</div>
            <div style={{ fontSize:32, fontWeight:800, letterSpacing:-1, color:"#FF9F0A" }}>{pendingVTA.length}</div>
            <div style={{ fontSize:11, color:"#FF9F0A", marginTop:4 }}>Appuyer pour résoudre</div>
          </Card>
        )}
      </div>

      {/* Per-commercial quality */}
      <div style={{ fontSize:13, fontWeight:700, color:"#1D1D1F", marginBottom:12 }}>Qualité par commercial</div>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {comStatsQ.map(function(cs) {
          var col = comColor(cs.name);
          var initials = cs.name.split(" ").map(function(w){ return w[0]; }).slice(0,2).join("").toUpperCase();
          var qCol = cs.tGlobal >= 60 ? "#34C759" : cs.tGlobal >= 35 ? "#FF9F0A" : "#FF3B30";
          return (
            <Card key={cs.name} onClick={function(){ setQCom(cs.name); }} style={{ padding:"14px 16px", cursor:"pointer" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
                <div style={{ width:36, height:36, borderRadius:99, background:col+"20", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <span style={{ fontSize:11, fontWeight:800, color:col }}>{initials}</span>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:"#1D1D1F" }}>{cs.name}</div>
                  <div style={{ fontSize:11, color:"#AEAEB2" }}>{cs.total} contrat{cs.total > 1 ? "s" : ""}</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:22, fontWeight:800, color:qCol, lineHeight:1 }}>{cs.tGlobal.toFixed(0)}%</div>
                  <div style={{ fontSize:10, color:"#AEAEB2", fontWeight:600, marginTop:2 }}>qualité</div>
                </div>
              </div>
              <div style={{ display:"flex", gap:10 }}>
                {[
                  { label:"Branché", val:cs.tBr, count:cs.br, col:"#34C759" },
                  { label:"RDV", val:cs.tRd, count:cs.rd, col:"#1A7A3F" },
                  { label:"Attente", val:cs.tAt, count:cs.at, col:"#FF9F0A" },
                  { label:"Annulé", val:cs.tAn, count:cs.an, col:"#FF3B30" },
                ].map(function(item) {
                  return (
                    <div key={item.label} style={{ flex:1 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                        <span style={{ fontSize:10, color:"#AEAEB2", fontWeight:600 }}>{item.label}</span>
                        <span style={{ fontSize:10, fontWeight:700, color:item.col }}>{item.count} · {item.val.toFixed(0)}%</span>
                      </div>
                      <div style={{ height:4, borderRadius:2, background:"#F5F5F7" }}>
                        <div style={{ width:Math.min(item.val,100)+"%", height:"100%", borderRadius:2, background:item.col }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── RECAP COMMERCIAL ─────────────────────────────────────────────────────────
if (view === "commercial") {
  function isBrC(c) { return c.status && (c.status === "Branché" || c.status === "Branché VRF"); }
  function isRdC(c) { return c.status && (c.status === "RDV pris" || c.status === "RDV pris J+7"); }
  function isAnC(c) { return c.status === "Annulé" || c.status === "Résilié"; }

  var comNamesRC = Array.from(new Set(contracts.map(function(c){ return c.commercial; }))).sort();
  var comStatsRC = comNamesRC.map(function(name) {
    var cc = contracts.filter(function(c){ return c.commercial === name; });
    var weekCC = cc.filter(function(c){ return c.date >= wkStartStr && c.date <= todayStr; });
    var monthCC = cc.filter(function(c){ return c.date >= moStartStr && c.date <= todayStr; });
    var tot = cc.length || 1;
    var br = cc.filter(isBrC).length;
    var rd = cc.filter(isRdC).length;
    var at = cc.filter(function(c){ return c.status === "En attente RDV"; }).length;
    var an = cc.filter(isAnC).length;
    var activeDates = Array.from(new Set(cc.map(function(c){ return c.date; }))).sort(function(a,b){ return b.localeCompare(a); });
    var villeCount = {};
    cc.forEach(function(c){ if (c.ville) villeCount[c.ville] = (villeCount[c.ville]||0)+1; });
    var topVilles = Object.entries(villeCount).sort(function(a,b){ return b[1]-a[1]; }).slice(0,3);
    var boxCount = {};
    cc.forEach(function(c){ if (c.box) boxCount[c.box] = (boxCount[c.box]||0)+1; });
    var last6 = MONTHS_ORDER.slice(-6);
    var monthlyData = last6.map(function(mk) {
      var mIdx = _ML_KEYS.indexOf(mk.slice(0,-2));
      var yr = parseInt("20" + mk.slice(-2));
      var cnt = cc.filter(function(c) {
        if (!c.date) return false;
        var d = new Date(c.date + "T12:00:00");
        return d.getFullYear() === yr && d.getMonth() === mIdx;
      }).length;
      return { mk: mk, label: _ML_FULL[mIdx], count: cnt };
    });
    return {
      name: name, total: cc.length, weekTotal: weekCC.length, monthTotal: monthCC.length,
      activeDays: activeDates.length, lastDate: activeDates[0] || null,
      br: br, rd: rd, at: at, an: an,
      tBr: br/tot*100, tRd: rd/tot*100, tAt: at/tot*100, tAn: an/tot*100,
      tGlobal: (br+rd)/tot*100, topVilles: topVilles, boxCount: boxCount, monthlyData: monthlyData,
    };
  }).sort(function(a,b){ return b.total - a.total; });

  // ── DETAIL ──
  if (selectedCom) {
    var csdBase = comStatsRC.find(function(s){ return s.name === selectedCom; });
    if (!csdBase) { setSelectedCom(null); return null; }

    // Filtered contracts for this commercial + date range
    var ccF = contracts.filter(function(c) {
      if (c.commercial !== selectedCom) return false;
      if (comFrom && c.date < comFrom) return false;
      if (comTo && c.date > comTo) return false;
      return true;
    });
    var weekCCF = ccF.filter(function(c){ return c.date >= wkStartStr && c.date <= todayStr; });
    var monthCCF = ccF.filter(function(c){ return c.date >= moStartStr && c.date <= todayStr; });
    var totF = ccF.length || 1;
    var brF = ccF.filter(isBrC).length;
    var rdF = ccF.filter(isRdC).length;
    var atF = ccF.filter(function(c){ return c.status === "En attente RDV"; }).length;
    var anF = ccF.filter(isAnC).length;
    var activeDatesF = Array.from(new Set(ccF.map(function(c){ return c.date; }))).sort(function(a,b){ return b.localeCompare(a); });
    var villeCountF = {};
    ccF.forEach(function(c){ if (c.ville) villeCountF[c.ville] = (villeCountF[c.ville]||0)+1; });
    var topVillesF = Object.entries(villeCountF).sort(function(a,b){ return b[1]-a[1]; }).slice(0,3);
    var boxCountF = {};
    ccF.forEach(function(c){ if (c.box) boxCountF[c.box] = (boxCountF[c.box]||0)+1; });
    var csd = {
      name: selectedCom, total: ccF.length, weekTotal: weekCCF.length, monthTotal: monthCCF.length,
      activeDays: activeDatesF.length, lastDate: activeDatesF[0] || null,
      br: brF, rd: rdF, at: atF, an: anF,
      tBr: brF/totF*100, tRd: rdF/totF*100, tAt: atF/totF*100, tAn: anF/totF*100,
      tGlobal: (brF+rdF)/totF*100, topVilles: topVillesF, boxCount: boxCountF,
      monthlyData: csdBase.monthlyData, // trend always unfiltered
    };

    var colD = comColor(csd.name);
    var initialsD = csd.name.split(" ").map(function(w){ return w[0]; }).slice(0,2).join("").toUpperCase();
    var qualColD = csd.tGlobal >= 60 ? "#34C759" : csd.tGlobal >= 35 ? "#FF9F0A" : "#FF3B30";
    var maxMo = Math.max.apply(null, csd.monthlyData.map(function(m){ return m.count; })) || 1;
    var tmMember = team.find(function(m){ return m.name === selectedCom; });
    var lastDateLabel = csd.lastDate ? (function() {
      var diff = Math.round((new Date() - new Date(csd.lastDate + "T12:00:00")) / 86400000);
      if (diff === 0) return "Aujourd'hui";
      if (diff === 1) return "Hier";
      if (diff < 7) return "Il y a " + diff + "j";
      if (diff < 14) return "Sem. dernière";
      return "Il y a " + Math.round(diff/7) + " sem.";
    })() : "—";

    var dateInputStyleD = { padding:"5px 10px", borderRadius:8, border:"1px solid #E5E5EA", fontSize:12, fontFamily:"inherit", color:"#1D1D1F", background:"#fff" };
    function presetBtnD(label, from, to) {
      var active = comFrom === from && comTo === to;
      return <button key={label} onClick={function(){ setComFrom(from); setComTo(to); }} style={{ padding:"5px 12px", borderRadius:20, border:"1px solid "+(active?"#0071E3":"#E5E5EA"), background:active?"#0071E3":"#fff", color:active?"#fff":"#1D1D1F", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>{label}</button>;
    }

    return (
      <div>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
          <Btn v="ghost" onClick={function(){ setSelectedCom(null); setComFrom(""); setComTo(""); }}>← Retour</Btn>
          <div style={{ width:42, height:42, borderRadius:99, background:colD+"20", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <span style={{ fontSize:13, fontWeight:800, color:colD }}>{initialsD}</span>
          </div>
          <div>
            <h2 style={{ margin:0, fontSize:20, fontWeight:800 }}>{csd.name}</h2>
            {tmMember && <div style={{ fontSize:12, color:"#AEAEB2" }}>{tmMember.role}</div>}
          </div>
          <div style={{ marginLeft:"auto", textAlign:"right" }}>
            <div style={{ fontSize:28, fontWeight:800, color:qualColD, lineHeight:1 }}>{csd.tGlobal.toFixed(0)}%</div>
            <div style={{ fontSize:10, color:"#AEAEB2", fontWeight:600 }}>qualité</div>
          </div>
        </div>

        {/* Date range bar */}
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20, flexWrap:"wrap" }}>
          {presetBtnD("Tout", "", "")}
          {presetBtnD("Cette semaine", wkStartStr, todayStr)}
          {presetBtnD("Ce mois", moStartStr, todayStr)}
          <div style={{ display:"flex", alignItems:"center", gap:6, marginLeft:"auto" }}>
            <input type="date" value={comFrom} onChange={function(e){ setComFrom(e.target.value); }} style={dateInputStyleD} />
            <span style={{ fontSize:12, color:"#AEAEB2" }}>→</span>
            <input type="date" value={comTo} onChange={function(e){ setComTo(e.target.value); }} style={dateInputStyleD} />
          </div>
        </div>

        {/* Volume */}
        <div style={{ fontSize:10, fontWeight:700, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.8, marginBottom:10 }}>Volume</div>
        <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" }}>
          {[
            { label:"Total", val:csd.total, col:"#0071E3" },
            { label:"Cette sem.", val:csd.weekTotal, col:"#34C759" },
            { label:"Ce mois", val:csd.monthTotal, col:"#AF52DE" },
            { label:"Jours actifs", val:csd.activeDays, col:"#FF9F0A" },
          ].map(function(item) {
            return (
              <Card key={item.label} style={{ flex:1, minWidth:70, padding:"12px 10px", textAlign:"center" }}>
                <div style={{ fontSize:9, fontWeight:600, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.4, marginBottom:4 }}>{item.label}</div>
                <div style={{ fontSize:26, fontWeight:800, color:item.col, lineHeight:1 }}>{item.val}</div>
              </Card>
            );
          })}
          <Card style={{ flex:1, minWidth:70, padding:"12px 10px", textAlign:"center" }}>
            <div style={{ fontSize:9, fontWeight:600, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.4, marginBottom:4 }}>Dernier</div>
            <div style={{ fontSize:13, fontWeight:800, color:"#1D1D1F", lineHeight:1.3 }}>{lastDateLabel}</div>
          </Card>
        </div>

        {/* Qualité */}
        <div style={{ fontSize:10, fontWeight:700, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.8, marginBottom:10 }}>Qualité</div>
        <Card style={{ marginBottom:20, padding:20 }}>
          {[
            { label:"Taux branchement", sub:"long terme", val:csd.tBr, count:csd.br, col:"#34C759" },
            { label:"Taux RDV", sub:"hebdomadaire", val:csd.tRd, count:csd.rd, col:"#1A7A3F" },
            { label:"En attente RDV", sub:"pipeline", val:csd.tAt, count:csd.at, col:"#FF9F0A" },
            { label:"Taux annulation", sub:"rétractations", val:csd.tAn, count:csd.an, col:"#FF3B30" },
          ].map(function(item) {
            return (
              <div key={item.label} style={{ marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:5 }}>
                  <div>
                    <span style={{ fontSize:13, fontWeight:600 }}>{item.label}</span>
                    <span style={{ fontSize:10, color:"#AEAEB2", marginLeft:5 }}>{item.sub}</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:10, color:"#AEAEB2" }}>{item.count}</span>
                    <span style={{ fontSize:16, fontWeight:800, color:item.col }}>{item.val.toFixed(1)}%</span>
                  </div>
                </div>
                <div style={{ height:7, borderRadius:4, background:"#F5F5F7" }}>
                  <div style={{ width:Math.min(item.val,100)+"%", height:"100%", borderRadius:4, background:item.col }} />
                </div>
              </div>
            );
          })}
        </Card>

        {/* Tendance 6 mois */}
        <div style={{ fontSize:10, fontWeight:700, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.8, marginBottom:10 }}>Tendance 6 mois</div>
        <Card style={{ marginBottom:20, padding:20 }}>
          <div style={{ display:"flex", alignItems:"flex-end", gap:6, height:110 }}>
            {csd.monthlyData.map(function(m, i) {
              var isCurr = i === csd.monthlyData.length - 1;
              var barH = maxMo > 0 ? Math.max(4, Math.round(m.count / maxMo * 90)) : 4;
              return (
                <div key={m.mk} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                  <div style={{ fontSize:11, fontWeight:700, color: isCurr ? colD : "#6E6E73" }}>{m.count > 0 ? m.count : ""}</div>
                  <div style={{ width:"100%", height:barH, borderRadius:4, background: isCurr ? colD : colD+"35" }} />
                  <div style={{ fontSize:9, color: isCurr ? colD : "#AEAEB2", fontWeight: isCurr ? 700 : 400, textAlign:"center" }}>{m.label}</div>
                </div>
              );
            })}
          </div>
          {csd.monthlyData.length >= 2 && (function() {
            var curr = csd.monthlyData[csd.monthlyData.length-1].count;
            var prev = csd.monthlyData[csd.monthlyData.length-2].count;
            var diff = curr - prev;
            return (
              <div style={{ marginTop:12, paddingTop:12, borderTop:"1px solid #F5F5F7", display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:12, color:"#AEAEB2" }}>vs mois précédent :</span>
                <span style={{ fontSize:14, fontWeight:800, color: diff > 0 ? "#34C759" : diff < 0 ? "#FF3B30" : "#AEAEB2" }}>{diff > 0 ? "+" : ""}{diff}</span>
                {prev > 0 && <span style={{ fontSize:11, color:"#AEAEB2" }}>({((diff/prev)*100).toFixed(0)}%)</span>}
              </div>
            );
          })()}
        </Card>

        {/* Top communes */}
        {csd.topVilles.length > 0 && <div>
          <div style={{ fontSize:10, fontWeight:700, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.8, marginBottom:10 }}>Top communes</div>
          <Card style={{ marginBottom:20, padding:0, overflow:"hidden" }}>
            {csd.topVilles.map(function(entry, i) {
              var pct = entry[1] / csd.total * 100;
              return (
                <div key={entry[0]} style={{ padding:"12px 16px", borderTop: i > 0 ? "1px solid #F5F5F7" : "none", display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"#AEAEB2", minWidth:16 }}>{i+1}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ fontSize:13, fontWeight:600 }}>{entry[0]}</span>
                      <span style={{ fontSize:13, fontWeight:800, color:colD }}>{entry[1]}</span>
                    </div>
                    <div style={{ height:5, borderRadius:2.5, background:"#F5F5F7" }}>
                      <div style={{ width:pct+"%", height:"100%", borderRadius:2.5, background:colD+"50" }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </Card>
        </div>}

        {/* Produits */}
        {Object.keys(csd.boxCount).length > 0 && <div>
          <div style={{ fontSize:10, fontWeight:700, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.8, marginBottom:10 }}>Produits</div>
          <div style={{ display:"flex", gap:10, marginBottom:20 }}>
            {[
              { key:"ULTRA", label:"Ultra", col:"#0071E3" },
              { key:"ULTRA_LIGHT", label:"Ultra Light", col:"#5AC8FA" },
              { key:"POP", label:"Pop", col:"#FF9F0A" },
            ].filter(function(item){ return csd.boxCount[item.key] > 0; }).map(function(item) {
              var pct = (csd.boxCount[item.key] / csd.total * 100).toFixed(0);
              return (
                <Card key={item.key} style={{ flex:1, padding:"14px 12px", textAlign:"center" }}>
                  <div style={{ fontSize:9, fontWeight:600, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.4, marginBottom:4 }}>{item.label}</div>
                  <div style={{ fontSize:26, fontWeight:800, color:item.col, lineHeight:1, marginBottom:2 }}>{csd.boxCount[item.key]}</div>
                  <div style={{ fontSize:11, color:"#AEAEB2" }}>{pct}%</div>
                </Card>
              );
            })}
          </div>
        </div>}
      </div>
    );
  }

  // ── GRILLE ──
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <Btn v="ghost" onClick={function(){ setView(null); }}>← Retour</Btn>
        <h2 style={{ margin:0, fontSize:20, fontWeight:800 }}>Récap Commercial</h2>
        <span style={{ fontSize:12, color:"#AEAEB2", marginLeft:4 }}>{comStatsRC.length} commerciaux</span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(155px, 1fr))", gap:12 }}>
        {comStatsRC.map(function(cs) {
          var col = comColor(cs.name);
          var initials = cs.name.split(" ").map(function(w){ return w[0]; }).slice(0,2).join("").toUpperCase();
          var qualCol = cs.tGlobal >= 60 ? "#34C759" : cs.tGlobal >= 35 ? "#FF9F0A" : "#FF3B30";
          var firstName = cs.name.split(" ")[0];
          var lastName = cs.name.split(" ").slice(1).join(" ");
          return (
            <Card key={cs.name} onClick={function(){ setSelectedCom(cs.name); setComFrom(""); setComTo(""); }} style={{ padding:16, cursor:"pointer", textAlign:"center" }}>
              <div style={{ width:46, height:46, borderRadius:99, background:col+"20", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 10px" }}>
                <span style={{ fontSize:14, fontWeight:800, color:col }}>{initials}</span>
              </div>
              <div style={{ fontSize:13, fontWeight:700, color:"#1D1D1F" }}>{firstName}</div>
              <div style={{ fontSize:11, color:"#6E6E73", marginBottom:10 }}>{lastName}</div>
              <div style={{ fontSize:26, fontWeight:800, color:col, lineHeight:1, marginBottom:2 }}>{cs.total}</div>
              <div style={{ fontSize:10, color:"#AEAEB2", marginBottom:10 }}>contrats</div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:3 }}>
                <span style={{ color:"#AEAEB2" }}>Ce mois</span>
                <span style={{ fontWeight:700, color:col }}>{cs.monthTotal}</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11 }}>
                <span style={{ color:"#AEAEB2" }}>Qualité</span>
                <span style={{ fontWeight:700, color:qualCol }}>{cs.tGlobal.toFixed(0)}%</span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── OVERVIEW ─────────────────────────────────────────────────────────────────
var dates = Array.from(new Set(contracts.map(function(c) { return c.date; }))).sort(function(a, b) { return b.localeCompare(a); });
var total = contracts.length;
var statuses = Array.from(new Set(contracts.map(function(c) { return c.status; }).filter(Boolean))).sort();
var hasFilter = fD || fC || fO || fS;

var filtered = contracts.filter(function(c) {
  if (fD && c.date !== fD) return false;
  if (fC && c.commercial !== fC) return false;
  if (fO && c.operator !== fO) return false;
  if (fS && c.status !== fS) return false;
  return true;
}).sort(function(a, b) { return (b.date + (b.heure||"")).localeCompare(a.date + (a.heure||"")); });

var grouped = [];
if (!fD) {
  var dateGroups = {};
  filtered.forEach(function(c) {
    if (!dateGroups[c.date]) dateGroups[c.date] = [];
    dateGroups[c.date].push(c);
  });
  Object.keys(dateGroups).sort(function(a,b){return b.localeCompare(a);}).forEach(function(d) {
    grouped.push({ date: d, items: dateGroups[d] });
  });
} else {
  grouped = [{ date: fD, items: filtered }];
}

var todayDelta = todayC.length - yestC.length;
var weekDelta  = weekC.length - lwC.length;
var monthDelta = monthC.length - prevMonC.length;
var tauxBrancheOv = total > 0 ? (contracts.filter(function(c){ return c.status && c.status.indexOf("Branché")===0; }).length / total * 100).toFixed(0) : "0";
var annulesOv = contracts.filter(function(c){ return c.status === "Annulé" || c.status === "Résilié"; }).length;

return (
<div>
  {/* 4 summary cards */}
  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))", gap:14, marginBottom:20 }}>
    {/* Aujourd'hui */}
    <Card onClick={function(){ setView("today"); }} style={{ cursor:"pointer", padding:20, border:"2px solid transparent" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:600, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>Aujourd'hui</div>
          <div style={{ fontSize:36, fontWeight:800, letterSpacing:-1.5, color:"#0071E3", lineHeight:1 }}>{todayC.length}</div>
        </div>
        <div style={{ fontSize:22 }}>📅</div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <span style={{ fontSize:12, fontWeight:700, color: todayDelta>0?"#34C759":todayDelta<0?"#FF3B30":"#AEAEB2" }}>
          {todayDelta>0?"+":""}{todayDelta !== 0 ? todayDelta : "="} vs hier
        </span>
      </div>
      <div style={{ marginTop:10, display:"flex", gap:4, flexWrap:"wrap" }}>
        {topComs(todayC).slice(0,3).map(function(e){
          var col = comColor(e[0]);
          return <span key={e[0]} style={{ fontSize:11, fontWeight:700, color:col, background:col+"15", borderRadius:20, padding:"2px 8px" }}>{e[0].split(" ")[0]} {e[1]}</span>;
        })}
      </div>
    </Card>

    {/* Semaine */}
    <Card onClick={function(){ setView("week"); }} style={{ cursor:"pointer", padding:20, border:"2px solid transparent" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:600, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>Cette semaine</div>
          <div style={{ fontSize:36, fontWeight:800, letterSpacing:-1.5, color:"#34C759", lineHeight:1 }}>{weekC.length}</div>
        </div>
        <div style={{ fontSize:22 }}>📊</div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <span style={{ fontSize:12, fontWeight:700, color: weekDelta>0?"#34C759":weekDelta<0?"#FF3B30":"#AEAEB2" }}>
          {weekDelta>0?"+":""}{weekDelta !== 0 ? weekDelta : "="} vs sem. préc.
        </span>
      </div>
      <div style={{ marginTop:10 }}>
        <div style={{ fontSize:12, color:"#6E6E73" }}>Moy. {(weekC.length/(dFromMon+1||1)).toFixed(1)}/jour · {(dFromMon+1)} jour{dFromMon>0?"s":""}</div>
      </div>
    </Card>

    {/* Mois */}
    <Card onClick={function(){ setView("month"); }} style={{ cursor:"pointer", padding:20, border:"2px solid transparent" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:600, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>Ce mois</div>
          <div style={{ fontSize:36, fontWeight:800, letterSpacing:-1.5, color:"#AF52DE", lineHeight:1 }}>{monthC.length}</div>
        </div>
        <div style={{ fontSize:22 }}>📆</div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <span style={{ fontSize:12, fontWeight:700, color: monthDelta>0?"#34C759":monthDelta<0?"#FF3B30":"#AEAEB2" }}>
          {monthDelta>0?"+":""}{monthDelta !== 0 ? monthDelta : "="} vs mois préc.
        </span>
      </div>
      <div style={{ marginTop:10, display:"flex", gap:4, flexWrap:"wrap" }}>
        {topComs(monthC).slice(0,3).map(function(e){
          var col = comColor(e[0]);
          return <span key={e[0]} style={{ fontSize:11, fontWeight:700, color:col, background:col+"15", borderRadius:20, padding:"2px 8px" }}>{e[0].split(" ")[0]} {e[1]}</span>;
        })}
      </div>
    </Card>

    {/* Qualité */}
    <Card onClick={function(){ setView("quality"); }} style={{ cursor:"pointer", padding:20, border:"2px solid " + (pendingVTA.length > 0 ? "#FF9F0A30" : "transparent") }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:600, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>Qualité</div>
          <div style={{ fontSize:36, fontWeight:800, letterSpacing:-1.5, color:"#34C759", lineHeight:1 }}>{tauxBrancheOv}%</div>
        </div>
        <div style={{ fontSize:22 }}>✅</div>
      </div>
      <div style={{ fontSize:12, color:"#6E6E73", marginBottom:6 }}>Taux de branchement</div>
      <div style={{ display:"flex", gap:6 }}>
        {annulesOv > 0 && <span style={{ fontSize:11, fontWeight:700, color:"#FF3B30", background:"#FF3B3015", borderRadius:20, padding:"2px 8px" }}>{annulesOv} annulés</span>}
        {pendingVTA.length > 0 && <span style={{ fontSize:11, fontWeight:700, color:"#FF9F0A", background:"#FF9F0A15", borderRadius:20, padding:"2px 8px" }}>{pendingVTA.length} VTA?</span>}
      </div>
    </Card>

    {/* Récap Commercial */}
    <Card onClick={function(){ setView("commercial"); }} style={{ cursor:"pointer", padding:20, border:"2px solid transparent" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:600, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>Commerciaux</div>
          <div style={{ fontSize:36, fontWeight:800, letterSpacing:-1.5, color:"#FF9F0A", lineHeight:1 }}>{Array.from(new Set(contracts.map(function(c){ return c.commercial; }))).length}</div>
        </div>
        <div style={{ fontSize:22 }}>👤</div>
      </div>
      <div style={{ fontSize:12, color:"#6E6E73", marginBottom:6 }}>Récap par commercial</div>
      <div style={{ marginTop:4, display:"flex", gap:4, flexWrap:"wrap" }}>
        {topComs(monthC).slice(0,2).map(function(e){
          var col = comColor(e[0]);
          return <span key={e[0]} style={{ fontSize:11, fontWeight:700, color:col, background:col+"15", borderRadius:20, padding:"2px 8px" }}>{e[0].split(" ")[0]} {e[1]}</span>;
        })}
      </div>
    </Card>
  </div>

  {/* Date carousel */}
  <div style={{ display:"flex", gap:8, marginBottom:16, overflowX:"auto", paddingBottom:4 }}>
    <Card onClick={function(){ setFD(""); }} style={{ minWidth:68, padding:"10px 12px", textAlign:"center", cursor:"pointer", flexShrink:0, border: !fD?"2px solid #0071E3":"2px solid transparent", background: !fD?"#0071E308":"#fff" }}>
      <div style={{ fontSize:10, color: !fD?"#0071E3":"#AEAEB2", fontWeight:600, textTransform:"uppercase", letterSpacing:0.3 }}>Tous</div>
      <div style={{ fontSize:17, fontWeight:800, color: !fD?"#0071E3":"#1D1D1F", marginTop:2 }}>{total}</div>
    </Card>
    {dates.slice(0,10).map(function(d) {
      var dc = contracts.filter(function(c){ return c.date===d; }).length;
      var isTod = d === todayStr;
      var sel = fD===d;
      return (
        <Card key={d} onClick={function(){ setFD(d); }} style={{ minWidth:68, padding:"10px 12px", textAlign:"center", cursor:"pointer", flexShrink:0, border: sel?"2px solid #0071E3":"2px solid transparent", background: sel?"#0071E308":"#fff" }}>
          <div style={{ fontSize:10, color: sel?"#0071E3":"#AEAEB2", fontWeight:600, textTransform:"uppercase", letterSpacing:0.3 }}>
            {isTod?"Auj.":new Date(d+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"short"})}
          </div>
          <div style={{ fontSize:17, fontWeight:800, color: sel?"#0071E3":"#1D1D1F", marginTop:2 }}>{dc}</div>
          <div style={{ fontSize:10, color:"#AEAEB2", marginTop:1 }}>{new Date(d+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}</div>
        </Card>
      );
    })}
  </div>

  {/* Filters */}
  <Card style={{ marginBottom:16, padding:"12px 16px" }}>
    <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
      <Sel value={fC} onChange={setFC} placeholder="Tous les commerciaux" options={allComs.map(function(n){ return { value:n, label:n }; })} style={{ minWidth:180 }} />
      <Sel value={fO} onChange={setFO} placeholder="Opérateur" options={OPERATORS.map(function(o){ return { value:o, label:o }; })} style={{ minWidth:110 }} />
      <Sel value={fS} onChange={setFS} placeholder="Statut" options={statuses.map(function(s){ return { value:s, label:s }; })} style={{ minWidth:160 }} />
      {hasFilter && <Btn s="sm" v="ghost" onClick={function(){ setFD(""); setFC(""); setFO(""); setFS(""); }}>Réinitialiser</Btn>}
      <span style={{ marginLeft:"auto", fontSize:13, fontWeight:600, color:"#6E6E73" }}>{filtered.length} contrat{filtered.length>1?"s":""}</span>
    </div>
  </Card>

  {/* List */}
  {filtered.length === 0
    ? <Card><div style={{ textAlign:"center", padding:40, color:"#AEAEB2", fontSize:14 }}>Aucun contrat</div></Card>
    : grouped.map(function(group) {
        var dateLabel = new Date(group.date+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
        var displayItems = showAll || fD ? group.items : group.items.slice(0,30);
        return (
          <div key={group.date} style={{ marginBottom:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8, paddingLeft:4 }}>
              <span style={{ fontSize:13, fontWeight:700, color:"#1D1D1F", textTransform:"capitalize" }}>{dateLabel}</span>
              <span style={{ fontSize:12, color:"#AEAEB2" }}>{group.items.length} contrat{group.items.length>1?"s":""}</span>
            </div>
            {CList(displayItems)}
            {!fD && !showAll && group.items.length > 30 && (
              <div style={{ textAlign:"center", marginTop:8 }}>
                <Btn s="sm" v="ghost" onClick={function(){ setShowAll(true); }}>Voir tout ({group.items.length-30} de plus)</Btn>
              </div>
            )}
          </div>
        );
      })
  }
</div>
);
}

// MAP
var GPS = {
"VERTOU|44":[47.17,-1.47],"VALLET|44":[47.16,-1.27],"MACHECOUL|44":[46.99,-1.82],"ST PHILBERT|44":[47.04,-1.64],"CLISSON|44":[47.09,-1.28],"LOROUX BOTTEREAU|44":[47.24,-1.35],"ST JULIEN CONCELLES|44":[47.25,-1.39],"DIVATTE SUR LOIRE|44":[47.29,-1.25],"ST ETIENNE MONTLUC|44":[47.31,-1.78],"CHEVROLIERE|44":[47.10,-1.62],"STE PAZANNE|44":[47.10,-1.82],"PONT ST MARTIN|44":[47.13,-1.58],"HAUTE GOULAINE|44":[47.20,-1.43],"AIGREFEUILLE|44":[47.07,-1.48],"BOUAYE|44":[47.14,-1.69],"LE PELLERIN|44":[47.20,-1.76],
"SAINT NAZAIRE|44":[47.27,-2.21],"BAULE ESCOUBLAC|44":[47.29,-2.39],"PORNIC|44":[47.11,-2.10],"PORNICHET|44":[47.26,-2.34],"ST BREVIN|44":[47.24,-2.17],"GUERANDE|44":[47.33,-2.43],"PONTCHATEAU|44":[47.43,-2.09],"POULIGUEN|44":[47.27,-2.43],"CROISIC|44":[47.29,-2.52],"SAVENAY|44":[47.36,-1.94],
"CESSON SEVIGNE|35":[48.12,-1.60],"BRUZ|35":[48.05,-1.75],"BETTON|35":[48.18,-1.64],"ST GREGOIRE|35":[48.15,-1.69],"PACE|35":[48.15,-1.77],"CHARTRES BRETAGNE|35":[48.04,-1.70],"NOYAL CHATILLON|35":[48.04,-1.66],"VERN SUR SEICHE|35":[48.05,-1.60],"RHEU|35":[48.10,-1.80],"MORDELLES|35":[48.07,-1.84],"LIFFRE|35":[48.21,-1.51],"CHATEAUGIRON|35":[48.05,-1.50],
"FONTENAY LE COMTE|85":[46.47,-0.81],"LUCON|85":[46.45,-1.17],"POUZAUGES|85":[46.78,-0.84],"SEVREMONT|85":[46.83,-0.88],"BENET|85":[46.37,-0.59],"STE HERMINE|85":[46.56,-1.07],"CHATAIGNERAIE|85":[46.65,-0.74],"ST MICHEL L HERM|85":[46.35,-1.11],
"ROCHE SUR YON|85":[46.67,-1.43],"MONTAIGU|85":[46.97,-1.31],"HERBIERS|85":[46.87,-1.01],"AIZENAY|85":[46.74,-1.61],"CHANTONNAY|85":[46.69,-1.05],"MORTAGNE SUR SEVRE|85":[46.99,-0.95],"ESSARTS EN BOCAGE|85":[46.78,-1.23],"CHANVERRIE|85":[46.95,-0.97],
"SABLES D OLONNE|85":[46.50,-1.78],"ST HILAIRE DE RIEZ|85":[46.72,-1.95],"ST JEAN DE MONTS|85":[46.79,-2.06],"CHALLANS|85":[46.84,-1.87],"ST GILLES CROIX DE VIE|85":[46.69,-1.94],"BRETIGNOLLES|85":[46.64,-1.86],"NOIRMOUTIER|85":[46.98,-2.25],"TALMONT ST HILAIRE|85":[46.47,-1.63],
"ROYAN|17":[45.63,-1.03],"ROCHEFORT|17":[45.94,-0.96],"ST GEORGES DIDONNE|17":[45.60,-0.99],"ST PIERRE OLERON|17":[45.94,-1.30],"VAUX SUR MER|17":[45.64,-1.06],"TREMBLADE|17":[45.77,-1.14],
"LA ROCHELLE|17":[46.16,-1.15],"AYTRE|17":[46.13,-1.12],"CHATELAILLON|17":[46.07,-1.09],"LAGORD|17":[46.18,-1.16],"MARANS|17":[46.31,-0.99],
"BRESSUIRE|79":[46.84,-0.49],"THOUARS|79":[46.98,-0.22],"MAULEON|79":[46.92,-0.75],"NUEIL LES AUBIERS|79":[46.94,-0.59],"MONCOUTANT|79":[46.72,-0.58],"CERIZAY|79":[46.82,-0.67],"COURLAY|79":[46.78,-0.56],
"NIORT|79":[46.32,-0.46],"CHAURAY|79":[46.35,-0.41],"ST MAIXENT|79":[46.41,-0.21],"MELLE|79":[46.22,-0.14],"CRECHE|79":[46.37,-0.30],
"SAINT GEORGES DE DIDONNE|17":[45.60,-1.00],"SAINT PIERRE D OLERON|17":[45.95,-1.31],"SAINT PALAIS SUR MER|17":[45.64,-1.08],"SAINT GEORGES D OLERON|17":[45.98,-1.34],"FOURAS|17":[45.98,-1.09],"DOLUS D OLERON|17":[45.92,-1.28],"TONNAY CHARENTE|17":[45.88,-0.90],"CHATEAU D OLERON|17":[45.89,-1.25],"SURGERES|17":[46.10,-0.75],"MARENNES HIERS BROUAGE|17":[45.82,-1.10],"MESCHERS SUR GIRONDE|17":[45.56,-0.95],"SAINT DENIS D OLERON|17":[46.03,-1.38],"ARVERT|17":[45.72,-1.10],"BOURCEFRANC LE CHAPUS|17":[45.85,-1.16],"AIGREFEUILLE D AUNIS|17":[45.98,-0.92],"SAINT TROJAN LES BAINS|17":[45.84,-1.22],"SAINT SULPICE DE ROYAN|17":[45.65,-1.00],"ECHILLAIS|17":[45.91,-0.94],"BREE LES BAINS|17":[46.00,-1.37],"BREUILLET|17":[45.68,-1.04],"ETAULES|17":[45.70,-1.07],"PORT DES BARQUES|17":[45.94,-1.07],"GRAND VILLAGE PLAGE|17":[45.88,-1.27],"GUA|17":[45.74,-1.01],"SAINT AGNANT|17":[45.85,-0.86],"SAINT LAURENT DE LA PREE|17":[45.97,-1.03],"SAINT JUST LUZAC|17":[45.79,-1.03],"SAINT AUGUSTIN|17":[45.61,-1.06],"SOUBISE|17":[45.87,-0.92],"CHAILLEVETTE|17":[45.75,-1.05],"ILE D AIX|17":[46.01,-1.17],"SAINT JEAN D ANGLE|17":[45.82,-1.02],"MOEZE|17":[45.86,-1.07],"SAINT SORNIN|17":[45.84,-1.07],
"ROCHELLE|17":[46.16,-1.15],"CHATELAILLON PLAGE|17":[46.07,-1.09],"PERIGNY|17":[46.13,-1.08],"FLOTTE|17":[46.19,-1.37],"SAINTE MARIE DE RE|17":[46.17,-1.32],"BOIS PLAGE EN RE|17":[46.17,-1.38],"DOMPIERRE SUR MER|17":[46.17,-1.05],"SAINT MARTIN DE RE|17":[46.20,-1.36],"COURADE SUR MER|17":[46.19,-1.39],"SAINTE SOULLE|17":[46.20,-1.07],"PORTES EN RE|17":[46.24,-1.53],"ARS EN RE|17":[46.21,-1.52],"RIVEDOUX PLAGE|17":[46.16,-1.27],"SAINT CLEMENT DES BALEINES|17":[46.23,-1.57],"JARRIE|17":[46.11,-1.09],"SAINT JEAN DE LIVERSAY|17":[46.32,-0.94],"LOIX|17":[46.22,-1.44],"SALLES SUR MER|17":[46.09,-1.07],"ANDILLY|17":[46.29,-1.02],"COURCON|17":[46.35,-0.82],"ESNANDES|17":[46.27,-1.09],"SAINT MEDARD D AUNIS|17":[46.19,-0.96],"CHARRON|17":[46.33,-1.05],"VERINES|17":[46.17,-1.01],"SAINT SAUVEUR D AUNIS|17":[46.22,-0.97],"YVES|17":[45.98,-1.02],"THAIRE|17":[46.02,-1.02],"COUARDE SUR MER|17":[46.19,-1.39],
"MONCOUTANT SUR SEVRE|79":[46.72,-0.58],"ARGENTONNAY|79":[46.98,-0.36],"LORETZ D ARGENTON|79":[46.96,-0.38],"FORET SUR SEVRE|79":[46.96,-0.83],"VAL EN VIGNES|79":[47.02,-0.15],"CHAPELLE SAINT LAURENT|79":[46.80,-0.66],"PLAINE ET VALLEES|79":[46.80,-0.63],"CHICHE|79":[46.85,-0.62],"LARGEASSE|79":[46.95,-0.70],"SAINT AMAND SUR SEVRE|79":[46.84,-0.71],"ABSIE|79":[46.79,-0.56],"COMBRAND|79":[46.82,-0.73],"GLENAY|79":[46.86,-0.35],"MONTRAVERS|79":[46.87,-0.82],
"SAINT MAIXENT L ECOLE|79":[46.41,-0.21],"AIFFRES|79":[46.30,-0.48],"AIGONDIGNE|79":[46.37,-0.40],"ECHIRE|79":[46.37,-0.37],"CELLES SUR BELLE|79":[46.27,-0.23],"MAUZE SUR LE MIGNON|79":[46.20,-0.67],"VOUILLE|79":[46.35,-0.17],"MAGNE|79":[46.43,-0.29],"CHEF BOUTONNE|79":[46.11,-0.07],"SAUZE VAUSSAIS|79":[46.14,-0.10],"FRONTENAY ROHAN ROHAN|79":[46.20,-0.58],"COULON|79":[46.32,-0.59],"PRAHECQ|79":[46.27,-0.42],"BEAUVOIR SUR NIORT|79":[46.18,-0.47],"SAINT HILAIRE LA PALUD|79":[46.27,-0.69],"BESSINES|79":[46.33,-0.44],"SAINT GELAIS|79":[46.39,-0.43],"LEZAY|79":[46.26,-0.01],"SAINT SYMPHORIEN|79":[46.33,-0.30],"BRIOUX SUR BOUTONNE|79":[46.14,-0.21],"CHERVEUX|79":[46.41,-0.32]
};

var _ML_KEYS = ["jan","fev","mar","avr","mai","jun","jul","aou","sep","oct","nov","dec"];
var _ML_FULL = ["Janv","Fev","Mars","Avr","Mai","Juin","Juil","Aout","Sept","Oct","Nov","Dec"];
var MONTHS_ORDER = (function() {
  var out = []; var sy = 2025, sm = 3;
  var now = new Date(); var ey = now.getFullYear(), em = now.getMonth() + 1;
  var y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(_ML_KEYS[m-1] + String(y).slice(2));
    if (++m > 12) { m = 1; y++; }
  }
  return out;
})();
var MONTHS_LABELS = MONTHS_ORDER.reduce(function(acc, mk) {
  var m = _ML_KEYS.indexOf(mk.slice(0,-2)); var y = "20" + mk.slice(-2);
  acc[mk] = _ML_FULL[m] + " " + y; return acc;
}, {});
var MONTH_KEY_MAP = MONTHS_ORDER.reduce(function(acc, mk) {
  acc[mk] = mk.slice(0,-2); return acc;
}, {});
var MONTHLY = {"VERTOU|44": {"fev": 2, "jan": 3, "nov": 8, "sep": 3, "aou": 2, "jul": 9, "jun": 14}, "VALLET|44": {"oct": 12, "sep": 1, "jul": 12, "jun": 1, "mai": 3}, "MACHECOUL SAINT MEME|44": {"dec": 4, "oct": 6, "sep": 4, "jul": 5, "mai": 9}, "SAINT PHILBERT DE GRAND LIEU|44": {"fev": 1, "nov": 3, "sep": 3, "jun": 6}, "CLISSON|44": {"nov": 3, "aou": 4, "jun": 6, "mai": 1}, "LOROUX BOTTEREAU|44": {"jan": 1, "nov": 2, "jun": 9}, "SAINT JULIEN DE CONCELLES|44": {"fev": 1, "nov": 3, "sep": 1, "jun": 2}, "DIVATTE SUR LOIRE|44": {"nov": 4, "jun": 4}, "SAINT ETIENNE DE MONTLUC|44": {"nov": 9, "jul": 8, "jun": 1}, "CHEVROLIERE|44": {"nov": 1, "sep": 14, "aou": 1, "mai": 8}, "SAINTE PAZANNE|44": {"fev": 1, "oct": 7, "aou": 2, "jul": 2}, "PONT SAINT MARTIN|44": {"jan": 1, "sep": 7, "jul": 4}, "HAUTE GOULAINE|44": {"fev": 2, "nov": 10, "sep": 2, "jul": 8}, "LEGE|44": {"fev": 7, "nov": 2, "sep": 4, "jun": 5}, "GORGES|44": {"dec": 4, "aou": 1, "jun": 2}, "VIEILLEVIGNE|44": {"oct": 2, "jul": 7}, "HAIE FOUASSIERE|44": {"oct": 5, "sep": 1, "jul": 1}, "GETIGNE|44": {"jun": 2, "mai": 2}, "SAINT AIGNAN GRANDLIEU|44": {"nov": 4, "sep": 5}, "BIGNON|44": {"nov": 2, "jun": 3}, "AIGREFEUILLE SUR MAINE|44": {"nov": 1, "oct": 1, "sep": 4}, "CORDEMAIS|44": {"dec": 1, "sep": 2}, "MONTBERT|44": {"nov": 4, "oct": 3, "aou": 2, "jun": 4}, "GENESTON|44": {"jun": 3}, "PALLET|44": {"oct": 3}, "CORCOUE SUR LOGNE|44": {"fev": 3, "nov": 2, "sep": 9, "jul": 3}, "LANDREAU|44": {"jan": 2, "oct": 2}, "MOUZILLON|44": {"sep": 2, "aou": 3}, "CHAPELLE HEULIN|44": {"fev": 3, "sep": 7}, "SAINT COLOMBAN|44": {"oct": 3}, "BOUSSAY|44": {"fev": 1, "sep": 2, "jun": 2}, "CHATEAU THEBAUD|44": {"nov": 3, "jul": 1}, "PLANCHE|44": {"oct": 2, "aou": 4}, "MAISDON SUR SEVRE|44": {"nov": 3, "sep": 4}, "SAINT MARS DE COUTAIS|44": {"oct": 5}, "SAINT LUMINE DE COUTAIS|44": {"nov": 2, "oct": 2, "jul": 9}, "LIMOUZINIERE|44": {"sep": 3, "jul": 4}, "MONNIERES|44": {"oct": 1}, "ROUANS|44": {"jan": 2, "oct": 6}, "SAINT HILAIRE DE CLISSON|44": {"jan": 2, "sep": 2}, "SAINT LUMINE DE CLISSON|44": {"jul": 2}, "TOUVOIS|44": {"fev": 1, "nov": 6, "jul": 7}, "REMOUILLE|44": {"oct": 2, "jul": 5}, "PAULX|44": {"oct": 3}, "SAINT ETIENNE DE MER MORTE|44": {"jul": 5}, "REGRIPPIERE|44": {"oct": 1, "jun": 1}, "TEMPLE DE BRETAGNE|44": {"fev": 1, "nov": 3}, "MARNE|44": {"oct": 5}, "REMAUDIERE|44": {"oct": 1, "aou": 6}, "SAINT FIACRE SUR MAINE|44": {"nov": 2, "oct": 3}, "BOISSIERE DU DORE|44": {"oct": 1, "aou": 3}, "VUE|44": {"jan": 1, "oct": 5}, "PORT SAINT PERE|44": {"oct": 1}, "SAINT NAZAIRE|44": {"fev": 35, "jan": 26, "dec": 27, "nov": 44, "oct": 91, "sep": 83, "aou": 9}, "BAULE ESCOUBLAC|44": {"fev": 6, "oct": 1, "sep": 1}, "PORNIC|44": {"fev": 6, "nov": 5, "sep": 9}, "PORNICHET|44": {"oct": 7}, "SAINT BREVIN LES PINS|44": {"fev": 7, "nov": 2, "oct": 3, "sep": 1}, "GUERANDE|44": {"jan": 3, "dec": 2, "nov": 8, "oct": 1, "sep": 13}, "SAINT MICHEL CHEF CHEF|44": {"fev": 4, "oct": 6, "aou": 1}, "PONTCHATEAU|44": {"fev": 4, "jan": 14, "oct": 13, "sep": 3}, "POULIGUEN|44": {"nov": 8, "sep": 2}, "CROISIC|44": {"dec": 6, "oct": 10}, "TURBALLE|44": {"nov": 7}, "PLAINE SUR MER|44": {"oct": 4}, "SAVENAY|44": {"fev": 1, "jan": 3, "nov": 8, "sep": 8}, "TRIGNAC|44": {"fev": 1, "jan": 1, "nov": 4, "oct": 9}, "BERNERIE EN RETZ|44": {"nov": 4, "sep": 2}, "DONGES|44": {"jan": 4, "nov": 12, "sep": 4, "aou": 2}, "CHAUMES EN RETZ|44": {"dec": 2, "oct": 1, "aou": 1}, "HERBIGNAC|44": {"dec": 3, "sep": 7}, "MONTOIR DE BRETAGNE|44": {"jan": 1, "nov": 6, "oct": 1, "sep": 1, "aou": 2}, "MESQUER|44": {"fev": 4}, "SAINT ANDRE DES EAUX|44": {"oct": 8}, "VILLENEUVE EN RETZ|44": {"jan": 2, "oct": 2}, "SAINT PERE EN RETZ|44": {"oct": 2, "aou": 4}, "MISSILLAC|44": {"nov": 8}, "PREFAILLES|44": {"oct": 2}, "SAINT JOACHIM|44": {"oct": 23}, "SAINT LYPHARD|44": {"nov": 4}, "CAMPBON|44": {"jan": 7, "oct": 3}, "GUENROUET|44": {"nov": 4, "oct": 5, "aou": 1}, "MOUTIERS EN RETZ|44": {"sep": 2}, "FROSSAY|44": {"fev": 2, "nov": 1, "oct": 5}, "CHAUVE|44": {"jan": 4, "oct": 3}, "PRINQUIAU|44": {"nov": 1, "sep": 3}, "ASSERAC|44": {"nov": 1, "sep": 4}, "MALVILLE|44": {"oct": 5}, "PAIMBOEUF|44": {"fev": 8, "oct": 6}, "SAINTE ANNE SUR BRIVET|44": {"fev": 1, "oct": 3}, "SAINT GILDAS DES BOIS|44": {"nov": 3, "oct": 6}, "SAINT MOLF|44": {"dec": 5, "sep": 8}, "SAINT MALO DE GUERSAC|44": {"nov": 9}, "SAINT VIAUD|44": {"fev": 3, "oct": 5}, "CROSSAC|44": {"jan": 7, "sep": 5}, "CHAPELLE LAUNAY|44": {"nov": 2, "sep": 1}, "SAINT HILAIRE DE CHALEONS|44": {"dec": 1, "oct": 2, "aou": 1}, "CORSEPT|44": {"oct": 3}, "DREFFEAC|44": {"fev": 3, "nov": 1, "oct": 4}, "SAINTE REINE DE BRETAGNE|44": {"nov": 4}, "SEVERAC|44": {"nov": 2, "oct": 1}, "QUILLY|44": {"jan": 1, "oct": 1}, "BOUEE|44": {"dec": 1, "nov": 2, "sep": 1}, "LAVAU SUR LOIRE|44": {"dec": 5, "sep": 2}, "CESSON SEVIGNE|35": {"fev": 5, "nov": 4, "sep": 6, "aou": 7, "jul": 5, "jun": 30}, "BRUZ|35": {"jan": 5, "oct": 27, "aou": 5, "jul": 39, "jun": 4}, "BETTON|35": {"jul": 7}, "SAINT GREGOIRE|35": {"fev": 3, "jul": 5, "mai": 8, "avr": 15}, "PACE|35": {"oct": 4, "jul": 1, "jun": 5}, "CHARTRES DE BRETAGNE|35": {"fev": 3, "nov": 3, "oct": 8, "jun": 16}, "NOYAL CHATILLON SUR SEICHE|35": {"fev": 1, "oct": 8, "jul": 13, "mai": 39}, "VERN SUR SEICHE|35": {"jul": 5, "jun": 1}, "RHEU|35": {"aou": 1, "jun": 3, "avr": 10}, "MORDELLES|35": {"aou": 1, "jun": 5, "mai": 7}, "LIFFRE|35": {"oct": 9, "jul": 5, "jun": 3}, "CHATEAUGIRON|35": {"nov": 5, "jun": 12}, "MELESSE|35": {"oct": 5, "jul": 6, "mai": 13}, "MONTFORT SUR MEU|35": {"jul": 3}, "ORGERES|35": {"fev": 2, "dec": 2, "aou": 7, "jun": 10, "avr": 5}, "BREAL SOUS MONTFORT|35": {"jul": 13}, "CHAPELLE DES FOUGERETZ|35": {"sep": 8, "jun": 7, "mai": 5}, "MEZIERE|35": {"jul": 7, "mai": 4}, "HERMITAGE|35": {"fev": 3, "oct": 10, "jul": 11}, "BOURGBARRE|35": {"aou": 9}, "BOUEXIERE|35": {"aou": 1, "jul": 8}, "PONT PEAN|35": {"fev": 2, "nov": 2, "oct": 8, "aou": 12, "jun": 2}, "NOUVOITOU|35": {"jul": 2}, "CORPS NUDS|35": {"oct": 4, "jul": 3, "jun": 1}, "MONTGERMONT|35": {"fev": 2, "sep": 11, "mai": 4, "avr": 9}, "ROMILLE|35": {"nov": 8, "jun": 3}, "DOMLOUP|35": {"jul": 5}, "SAINT ARMEL|35": {"oct": 6, "jul": 8}, "GUIPEL|35": {"jun": 1}, "FONTENAY LE COMTE|85": {"fev": 6, "nov": 31, "oct": 7, "sep": 3, "jul": 10, "jun": 19, "mai": 5}, "LUCON|85": {"fev": 7, "nov": 5, "oct": 10, "sep": 20, "jul": 9, "jun": 39, "avr": 8}, "POUZAUGES|85": {"jan": 6, "oct": 1, "sep": 3, "aou": 3, "jul": 2, "jun": 2, "avr": 6}, "SEVREMONT|85": {"fev": 1, "nov": 9, "sep": 7, "jun": 12}, "BENET|85": {"dec": 5, "jun": 4}, "SAINTE HERMINE|85": {"dec": 7, "oct": 1, "aou": 7, "mai": 9}, "CHATAIGNERAIE|85": {"oct": 8, "sep": 1, "jul": 5, "mai": 2, "avr": 12}, "SAINT MICHEL EN L HERM|85": {"jan": 9, "jun": 8}, "BOUPERE|85": {"sep": 3, "jul": 1, "jun": 6}, "MAREUIL SUR LAY DISSAIS|85": {"fev": 3, "sep": 10, "jun": 5}, "TERVAL|85": {"oct": 3, "sep": 4}, "NALLIERS|85": {"fev": 1, "sep": 1, "jul": 1, "jun": 10}, "RIVES D AUTISE|85": {"aou": 2}, "SAINT HILAIRE DES LOGES|85": {"oct": 12}, "SAINTE GEMME LA PLAINE|85": {"nov": 3, "jun": 4}, "MOUILLERON SAINT GERMAIN|85": {"oct": 1, "sep": 6, "aou": 2}, "CHAILLE LES MARAIS|85": {"nov": 2}, "VIX|85": {"nov": 3, "jul": 6, "mai": 3}, "CHAMPAGNE LES MARAIS|85": {"nov": 6, "jun": 1}, "SAINT MESMIN|85": {"jan": 1, "dec": 1, "sep": 8}, "MONTOURNAIS|85": {"dec": 2, "aou": 2}, "ILE D ELLE|85": {"jul": 5}, "GRUES|85": {"nov": 3, "jun": 3}, "SAINT PIERRE DU CHEMIN|85": {"nov": 5, "oct": 5}, "RIVES DU FOUGERAIS|85": {"fev": 1, "oct": 5}, "MAGNILS REIGNIERS|85": {"nov": 5}, "MEILLERAIE TILLAY|85": {"nov": 5}, "VELLUIRE SUR VENDEE|85": {"nov": 4, "jun": 3, "mar": 1}, "CHATEAU GUIBERT|85": {"sep": 3}, "MERVENT|85": {"sep": 6}, "FOUSSAIS PAYRE|85": {"dec": 3, "sep": 3}, "TRIAIZE|85": {"nov": 3, "jun": 3}, "BAZOGES EN PAREDS|85": {"oct": 3}, "VOUVANT|85": {"fev": 1, "aou": 6}, "CAILLERE SAINT HILAIRE|85": {"oct": 2}, "MAILLEZAIS|85": {"dec": 2, "aou": 2}, "PISSOTTE|85": {"nov": 5}, "LONGEVES|85": {"oct": 1}, "MOUZEUIL SAINT MARTIN|85": {"jun": 3}, "SERIGNE|85": {"nov": 1}, "CHEFFOIS|85": {"oct": 4}, "ANTIGNY|85": {"nov": 4}, "SAINT MICHEL LE CLOUCQ|85": {"jul": 3}, "LANGON|85": {"nov": 1, "jun": 4}, "DAMVIX|85": {"sep": 5, "jun": 2}, "MONSIREIGNE|85": {"sep": 2}, "SAINTE RADEGONDE DES NOYERS|85": {"nov": 1, "jul": 4}, "HERMENAULT|85": {"oct": 6}, "CORPE|85": {"jan": 1, "jul": 6}, "REAUMUR|85": {"aou": 2}, "MAILLE|85": {"sep": 7}, "MOUTIERS SUR LE LAY|85": {"sep": 5}, "VOUILLE LES MARAIS|85": {"nov": 2, "jun": 3}, "SAINT HILAIRE DE VOUST|85": {"dec": 2}, "SAINT PIERRE LE VIEUX|85": {"dec": 1}, "CHASNAIS|85": {"nov": 2}, "CHAVAGNES LES REDOUX|85": {"nov": 4}, "LAIROUX|85": {"nov": 4}, "SAINT JEAN DE BEUGNE|85": {"sep": 6}, "MONTREUIL|85": {"sep": 1}, "SAINT MAURICE DES NOUES|85": {"nov": 2}, "SAINT MARTIN DE FRAIGNEAU|85": {"dec": 1, "sep": 1, "aou": 1, "jul": 4}, "BOURNEAU|85": {"nov": 8}, "BRETONNIERE LA CLAYE|85": {"nov": 3}, "JAUDONNIERE|85": {"oct": 2}, "MENOMBLET|85": {"dec": 1, "nov": 3}, "XANTON CHASSENON|85": {"jul": 5}, "SAINT DENIS DU PAYRE|85": {"nov": 3}, "PEAULT|85": {"sep": 3, "jul": 2}, "MAZEAU|85": {"sep": 1, "jun": 1}, "PINEAUX|85": {"sep": 1}, "THIRE|85": {"oct": 4}, "GUE DE VELLUIRE|85": {"jun": 2, "mai": 2}, "POUILLE|85": {"oct": 1}, "SAINT VALERIEN|85": {"oct": 2}, "BOUILLE COURDAULT|85": {"jul": 3}, "SAINT MARTIN LARS EN SAINTE HERMINE|85": {"dec": 1}, "SAINT ETIENNE DE BRILLOUET|85": {"nov": 4}, "PETOSSE|85": {"oct": 1}, "TAILLEE|85": {"nov": 2, "jun": 3}, "PUYRAVAULT|85": {"nov": 1, "jul": 4}, "SAINT AUBIN LA PLAINE|85": {"dec": 1, "jun": 2}, "MARSAIS SAINTE RADEGONDE|85": {"oct": 2}, "CHAPELLE THEMER|85": {"oct": 3}, "SAINT SIGISMOND|85": {"sep": 5}, "TALLUD SAINTE GEMME|85": {"oct": 4}, "BESSAY|85": {"jul": 4}, "MOREILLES|85": {"jul": 4}, "LOGE FOUGEREUSE|85": {"oct": 5}, "LIEZ|85": {"sep": 3}, "FAYMOREAU|85": {"oct": 3, "sep": 5}, "SAINTE PEXINE|85": {"sep": 4}, "ROCHE SUR YON|85": {"fev": 61, "jan": 81, "oct": 2, "sep": 98, "aou": 3, "jul": 55, "jun": 60, "mai": 16, "mar": 5, "dec": 1}, "MONTAIGU VENDEE|85": {"fev": 5, "jan": 10, "sep": 5, "jul": 12, "jun": 16, "avr": 6}, "HERBIERS|85": {"fev": 1, "jan": 7, "sep": 1, "aou": 14, "jul": 14, "jun": 7, "avr": 2}, "AIZENAY|85": {"jan": 5, "jun": 3, "dec": 1}, "CHANTONNAY|85": {"jan": 8, "aou": 2, "jun": 7, "mai": 5, "avr": 1, "mar": 3, "fev": 1, "oct": 1}, "POIRE SUR VIE|85": {"jan": 1, "aou": 2, "jun": 1}, "MORTAGNE SUR SEVRE|85": {"fev": 8, "sep": 10, "mai": 8}, "ESSARTS EN BOCAGE|85": {"fev": 1, "jan": 7, "sep": 5, "mai": 5, "dec": 1}, "AUBIGNY LES CLOUZEAUX|85": {"jan": 5, "sep": 10, "jul": 3, "oct": 1}, "CHANVERRIE|85": {"jan": 4, "sep": 7, "jun": 1, "mai": 3}, "BELLEVIGNY|85": {"jan": 4, "sep": 2, "aou": 3, "mai": 5}, "MOUILLERON LE CAPTIF|85": {"jan": 1, "jul": 1}, "FERRIERE|85": {"jan": 4, "sep": 5, "jun": 5}, "CUGAND|85": {"sep": 5}, "RIVES DE L YON|85": {"jan": 5, "jul": 4, "fev": 1}, "DOMPIERRE SUR YON|85": {"fev": 4, "sep": 5, "jun": 1, "nov": 1}, "BRUFFIERE|85": {"fev": 1, "sep": 6, "jul": 5, "mai": 3}, "SAINT FULGENT|85": {"jan": 2, "sep": 9, "jun": 3}, "VENANSAULT|85": {"jan": 1}, "CHAIZE LE VICOMTE|85": {"jan": 2, "jun": 7}, "BOURNEZEAU|85": {"fev": 2, "aou": 3, "jan": 3}, "CHAVAGNES EN PAILLERS|85": {"fev": 3, "jul": 4}, "LUCS SUR BOULOGNE|85": {"fev": 4, "aou": 6, "jun": 3}, "MONTREVERD|85": {"jan": 2, "aou": 11}, "SAINT PHILBERT DE BOUAINE|85": {"jun": 3}, "SAINT LAURENT SUR SEVRE|85": {"fev": 4}, "GAUBRETIERE|85": {"fev": 3, "aou": 8}, "HERBERGEMENT|85": {"jan": 8, "jul": 1, "jun": 4}, "NESMY|85": {"sep": 6, "jul": 7, "jun": 2, "mar": 1}, "MOUCHAMPS|85": {"fev": 2, "jun": 1}, "TREIZE SEPTIERS|85": {"fev": 2, "sep": 4, "jul": 2, "jun": 4}, "EPESSES|85": {"fev": 2, "aou": 4}, "BROUZILS|85": {"jul": 1, "avr": 1}, "CHAUCHE|85": {"jan": 2, "jun": 7}, "LANDES GENUSSON|85": {"fev": 3, "sep": 7, "aou": 1, "jun": 8}, "SAINT MARTIN DES NOYERS|85": {"fev": 3, "aou": 5, "jan": 1}, "SAINT DENIS LA CHEVASSE|85": {"jan": 3, "oct": 1}, "BOISSIERE DE MONTAIGU|85": {"fev": 3, "sep": 7, "jun": 2}, "APREMONT|85": {"jul": 3}, "SAINT ETIENNE DU BOIS|85": {"fev": 2, "jun": 1}, "BERNARDIERE|85": {"fev": 1}, "SAINT GERMAIN DE PRINCAY|85": {"jun": 2}, "SAINT PROUANT|85": {"sep": 1, "jul": 1}, "TIFFAUGES|85": {"fev": 3, "jan": 2, "jun": 1}, "MACHE|85": {"jul": 5}, "SAINT AUBIN DES ORMEAUX|85": {"jul": 4}, "THORIGNY|85": {"jul": 4}, "MESNARD LA BAROTIERE|85": {"fev": 3}, "SAINT MALO DU BOIS|85": {"fev": 1, "sep": 3}, "TREIZE VENTS|85": {"sep": 9}, "PALLUAU|85": {"fev": 3, "jun": 1}, "SAINT HILAIRE LE VOUHIS|85": {"aou": 10}, "SAINT MARTIN DES TILLEULS|85": {"jul": 9}, "COPECHAGNIERE|85": {"jan": 2, "jul": 3}, "SIGOURNAIS|85": {"jun": 2}, "CHAPELLE PALLUAU|85": {"jun": 2}, "RABATELIERE|85": {"jul": 2, "jun": 5}, "MERLATIERE|85": {"jun": 1}, "SAINT MARS LA REORTHE|85": {"sep": 7}, "SAINT VINCENT STERLANGES|85": {"jan": 5, "jun": 5}, "GRAND LANDES|85": {"jun": 3}, "TABLIER|85": {"jul": 2}, "MALLIEVRE|85": {"sep": 3}, "SABLES D OLONNE|85": {"fev": 11, "jan": 5, "dec": 5, "nov": 5, "oct": 80, "sep": 6, "jun": 40, "mai": 25, "avr": 23}, "SAINT HILAIRE DE RIEZ|85": {"nov": 11, "jun": 9, "mai": 5}, "SAINT JEAN DE MONTS|85": {"oct": 9, "jun": 1}, "CHALLANS|85": {"fev": 9, "jan": 5, "dec": 7, "nov": 12, "oct": 24, "sep": 10, "jun": 10, "mai": 14, "avr": 14}, "SAINT GILLES CROIX DE VIE|85": {"nov": 24, "sep": 3, "jun": 9}, "BRETIGNOLLES SUR MER|85": {"jun": 7}, "TRANCHE SUR MER|85": {"fev": 1}, "NOIRMOUTIER EN L ILE|85": {"oct": 4, "nov": 1}, "TALMONT SAINT HILAIRE|85": {"nov": 8, "jun": 8}, "ILE D YEU|85": {"mar": 1}, "AIGUILLON LA PRESQU ILE|85": {"fev": 2}, "JARD SUR MER|85": {"jun": 1, "mar": 1}, "LONGEVILLE SUR MER|85": {"oct": 4, "mar": 2}, "BARRE DE MONTS|85": {"dec": 1}, "FENOUILLER|85": {"nov": 4}, "GARNACHE|85": {"fev": 5, "oct": 8, "jun": 9}, "BEAUVOIR SUR MER|85": {"nov": 3, "oct": 8}, "SOULLANS|85": {"fev": 4, "jun": 3}, "ACHARDS|85": {"oct": 2, "jun": 4}, "ANGLES|85": {"dec": 8, "mar": 1}, "COEX|85": {"fev": 1, "nov": 3, "oct": 8, "mar": 1}, "COMMEQUIERS|85": {"dec": 1, "oct": 2}, "SALLERTAINE|85": {"nov": 5, "jun": 1}, "AIGUILLON SUR VIE|85": {"nov": 7}, "BOUIN|85": {"oct": 6}, "ILE D OLONNE|85": {"oct": 5}, "SAINT GERVAIS|85": {"nov": 2, "jun": 2}, "MOUTIERS LES MAUXFAITS|85": {"oct": 12, "avr": 4}, "PERRIER|85": {"nov": 2}, "CHAMP SAINT PERE|85": {"oct": 3, "avr": 1, "mar": 2}, "BEAULIEU SOUS LA ROCHE|85": {"fev": 1, "nov": 1, "jun": 3}, "NIEUL LE DOLENT|85": {"nov": 2, "jun": 4, "fev": 1}, "NOTRE DAME DE RIEZ|85": {"nov": 3}, "SAINTE FOY|85": {"fev": 2}, "BOIS DE CENE|85": {"oct": 3}, "SAINTE FLAIVE DES LOUPS|85": {"mar": 3, "nov": 1}, "SAINT JULIEN DES LANDES|85": {"oct": 7}, "AVRILLE|85": {"dec": 3, "oct": 1}, "GROSBREUIL|85": {"dec": 1, "nov": 1}, "SAINT MATHURIN|85": {"nov": 6, "fev": 1}, "FROIDFOND|85": {"fev": 3, "jun": 6}, "SAINT REVEREND|85": {"avr": 5}, "SAINT URBAIN|85": {"jun": 4}, "SAINT VINCENT SUR GRAON|85": {"oct": 2, "sep": 1}, "VAIRE|85": {"mai": 5}, "SAINT GEORGES DE POINTINDOUX|85": {"nov": 3, "mai": 7}, "BERNARD|85": {"oct": 1, "mai": 2}, "CHAIZE GIRAUD|85": {"avr": 2}, "POIROUX|85": {"mai": 3}, "BOISSIERE DES LANDES|85": {"mai": 5}, "MARTINET|85": {"fev": 3, "avr": 3}, "SAINT AVAUGOURD DES LANDES|85": {"mai": 3}, "CHAPELLE HERMIER|85": {"fev": 3, "oct": 2, "avr": 4}, "CHATEAUNEUF|85": {"fev": 2, "jun": 4}, "GIROUARD|85": {"oct": 2}, "SAINT BENOIST SUR MER|85": {"mai": 3}, "CURZON|85": {"avr": 3}, "JONCHERE|85": {"oct": 3, "fev": 3}, "GIVRE|85": {"oct": 2}, "SAINT CYR EN TALMONDAIS|85": {"avr": 3}, "ROYAN|17": {"fev": 34}, "ROCHEFORT|17": {"jan": 1, "dec": 8}, "VOUHE|17": {"fev": 1}, "ROCHELLE|17": {"fev": 29, "jan": 20, "dec": 69}, "AYTRE|17": {"jan": 23, "dec": 15}, "LAGORD|17": {"fev": 2}, "MARANS|17": {"fev": 13}, "SAINTE SOULLE|17": {"jan": 4}, "ANDILLY|17": {"jan": 2}, "NUAILLE D AUNIS|17": {"jan": 2}, "BRESSUIRE|79": {"fev": 18, "jan": 5}, "THOUARS|79": {"fev": 4, "jan": 11}, "MAULEON|79": {"fev": 1}, "NUEIL LES AUBIERS|79": {"fev": 4, "jan": 8}, "MONCOUTANT SUR SEVRE|79": {"fev": 10}, "CERIZAY|79": {"jan": 18}, "ARGENTONNAY|79": {"jan": 4}, "LORETZ D ARGENTON|79": {"fev": 4}, "COURLAY|79": {"fev": 12}, "VAL EN VIGNES|79": {"fev": 1}, "CHAPELLE SAINT LAURENT|79": {"fev": 6}, "SAINT PIERRE DES ECHAUBROGNES|79": {"jan": 4}, "SAINT AMAND SUR SEVRE|79": {"jan": 5}, "CIRIERES|79": {"fev": 4}, "PIN|79": {"jan": 4}, "SAINT JACQUES DE THOUARS|79": {"fev": 4, "jan": 5}, "NIORT|79": {"fev": 44, "jan": 40}, "CHAURAY|79": {"jan": 1}, "SAINT MAIXENT L ECOLE|79": {"fev": 7}, "CRECHE|79": {"fev": 1}, "FRONTENAY ROHAN ROHAN|79": {"fev": 4}, "SAINT SYMPHORIEN|79": {"fev": 2}, "EXIREUIL|79": {"fev": 7}};

function getC(commune, dept, month) {
if (!month) return commune.c || 0;
// Carnet first (live, accurate) — fallback to Excel MONTHLY for old months not in carnet
var carnetVal = (CARNET_BY_VILLE_MONTH[commune.v] && CARNET_BY_VILLE_MONTH[commune.v][month]) || 0;
if (carnetVal > 0) return carnetVal;
var dataKey = MONTH_KEY_MAP[month] || month;
var m = MONTHLY[commune.v + "|" + dept];
return m ? (m[dataKey] || 0) : 0;
}

function MapTab() {
var mapRef = useRef(null);
var mapInstance = useRef(null);
const [mapReady, setMapReady] = useState(false);
const [month, setMonth] = useState("");

useEffect(function() {
if (window.L) { setMapReady(true); return; }
if (document.getElementById("leaflet-css")) { if (window.L) setMapReady(true); return; }
var css = document.createElement("link");
css.id = "leaflet-css"; css.rel = "stylesheet";
css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
document.head.appendChild(css);
var js = document.createElement("script");
js.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
js.onload = function() { setMapReady(true); };
document.head.appendChild(js);
}, []);

useEffect(function() {
if (!mapReady || !mapRef.current) return;
if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
var L = window.L; if (!L) return;
var map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: true }).setView([46.6, -1.1], 8);
mapInstance.current = map;
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "OSM", maxZoom: 16 }).addTo(map);
setTimeout(function() {
map.invalidateSize();
Object.entries(JACHERE).forEach(function(entry) {
var jName = entry[0]; var jData = entry[1];
jData.communes.forEach(function(commune) {
var key = commune.v + "|" + jData.dept;
var coords = GPS[key]; if (!coords) return;
var c = getC(commune, jData.dept, month);
var taux = commune.p > 0 ? (c / commune.p * 100) : 0;
var color = c === 0 ? "#AEAEB2" : taux > 0.8 ? "#34C759" : taux > 0.3 ? "#FF9F0A" : "#FF3B30";
var radius = Math.max(5, Math.min(22, Math.sqrt(c) * 2.5));
L.circleMarker([coords[0], coords[1]], { radius: radius, fillColor: color, color: "#fff", weight: 2, opacity: 1, fillOpacity: 0.85 }).addTo(map).bindPopup(
"<div style='font-family:-apple-system,sans-serif;min-width:180px'><b style='font-size:14px'>" + commune.v + "</b><br>" +
"<span style='font-size:11px;color:#6B7280'>" + jName + " | " + (commune.z === "H" ? "Haute" : "Standard") + "</span><hr style='margin:6px 0;border:none;border-top:1px solid #eee'>" +
"Prises: <b>" + commune.p.toLocaleString("fr-FR") + "</b><br>Contrats: <b style='color:" + color + "'>" + c + "</b><br>Taux: <b style='color:" + color + "'>" + taux.toFixed(2) + "%</b></div>"
);
});
});
Object.entries(JACHERE_TALC).forEach(function(entry) {
var jName = entry[0]; var jData = entry[1];
jData.communes.forEach(function(commune) {
var key = commune.v + "|" + jData.dept;
var coords = GPS[key]; if (!coords) return;
var c = getTalcC(commune, jData.dept, month);
var taux = commune.p > 0 ? (c / commune.p * 100) : 0;
var color = c === 0 ? "#AEAEB2" : taux > 0.8 ? "#34C759" : taux > 0.3 ? "#FF9F0A" : "#FF3B30";
var radius = Math.max(5, Math.min(22, Math.sqrt(c) * 2.5 + 4));
L.circleMarker([coords[0], coords[1]], { radius: radius, fillColor: color, color: "#FF9F0A", weight: 3, opacity: 1, fillOpacity: 0.85 }).addTo(map).bindPopup(
"<div style='font-family:-apple-system,sans-serif;min-width:180px'><b style='font-size:14px'>" + commune.v + "</b> <span style='font-size:10px;background:#FF9F0A;color:#fff;border-radius:4px;padding:1px 5px;font-weight:700'>TALC</span><br>" +
"<span style='font-size:11px;color:#6B7280'>" + jName + " | Zone " + commune.z + (commune.z === "H" ? " (+5€)" : " (-15€)") + "</span><hr style='margin:6px 0;border:none;border-top:1px solid #eee'>" +
"Prises: <b>" + commune.p.toLocaleString("fr-FR") + "</b><br>Contrats: <b style='color:" + color + "'>" + c + "</b><br>Taux: <b style='color:" + color + "'>" + taux.toFixed(2) + "%</b></div>"
);
});
});
}, 400);
return function() { if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; } };
}, [mapReady, month]);

return (
<div>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
<h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: -0.4, color: "#1D1D1F" }}>Carte des jacheres</h2>
<Sel value={month} onChange={setMonth} placeholder="Tous les mois" options={MONTHS_ORDER.map(function(m) { return { value: m, label: MONTHS_LABELS[m] }; })} style={{ minWidth: 150 }} />
</div>
<Card style={{ padding: 0, overflow: "hidden", marginBottom: 12, borderRadius: 14 }}>
<div ref={mapRef} style={{ width: "100%", height: 560 }}>
{!mapReady && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 560, color: "#AEAEB2" }}>Chargement...</div>}
</div>
</Card>
<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
<div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 12, height: 12, borderRadius: "50%", background: "#34C759" }} /><span style={{ fontSize: 11, color: "#6E6E73" }}>Bon taux</span></div>
<div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 12, height: 12, borderRadius: "50%", background: "#FF9F0A" }} /><span style={{ fontSize: 11, color: "#6E6E73" }}>Moyen</span></div>
<div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 12, height: 12, borderRadius: "50%", background: "#FF3B30" }} /><span style={{ fontSize: 11, color: "#6E6E73" }}>Faible</span></div>
<div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 12, height: 12, borderRadius: "50%", background: "#AEAEB2" }} /><span style={{ fontSize: 11, color: "#6E6E73" }}>0 contrats</span></div>
<div style={{ marginLeft: 8, display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 12, height: 12, borderRadius: "50%", background: "#888", border: "2.5px solid #FF9F0A" }} /><span style={{ fontSize: 11, color: "#6E6E73" }}>TALC</span></div>
<div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 12, height: 12, borderRadius: "50%", background: "#888", border: "2px solid #fff" }} /><span style={{ fontSize: 11, color: "#6E6E73" }}>Stratygo</span></div>
</div>
</div>
);
}

function SecteursTab() {
const [sel, setSel] = useState(null);
const [selSource, setSelSource] = useState(null);
const [sortBy, setSortBy] = useState("c");
const [month, setMonth] = useState("");
const [communeView, setCommuneView] = useState(null); // { commune, dept, isTalc }
const [rueSearch, setRueSearch] = useState("");

var last6Months = MONTHS_ORDER.slice(-6);

var stats = Object.entries(JACHERE).map(function(entry) {
var name = entry[0]; var data = entry[1];
var tp = data.communes.reduce(function(s, c) { return s + c.p; }, 0);
var tc = data.communes.reduce(function(s, c) { return s + getC(c, data.dept, month); }, 0);
return { name: name, dept: data.dept, communes: data.communes, tp: tp, tc: tc, taux: tp ? (tc / tp * 100) : 0, source: "JACHERE" };
});
var statsTalc = Object.entries(JACHERE_TALC).map(function(entry) {
var name = entry[0]; var data = entry[1];
var tp = data.communes.reduce(function(s, c) { return s + c.p; }, 0);
var tc = data.communes.reduce(function(s, c) { return s + getTalcC(c, data.dept, month); }, 0);
return { name: name, dept: data.dept, communes: data.communes, tp: tp, tc: tc, taux: tp ? (tc / tp * 100) : 0, source: "TALC" };
});

// === COMMUNE DETAIL VIEW ===
if (communeView) {
var cv = communeView.commune;
var cvDept = communeView.dept;
var cvTalc = communeView.isTalc;
var cvColor = cvTalc ? "#FF9F0A" : "#34C759";

// Bar chart: last 6 months
var cvVals = last6Months.map(function(mk) {
  return { mk: mk, label: MONTHS_LABELS[mk], count: cvTalc ? getTalcC(cv, cvDept, mk) : getC(cv, cvDept, mk) };
});
var cvMax = Math.max.apply(null, cvVals.map(function(v) { return v.count; })) || 1;
var cvTotal6 = cvVals.reduce(function(s, v) { return s + v.count; }, 0);

// Street data from live contracts
var cvContracts = DEMO_CONTRACTS.filter(function(ct) {
  return (ct.ville || "").toUpperCase().trim() === cv.v;
});
// Group by rue
var rueMap = {};
cvContracts.forEach(function(ct) {
  var r = (ct.rue || "").trim();
  if (!r) r = "(rue non renseignée)";
  if (!rueMap[r]) rueMap[r] = { count: 0, commerciaux: {}, lastDate: "" };
  rueMap[r].count++;
  if (ct.date && ct.date > rueMap[r].lastDate) rueMap[r].lastDate = ct.date;
  var com = ct.commercial || "?";
  rueMap[r].commerciaux[com] = (rueMap[r].commerciaux[com] || 0) + 1;
});
var rueList = Object.entries(rueMap).sort(function(a, b) { return b[1].count - a[1].count; });
var rueQuery = rueSearch.trim().toUpperCase();
var rueFiltered = rueQuery ? rueList.filter(function(e) { return e[0].toUpperCase().indexOf(rueQuery) >= 0; }) : rueList;

// Commercial color palette (reuse team colors)
var comColors = ["#0071E3","#34C759","#FF9F0A","#FF3B30","#AF52DE","#5AC8FA","#FF2D55","#5856D6"];
var comColorMap = {};
var comColorIdx = 0;
function getComColor(name) {
  if (!comColorMap[name]) { comColorMap[name] = comColors[comColorIdx++ % comColors.length]; }
  return comColorMap[name];
}

return (
<div>
{/* Breadcrumb nav */}
<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
  <Btn v="ghost" onClick={function() { setSel(null); setSelSource(null); setCommuneView(null); setRueSearch(""); }}>← Secteurs</Btn>
  <span style={{ color: "#D1D1D6", fontSize: 14 }}>›</span>
  <Btn v="ghost" onClick={function() { setCommuneView(null); setRueSearch(""); }}>{sel}</Btn>
  <span style={{ color: "#D1D1D6", fontSize: 14 }}>›</span>
  <span style={{ fontSize: 14, fontWeight: 700, color: "#1D1D1F" }}>{cv.v}</span>
</div>

{/* Header card */}
<Card style={{ marginBottom: 16, padding: 20 }}>
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
    <div>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.6 }}>{cv.v}</h2>
      <div style={{ fontSize: 13, color: "#6E6E73", marginTop: 3 }}>{cv.p.toLocaleString("fr-FR")} prises · Dept {cvDept}</div>
    </div>
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <Badge color={cvTalc ? "#FF9F0A" : "#6E6E73"}>{cvTalc ? "TALC" : "Stratygo"}</Badge>
      <Badge color={cv.z === "H" ? "#FF3B30" : "#0071E3"}>{cv.z === "H" ? "Haute densité" : "Standard"}</Badge>
    </div>
  </div>
  {/* 6-month bar chart */}
  <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
    {cvVals.map(function(v) {
      var h = Math.max(v.count / cvMax * 60, v.count > 0 ? 6 : 2);
      var isCur = month === v.mk;
      var col = v.count === 0 ? "#E5E5EA" : isCur ? "#0071E3" : cvColor;
      var lbl = v.label.split(" ");
      return (
        <div key={v.mk} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: v.count > 0 ? (isCur ? "#0071E3" : "#1D1D1F") : "#E5E5EA" }}>{v.count || ""}</div>
          <div style={{ width: "100%", height: 60, display: "flex", alignItems: "flex-end" }}>
            <div style={{ width: "100%", height: h, borderRadius: "4px 4px 0 0", background: col }} />
          </div>
          <div style={{ fontSize: 9, color: isCur ? "#0071E3" : "#AEAEB2", fontWeight: isCur ? 700 : 400, textAlign: "center", lineHeight: 1.2 }}>{lbl[0]}<br/>{lbl[1]}</div>
        </div>
      );
    })}
  </div>
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: "1px solid #F5F5F7" }}>
    <span style={{ fontSize: 12, color: "#6E6E73" }}>Total 6 derniers mois</span>
    <span style={{ fontSize: 18, fontWeight: 800, color: cvTotal6 > 0 ? "#1D1D1F" : "#D1D1D6" }}>{cvTotal6} contrat{cvTotal6 > 1 ? "s" : ""}</span>
  </div>
</Card>

{/* Street search */}
<Card style={{ padding: 20 }}>
  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#1D1D1F", flex: 1 }}>Rues</h3>
    <span style={{ fontSize: 12, color: "#AEAEB2" }}>{cvContracts.length} contrat{cvContracts.length > 1 ? "s" : ""} · {rueList.length} rue{rueList.length > 1 ? "s" : ""}</span>
  </div>
  <div style={{ position: "relative", marginBottom: 16 }}>
    <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "#AEAEB2", pointerEvents: "none" }}>🔍</span>
    <input
      value={rueSearch}
      onChange={function(e) { setRueSearch(e.target.value); }}
      placeholder="Rechercher une rue..."
      style={{ width: "100%", boxSizing: "border-box", paddingLeft: 36, paddingRight: 12, paddingTop: 10, paddingBottom: 10, fontSize: 14, border: "1.5px solid #E5E5EA", borderRadius: 10, outline: "none", fontFamily: "inherit", background: "#FAFAFA", color: "#1D1D1F" }}
    />
    {rueSearch && (
      <button onClick={function() { setRueSearch(""); }} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#AEAEB2", fontSize: 16, padding: 2 }}>×</button>
    )}
  </div>
  {rueFiltered.length === 0 ? (
    <div style={{ textAlign: "center", padding: "24px 0", color: "#AEAEB2", fontSize: 13 }}>Aucune rue trouvée</div>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {rueFiltered.map(function(entry, i) {
        var rue = entry[0]; var info = entry[1];
        var coms = Object.entries(info.commerciaux).sort(function(a, b) { return b[1] - a[1]; });
        var relTime = "";
        if (info.lastDate) {
          var diff = Math.floor((new Date() - new Date(info.lastDate + "T12:00:00")) / 86400000);
          if (diff === 0) relTime = "aujourd'hui";
          else if (diff === 1) relTime = "hier";
          else if (diff < 7) relTime = "il y a " + diff + " j";
          else if (diff < 30) relTime = "il y a " + Math.floor(diff / 7) + " sem.";
          else if (diff < 365) relTime = "il y a " + Math.floor(diff / 30) + " mois";
          else relTime = "il y a " + Math.floor(diff / 365) + " an" + (diff >= 730 ? "s" : "");
        }
        return (
          <div key={rue} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: i % 2 ? "#FAFAFA" : "#fff", borderRadius: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1D1D1F", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rue}</span>
                {relTime && <span style={{ fontSize: 11, color: "#AEAEB2", whiteSpace: "nowrap", flexShrink: 0 }}>{relTime}</span>}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {coms.map(function(ce) {
                  var firstName = ce[0].split(" ")[0];
                  return (
                    <span key={ce[0]} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: getComColor(ce[0]), background: getComColor(ce[0]) + "18", borderRadius: 20, paddingLeft: 8, paddingRight: 8, paddingTop: 3, paddingBottom: 3 }}>
                      {firstName}{ce[1] > 1 ? <span style={{ fontWeight: 800 }}>×{ce[1]}</span> : ""}
                    </span>
                  );
                })}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: cvColor }}>{info.count}</div>
              <div style={{ fontSize: 10, color: "#AEAEB2" }}>contrat{info.count > 1 ? "s" : ""}</div>
            </div>
          </div>
        );
      })}
    </div>
  )}
</Card>
</div>
);
}

// === SECTOR DETAIL VIEW ===
if (sel) {
var isTalc = selSource === "TALC";
var jData = isTalc ? JACHERE_TALC[sel] : JACHERE[sel];
var s = (isTalc ? statsTalc : stats).find(function(x) { return x.name === sel; });
var sorted = jData.communes.slice().sort(function(a, b) {
var ac = isTalc ? getTalcC(a, jData.dept, month) : getC(a, jData.dept, month);
var bc = isTalc ? getTalcC(b, jData.dept, month) : getC(b, jData.dept, month);
if (sortBy === "c") return bc - ac;
if (sortBy === "p") return b.p - a.p;
return (bc / (b.p || 1)) - (ac / (a.p || 1));
});
return (
<div>
<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
<Btn v="ghost" onClick={function() { setSel(null); setSelSource(null); }}>← Retour</Btn>
<h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{sel}</h2>
{isTalc ? <Badge color="#FF9F0A">TALC</Badge> : <Badge color={OP_COLORS.Free}>Stratygo</Badge>}
{!isTalc && DEPT_ZONES[jData.dept] && DEPT_ZONES[jData.dept].b && <Badge color={OP_COLORS.Bouygues}>Bouygues</Badge>}
<div style={{ marginLeft: "auto" }}><Sel value={month} onChange={setMonth} placeholder="Tous les mois" options={MONTHS_ORDER.map(function(m) { return { value: m, label: MONTHS_LABELS[m] }; })} style={{ minWidth: 140 }} /></div>
</div>
<div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
<StatCard label="Communes" value={jData.communes.length} color="#0071E3" />
<StatCard label="Prises" value={s.tp.toLocaleString("fr-FR")} color="#1D1D1F" />
<StatCard label="Contrats" value={s.tc} color="#34C759" />
<StatCard label="Taux" value={s.taux.toFixed(2) + "%"} color={s.taux > 0.5 ? "#34C759" : "#FF9F0A"} />
</div>
<Card>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
<h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, letterSpacing: -0.3, color: "#1D1D1F" }}>Communes</h3>
<div style={{ display: "flex", gap: 6 }}>
<Btn s="sm" v={sortBy === "c" ? "primary" : "secondary"} onClick={function() { setSortBy("c"); }}>Contrats</Btn>
<Btn s="sm" v={sortBy === "p" ? "primary" : "secondary"} onClick={function() { setSortBy("p"); }}>Prises</Btn>
<Btn s="sm" v={sortBy === "t" ? "primary" : "secondary"} onClick={function() { setSortBy("t"); }}>Taux</Btn>
</div>
</div>
{sorted.map(function(c, i) {
var cc = isTalc ? getTalcC(c, jData.dept, month) : getC(c, jData.dept, month);
var t = c.p ? (cc / c.p * 100) : 0;
var col = t > 0.8 ? "#34C759" : t > 0.3 ? "#FF9F0A" : cc === 0 ? "rgba(0,0,0,0.08)" : "#FF3B30";
return (
<div key={c.v} onClick={function() { setCommuneView({ commune: c, dept: jData.dept, isTalc: isTalc }); setRueSearch(""); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: i % 2 ? "#FAFAFA" : "#fff", borderRadius: 8, cursor: "pointer" }}>
<div style={{ width: 24, textAlign: "center", fontSize: 12, fontWeight: 700, color: "#AEAEB2" }}>{i + 1}</div>
<div style={{ flex: 1 }}>
<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
<span style={{ fontSize: 13, fontWeight: 600 }}>{c.v}</span>
<Badge color={c.z === "H" ? "#FF3B30" : "#0071E3"}>{c.z === "H" ? "Haute" : "Std"}</Badge>
</div>
<div style={{ marginTop: 4, height: 5, borderRadius: 3, background: "#F5F5F7", overflow: "hidden" }}>
<div style={{ width: Math.min(t * 50, 100) + "%", height: "100%", borderRadius: 3, background: col }} />
</div>
</div>
<div style={{ textAlign: "right", minWidth: 70 }}>
<div style={{ fontSize: 14, fontWeight: 800, color: cc ? "#1D1D1F" : "#D1D1D6" }}>{cc}</div>
<div style={{ fontSize: 10, color: "#AEAEB2" }}>{c.p.toLocaleString("fr-FR")} pr.</div>
</div>
<div style={{ minWidth: 45, textAlign: "right" }}>
<span style={{ fontSize: 12, fontWeight: 700, color: col }}>{t.toFixed(2)}%</span>
</div>
</div>
);
})}
</Card>
</div>
);
}

// === OVERVIEW ===
return (
<div>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
<div>
<h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: -0.4, color: "#1D1D1F" }}>Secteurs</h2>
<p style={{ margin: "4px 0 0", fontSize: 13, color: "#6E6E73" }}>{stats.length} secteurs Stratygo · {statsTalc.length} secteurs TALC</p>
</div>
<Sel value={month} onChange={setMonth} placeholder="Tous les mois" options={MONTHS_ORDER.map(function(m) { return { value: m, label: MONTHS_LABELS[m] }; })} style={{ minWidth: 150 }} />
</div>
<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
{stats.concat(statsTalc).sort(function(a, b) { return b.tc - a.tc; }).map(function(j) {
var isTalcCard = j.source === "TALC";
var col = j.taux > 0.5 ? "#34C759" : j.taux > 0.2 ? "#FF9F0A" : "#FF3B30";
return (
<Card key={j.name} onClick={function() { setSel(j.name); setSelSource(j.source); }} style={{ cursor: "pointer", padding: 18, border: "2px solid " + (isTalcCard ? "#FF9F0A30" : "transparent") }}>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
<div>
<div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.3, color: "#1D1D1F" }}>{j.name}</div>
<div style={{ fontSize: 12, color: "#AEAEB2", marginTop: 2 }}>{j.communes.length} com. · {j.tp.toLocaleString("fr-FR")} prises</div>
</div>
<div style={{ display: "flex", gap: 4, alignItems: "center" }}>
{isTalcCard ? <Badge color="#FF9F0A">TALC</Badge> : <Badge color="#6E6E73">Stratygo</Badge>}
<Badge color={col}>{j.taux.toFixed(2)}%</Badge>
</div>
</div>
<div style={{ height: 8, borderRadius: 4, background: "#F5F5F7", overflow: "hidden", marginBottom: 8 }}>
<div style={{ width: Math.min(j.taux * 50, 100) + "%", height: "100%", borderRadius: 4, background: col }} />
</div>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
<span style={{ fontSize: 22, fontWeight: 800 }}>{j.tc}</span>
<div style={{ display: "flex", gap: 4 }}>
{!isTalcCard && <Badge color={OP_COLORS.Free}>Free</Badge>}
{!isTalcCard && DEPT_ZONES[j.dept] && DEPT_ZONES[j.dept].b && <Badge color={OP_COLORS.Bouygues}>B</Badge>}
</div>
</div>
</Card>
);
})}
</div>
</div>
);
}

// IMPORT
// CLOCHE TAB
function ClocheTab({ team, contracts }) {
  // Calculer les dates "veille" : J-1, et si lundi → vendredi + samedi
  var today = new Date();
  var dayOfWeek = today.getDay(); // 0=dim, 1=lun, 2=mar...

  var veilleDate = [];
  if (dayOfWeek === 1) {
    // Lundi → vendredi + samedi
    var fri = new Date(today); fri.setDate(today.getDate() - 3);
    var sat = new Date(today); sat.setDate(today.getDate() - 2);
    veilleDate.push(fri.toISOString().split("T")[0]);
    veilleDate.push(sat.toISOString().split("T")[0]);
  } else if (dayOfWeek === 0) {
    // Dimanche → vendredi + samedi (preview du lundi matin)
    var fri = new Date(today); fri.setDate(today.getDate() - 2);
    var sat = new Date(today); sat.setDate(today.getDate() - 1);
    veilleDate.push(fri.toISOString().split("T")[0]);
    veilleDate.push(sat.toISOString().split("T")[0]);
  } else {
    var yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    veilleDate.push(yesterday.toISOString().split("T")[0]);
  }

  var dateLabel = veilleDate.length === 2
    ? new Date(veilleDate[0] + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
      + " & " + new Date(veilleDate[1] + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
    : new Date(veilleDate[0] + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  // Contrats avec RIB validé uniquement (blancs = status vide → exclus)
  var VALID_FOR_CLOCHE = { "En attente RDV":1, "RDV pris":1, "RDV pris J+7":1, "Branché":1, "Branché VRF":1, "Valide":1 };

  // Compter les contrats par commercial sur les dates veille
  var counts = {};
  team.filter(function(m) { return m.active; }).forEach(function(m) { counts[m.name] = 0; });
  contracts.forEach(function(c) {
    if (veilleDate.indexOf(c.date) >= 0 && counts[c.commercial] !== undefined && VALID_FOR_CLOCHE[c.status]) {
      counts[c.commercial]++;
    }
  });

  // Trier par nombre décroissant
  var sorted = Object.entries(counts).sort(function(a, b) { return b[1] - a[1]; });

  var totalContrats = sorted.reduce(function(s, e) { return s + e[1]; }, 0);
  var cloches = sorted.filter(function(e) { return e[1] >= 3; }).length;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, letterSpacing: -0.6, color: "#1D1D1F" }}>Cloche</h2>
        <div style={{ fontSize: 13, color: "#6E6E73", textTransform: "capitalize" }}>{dateLabel}</div>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <Card style={{ flex: 1, minWidth: 120, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#AEAEB2", fontWeight: 500, letterSpacing: 0.5, marginBottom: 6 }}>TOTAL CONTRATS</div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1, color: "#1D1D1F" }}>{totalContrats}</div>
        </Card>
        <Card style={{ flex: 1, minWidth: 120, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#AEAEB2", fontWeight: 500, letterSpacing: 0.5, marginBottom: 6 }}>CLOCHES</div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1, color: "#FF9F0A" }}>{cloches}</div>
        </Card>
        <Card style={{ flex: 1, minWidth: 120, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#AEAEB2", fontWeight: 500, letterSpacing: 0.5, marginBottom: 6 }}>MOY / COMMERCIAL</div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1, color: "#0071E3" }}>
            {sorted.length > 0 ? (totalContrats / sorted.length).toFixed(1) : "0"}
          </div>
        </Card>
      </div>

      {/* Liste commerciaux */}
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {sorted.map(function(entry, i) {
            var name = entry[0];
            var count = entry[1];
            var hasCloche = count >= 3;
            var bg = i % 2 === 0 ? "#fff" : "#FAFAFA";
            var countColor = count === 0 ? "#D1D1D6" : hasCloche ? "#34C759" : "#1D1D1F";

            return (
              <div key={name} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 18px", background: bg,
                borderTop: i === 0 ? "none" : "1px solid #F3F4F6",
                borderRadius: i === 0 ? "14px 14px 0 0" : i === sorted.length - 1 ? "0 0 14px 14px" : 0
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, background: hasCloche ? "#E8F8ED" : "#F5F5F7",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 700, fontSize: 13, color: hasCloche ? "#1C7A3A" : "#AEAEB2"
                  }}>
                    {name.split(" ").map(function(n) { return n[0]; }).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <span style={{ fontWeight: 500, fontSize: 14, color: "#1D1D1F", letterSpacing: -0.2 }}>{name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {hasCloche && <span style={{ fontSize: 18 }}>🔔</span>}
                  <span style={{ fontWeight: 600, fontSize: 20, letterSpacing: -0.5, color: countColor, minWidth: 28, textAlign: "right" }}>
                    {count}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// OBJECTIFS TAB
function ObjectifsTab({ team, contracts, objectives, saveObjectives }) {
  function getWeekKey(date) {
    var d = new Date(date); d.setHours(0,0,0,0); d.setDate(d.getDate() - d.getDay() + 1);
    return d.toISOString().split("T")[0];
  }
  function getWeekLabel(weekKey) {
    var start = new Date(weekKey + "T12:00:00");
    var end = new Date(start); end.setDate(end.getDate() + 6);
    var fmt = function(d) { return d.toLocaleDateString("fr-FR", { day:"numeric", month:"short" }); };
    return fmt(start) + " – " + fmt(end);
  }
  function getWeekDates(weekKey) {
    var start = new Date(weekKey + "T12:00:00"), dates = [];
    for (var i = 0; i < 7; i++) { var d = new Date(start); d.setDate(d.getDate()+i); dates.push(d.toISOString().split("T")[0]); }
    return dates;
  }

  var today = new Date();
  var currentWeek = getWeekKey(today.toISOString().split("T")[0]);
  var weeksFromContracts = Array.from(new Set(contracts.map(function(c){ return getWeekKey(c.date); })));
  var futureWeeks = [];
  for (var i = 0; i <= 4; i++) { var d2 = new Date(today); d2.setDate(d2.getDate()+i*7); futureWeeks.push(getWeekKey(d2.toISOString().split("T")[0])); }
  var allWeeks = Array.from(new Set(weeksFromContracts.concat(futureWeeks))).sort(function(a,b){ return b.localeCompare(a); });

  var [selectedWeek, setSelectedWeek] = useState(currentWeek);
  var [editMode, setEditMode] = useState(false);
  var [draft, setDraft] = useState({});

  var weekIdx = allWeeks.indexOf(selectedWeek);
  var activeTeam = team.filter(function(m){ return m.active; });
  var weekDates = getWeekDates(selectedWeek);
  var weekContracts = contracts.filter(function(c){ return weekDates.indexOf(c.date) >= 0; });
  var weekObjectives = objectives[selectedWeek] || {};
  var isPast = selectedWeek < currentWeek;
  var isCurrent = selectedWeek === currentWeek;

  var realise = {};
  activeTeam.forEach(function(m){ realise[m.name] = 0; });
  weekContracts.forEach(function(c){ if (realise[c.commercial] !== undefined) realise[c.commercial]++; });

  var totalObjectif = activeTeam.reduce(function(s,m){ return s + (weekObjectives[m.name]||0); }, 0);
  var totalRealise  = activeTeam.reduce(function(s,m){ return s + (realise[m.name]||0); }, 0);
  var nbAtteints = activeTeam.filter(function(m){ var obj=weekObjectives[m.name]||0; return obj>0 && (realise[m.name]||0)>=obj; }).length;
  var nbAvecObj  = activeTeam.filter(function(m){ return (weekObjectives[m.name]||0)>0; }).length;

  var pct = totalObjectif > 0 ? Math.min(100, Math.round(totalRealise/totalObjectif*100)) : 0;
  var pctColor = pct>=100?"#34C759":pct>=70?"#FF9F0A":"#FF3B30";

  function startEdit() {
    var d = {}; activeTeam.forEach(function(m){ d[m.name]=weekObjectives[m.name]||0; });
    setDraft(d); setEditMode(true);
  }
  function saveWeek() {
    var updated = Object.assign({}, objectives); updated[selectedWeek] = Object.assign({}, draft);
    saveObjectives(updated); setEditMode(false);
  }
  function navWeek(dir) { // dir=-1 older, +1 newer
    var ni = weekIdx + dir;
    if (ni >= 0 && ni < allWeeks.length) { setSelectedWeek(allWeeks[ni]); setEditMode(false); }
  }

  var sortedTeam = activeTeam.slice().sort(function(a,b){ return (realise[b.name]||0)-(realise[a.name]||0); });

  var navBtnStyle = function(disabled) { return {
    width:34, height:34, borderRadius:99, border:"1px solid #E5E5EA",
    background: disabled?"#F5F5F7":"#fff", color: disabled?"#D1D1D6":"#1D1D1F",
    fontSize:16, cursor: disabled?"default":"pointer", display:"flex", alignItems:"center", justifyContent:"center",
    fontFamily:"inherit", flexShrink:0
  }; };

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20, flexWrap:"wrap" }}>
        <h2 style={{ margin:0, fontSize:22, fontWeight:800, letterSpacing:-0.6 }}>Objectifs</h2>

        {/* Week navigator */}
        <div style={{ display:"flex", alignItems:"center", gap:8, flex:1, justifyContent:"center" }}>
          <button style={navBtnStyle(weekIdx >= allWeeks.length-1)} onClick={function(){ navWeek(1); }}>←</button>
          <div style={{ textAlign:"center", minWidth:160 }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#1D1D1F" }}>{getWeekLabel(selectedWeek)}</div>
            {isCurrent && <div style={{ fontSize:10, fontWeight:600, color:"#0071E3", textTransform:"uppercase", letterSpacing:0.5, marginTop:1 }}>En cours</div>}
            {isPast   && <div style={{ fontSize:10, fontWeight:600, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.5, marginTop:1 }}>Passée</div>}
          </div>
          <button style={navBtnStyle(weekIdx <= 0)} onClick={function(){ navWeek(-1); }}>→</button>
        </div>

        {/* Actions */}
        {!editMode ? (
          <Btn onClick={startEdit} v="primary" s="sm">{totalObjectif===0?"Fixer les objectifs":"Modifier"}</Btn>
        ) : (
          <div style={{ display:"flex", gap:8 }}>
            <Btn onClick={function(){ setEditMode(false); }} v="secondary" s="sm">Annuler</Btn>
            <Btn onClick={saveWeek} v="primary" s="sm">Enregistrer</Btn>
          </div>
        )}
      </div>

      {/* ── KPI global ── */}
      {totalObjectif > 0 && (
        <Card style={{ marginBottom:20, padding:20 }}>
          <div style={{ display:"flex", alignItems:"flex-start", gap:20, marginBottom:14 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, fontWeight:600, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.5, marginBottom:6 }}>Équipe — objectif semaine</div>
              <div style={{ fontSize:38, fontWeight:800, letterSpacing:-1.5, color:pctColor, lineHeight:1 }}>{pct}%</div>
              <div style={{ fontSize:13, color:"#6E6E73", marginTop:4 }}>{totalRealise} réalisés sur {totalObjectif} attendus</div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8, alignItems:"flex-end" }}>
              <div style={{ textAlign:"center", background: nbAtteints>0?"#E8F8ED":"#F5F5F7", borderRadius:12, padding:"8px 14px" }}>
                <div style={{ fontSize:22, fontWeight:800, color: nbAtteints>0?"#1C7A3A":"#AEAEB2" }}>{nbAtteints}</div>
                <div style={{ fontSize:10, fontWeight:600, color: nbAtteints>0?"#1C7A3A":"#AEAEB2", textTransform:"uppercase", letterSpacing:0.4 }}>Atteints</div>
              </div>
              <div style={{ fontSize:11, color:"#AEAEB2" }}>sur {nbAvecObj} objectifs</div>
            </div>
          </div>
          <div style={{ background:"#F5F5F7", borderRadius:999, height:8, overflow:"hidden" }}>
            <div style={{ width:pct+"%", background:pctColor, height:"100%", borderRadius:999, transition:"width 0.5s" }} />
          </div>
        </Card>
      )}

      {/* ── Cards commerciaux ── */}
      {sortedTeam.length === 0 ? (
        <Card><div style={{ textAlign:"center", padding:40, color:"#AEAEB2" }}>Aucun commercial actif</div></Card>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))", gap:12 }}>
          {sortedTeam.map(function(m) {
            var obj  = editMode ? (draft[m.name]||0) : (weekObjectives[m.name]||0);
            var done = realise[m.name]||0;
            var p    = obj>0 ? Math.min(100, Math.round(done/obj*100)) : 0;
            var col  = obj===0?"#AEAEB2":p>=100?"#34C759":p>=70?"#FF9F0A":"#FF3B30";
            var atteint = obj>0 && done>=obj;
            var initials = m.name.split(" ").map(function(w){ return w[0]; }).slice(0,2).join("").toUpperCase();
            var mCol = ROLE_COLORS[m.role] || "#AEAEB2";

            return (
              <Card key={m.id} style={{ padding:16, display:"flex", flexDirection:"column", gap:12 }}>
                {/* Avatar + nom */}
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:38, height:38, borderRadius:99, background:mCol+"20", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <span style={{ fontSize:12, fontWeight:800, color:mCol }}>{initials}</span>
                  </div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:"#1D1D1F", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{m.name.split(" ")[0]}</div>
                    <div style={{ fontSize:11, color:"#AEAEB2" }}>{m.role}</div>
                  </div>
                </div>

                {/* Réalisé / Objectif */}
                <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between" }}>
                  <div style={{ fontSize:28, fontWeight:800, letterSpacing:-1, color: done>0?col:"#D1D1D6" }}>{done}</div>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontSize:13, color:"#AEAEB2" }}>/ </span>
                    {editMode ? (
                      <input
                        type="number" min="0" value={draft[m.name]||0}
                        onChange={function(e){ var v=parseInt(e.target.value)||0; setDraft(function(prev){ return Object.assign({},prev,{[m.name]:v}); }); }}
                        onClick={function(e){ e.target.select(); }}
                        style={{ width:52, border:"1.5px solid #0071E3", borderRadius:8, padding:"3px 6px", textAlign:"center", fontWeight:700, fontSize:15, fontFamily:"inherit", color:"#1D1D1F" }}
                      />
                    ) : (
                      <span style={{ fontSize:15, fontWeight:700, color: obj===0?"#D1D1D6":"#1D1D1F" }}>{obj===0?"—":obj}</span>
                    )}
                  </div>
                </div>

                {/* Barre + % */}
                {obj>0 ? (
                  <div>
                    <div style={{ background:"#F5F5F7", borderRadius:999, height:5, overflow:"hidden", marginBottom:4 }}>
                      <div style={{ width:p+"%", background:col, height:"100%", borderRadius:999, transition:"width 0.3s" }} />
                    </div>
                    <div style={{ fontSize:11, fontWeight:700, color:col }}>{p}%</div>
                  </div>
                ) : (
                  <div style={{ height:5, background:"#F5F5F7", borderRadius:999 }} />
                )}

                {/* Badge statut */}
                {!editMode && (
                  <div>
                    {obj===0 ? (
                      <span style={{ fontSize:11, color:"#D1D1D6" }}>Pas d'objectif</span>
                    ) : atteint ? (
                      <span style={{ background:"#E8F8ED", color:"#1C7A3A", borderRadius:99, padding:"3px 10px", fontSize:11, fontWeight:700 }}>✓ Atteint</span>
                    ) : isPast ? (
                      <span style={{ background:"#FFEDEC", color:"#FF3B30", borderRadius:99, padding:"3px 10px", fontSize:11, fontWeight:700 }}>✗ Non atteint</span>
                    ) : (
                      <span style={{ background:"#F5F5F7", color:"#6E6E73", borderRadius:99, padding:"3px 10px", fontSize:11, fontWeight:700 }}>En cours</span>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {totalObjectif===0 && !editMode && (
        <div style={{ textAlign:"center", color:"#AEAEB2", marginTop:28, fontSize:13 }}>
          Aucun objectif fixé pour cette semaine.
          <div style={{ marginTop:8 }}><Btn onClick={startEdit} v="primary" s="sm">Fixer les objectifs</Btn></div>
        </div>
      )}
    </div>
  );
}

function ImportTab({ team, saveTeam, contracts, saveContracts }) {
const [drag, setDrag] = useState(false);
const [logs, setLogs] = useState([]);
const [imp, setImp] = useState(false);

function addLog(m, t) { setLogs(function(prev) { return prev.concat([{ m: m, t: t || "info", time: new Date().toLocaleTimeString("fr-FR") }]); }); }

function handleFile(file) {
setImp(true);
setLogs([]);
addLog("Fichier: " + file.name);

(async function() {
try {
if (file.name.match(/.(xlsx|xls|csv)$/i)) {
var XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs");
var data = await file.arrayBuffer();
var wb = XLSX.read(data);
var ws = wb.Sheets[wb.SheetNames[0]];
var rows = XLSX.utils.sheet_to_json(ws);
addLog(rows.length + " lignes");
if (!rows.length) { addLog("Vide", "error"); setImp(false); return; }
var cols = Object.keys(rows[0]).map(function(c) { return c.toLowerCase(); });
var isTeam = cols.some(function(c) { return c.indexOf("role") >= 0 || c.indexOf("permis") >= 0; });
var isContract = cols.some(function(c) { return c.indexOf("heure") >= 0 || c.indexOf("statut") >= 0; });


  if (isTeam) {
    addLog("Type: equipe", "success");
    var nm = rows.map(function(r, i) {
      var keys = Object.keys(r);
      function g(ks) { for (var k of ks) { var found = keys.find(function(x) { return x.toLowerCase().indexOf(k) >= 0; }); if (found && r[found]) return String(r[found]).trim(); } return ""; }
      var name = g(["nom", "name", "prenom", "commercial"]);
      if (!name) return null;
      var rl = ROLES.find(function(x) { return g(["role", "poste"]).toLowerCase().indexOf(x.toLowerCase()) >= 0; }) || "Debutant";
      var op = OPERATORS.find(function(x) { return g(["operateur", "produit"]).toLowerCase().indexOf(x.toLowerCase()) >= 0; }) || "Bouygues";
      return { id: Date.now() + i, name: name, role: rl, operators: [op], permis: ["oui", "yes", "1", "true", "x"].indexOf(g(["permis"]).toLowerCase()) >= 0, voiture: ["oui", "yes", "1", "true", "x"].indexOf(g(["voiture"]).toLowerCase()) >= 0, active: true };
    }).filter(Boolean);
    if (nm.length) { saveTeam(nm); addLog(nm.length + " importes!", "success"); } else { addLog("Aucun valide", "error"); }
  } else if (isContract) {
    addLog("Type: contrats", "success");
    var nc = rows.map(function(r, i) {
      var keys = Object.keys(r);
      function g(ks) { for (var k of ks) { var found = keys.find(function(x) { return x.toLowerCase().indexOf(k) >= 0; }); if (found && r[found]) return String(r[found]).trim(); } return ""; }
      return { id: "i-" + Date.now() + "-" + i, commercial: g(["commercial", "nom", "vendeur"]), date: g(["date"]), heure: g(["heure"]), ville: g(["ville"]), rue: g(["rue", "adresse"]), operator: OPERATORS.find(function(x) { return g(["operateur"]).toLowerCase().indexOf(x.toLowerCase()) >= 0; }) || "Free", type: "Fibre", status: g(["statut", "status"]) || "Valide" };
    }).filter(function(c) { return c.commercial && c.date; });
    if (nc.length) { saveContracts(contracts.concat(nc)); addLog(nc.length + " contrats!", "success"); } else { addLog("Aucun valide", "error"); }
  } else {
    addLog("Type non reconnu", "error");
  }
} else { addLog("Format non supporte", "error"); }
} catch (e) { addLog(e.message, "error"); }
setImp(false);
})();
}

return (

<div style={{ maxWidth: 700 }}>
<h2 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 600, letterSpacing: -0.4, color: "#1D1D1F" }}>Import</h2>
<p style={{ margin: "0 0 24px", fontSize: 13, color: "#6E6E73" }}>Glissez vos fichiers Excel ou CSV.</p>
<div
onDragOver={function(e) { e.preventDefault(); setDrag(true); }}
onDragLeave={function() { setDrag(false); }}
onDrop={function(e) { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
style={{ border: "2px dashed " + (drag ? "#0071E3" : "#D1D1D6"), borderRadius: 16, padding: 48, textAlign: "center", background: drag ? "#EFF6FF" : "#FAFAFA", cursor: "pointer", marginBottom: 24 }}
onClick={function() { document.getElementById("fi").click(); }}
>
<div style={{ fontSize: 36, marginBottom: 8 }}>+</div>
<div style={{ fontSize: 14, fontWeight: 600 }}>Glissez ici</div>
<div style={{ fontSize: 12, color: "#AEAEB2", marginTop: 4 }}>.xlsx, .csv</div>
<input id="fi" type="file" accept=".xlsx,.xls,.csv" onChange={function(e) { if (e.target.files[0]) handleFile(e.target.files[0]); }} style={{ display: "none" }} />
</div>
{logs.length > 0 && (
<Card style={{ background: "#1D1D1F", color: "rgba(0,0,0,0.08)" }}>
<div style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 1.8 }}>
{logs.map(function(l, i) {
return <div key={i} style={{ color: l.t === "error" ? "#F87171" : l.t === "success" ? "#34D399" : "#AEAEB2" }}>[{l.time}] {l.m}</div>;
})}
</div>
</Card>
)}
</div>
);
}

// CARNET
function CarnetTab() {
  var [search, setSearch] = useState("");
  var rows = carnetData;

  var filtered = useMemo(function() {
    if (!search.trim()) return rows;
    var q = search.toLowerCase();
    return rows.filter(function(r) {
      return Object.values(r).some(function(v) { return String(v).toLowerCase().includes(q); });
    });
  }, [rows, search]);

  var headers = rows.length > 0 ? Object.keys(rows[0]) : [];

  var ROW_COLORS = {
    "inscription ok": "gold",
    "inscription ok /postprod": "OrangeRed",
    "vente validée": "WhiteSmoke",
    "vente validée j+7": "lightgrey",
    "connexion ok": "lightgreen",
    "connexion ok vrf": "LimeGreen",
    "résilié": "firebrick",
    "vente abandonée": "SlateGrey",
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Carnet de Commandes <span style={{ fontSize: 14, fontWeight: 400, color: "#6E6E73" }}>{filtered.length} / {rows.length}</span></div>
        <input
          value={search}
          onChange={function(e) { setSearch(e.target.value); }}
          placeholder="Rechercher..."
          style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #D2D2D7", fontSize: 13, width: 220, outline: "none" }}
        />
      </div>
      <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid #E5E5EA" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#F5F5F7" }}>
              {headers.map(function(h) {
                return <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "#3A3A3C", whiteSpace: "nowrap", borderBottom: "1px solid #E5E5EA" }}>{h}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={headers.length} style={{ padding: 32, textAlign: "center", color: "#AEAEB2" }}>Aucun résultat</td></tr>
            )}
            {filtered.map(function(row, i) {
              var status = row["etat_commande"] || "";
              var bg = ROW_COLORS[status.toLowerCase()] || "#fff";
              return (
                <tr key={i} style={{ background: bg }}>
                  {headers.map(function(h) {
                    return <td key={h} style={{ padding: "6px 10px", borderBottom: "1px solid #F2F2F7", whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{row[h] || ""}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}