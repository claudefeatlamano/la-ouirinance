import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import carnetData from "./data.json";

const STORAGE_KEYS = { team: "agency-team-v3", cars: "agency-cars-v3", contracts: "agency-contracts-v3", dailyPlan: "agency-daily-plan-v3", objectives: "agency-objectives-v3", groups: "agency-groups-v1" };

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

const store = {
get: async (key) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
set: async (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.error(e); } },
delete: async (key) => { try { localStorage.removeItem(key); } catch (e) {} },
};

const ROLES = ["Manager", "Assistant Manager", "Formateur", "Confirme", "Debutant"];
const ROLE_LABELS = { Manager: "Manager", "Assistant Manager": "Assist. Manager", Formateur: "Formateur", Confirme: "Confirme", Debutant: "Debutant" };
const ROLE_COLORS = { Manager: "#FF9F0A", "Assistant Manager": "#D4740E", Formateur: "#0071E3", Confirme: "#34C759", Debutant: "#AEAEB2" };
const OPERATORS = ["Bouygues", "Free"];
const OP_COLORS = { Bouygues: "#003DA5", Free: "#CD1E25" };

const JACHERE = {
"NANTES 44": { dept: "44", communes: [
{ v: "VERTOU", p: 11282, z: "S", c: 41 }, { v: "VALLET", p: 4250, z: "H", c: 29 }, { v: "MACHECOUL", p: 3733, z: "H", c: 28 },
{ v: "ST PHILBERT", p: 3575, z: "S", c: 13 }, { v: "CLISSON", p: 3506, z: "H", c: 14 }, { v: "LOROUX BOTTEREAU", p: 3336, z: "S", c: 12 },
{ v: "ST JULIEN CONCELLES", p: 3046, z: "S", c: 7 }, { v: "DIVATTE SUR LOIRE", p: 2971, z: "S", c: 8 },
{ v: "ST ETIENNE MONTLUC", p: 2965, z: "S", c: 18 }, { v: "CHEVROLIERE", p: 2861, z: "H", c: 24 },
{ v: "STE PAZANNE", p: 2770, z: "S", c: 12 }, { v: "PONT ST MARTIN", p: 2735, z: "H", c: 12 },
{ v: "HAUTE GOULAINE", p: 2724, z: "S", c: 10 }, { v: "AIGREFEUILLE", p: 2362, z: "H", c: 9 },
{ v: "BOUAYE", p: 2349, z: "S", c: 7 }, { v: "LE PELLERIN", p: 2200, z: "S", c: 5 },
]},
"ST NAZAIRE 44": { dept: "44", communes: [
{ v: "SAINT NAZAIRE", p: 38930, z: "S", c: 315 }, { v: "BAULE ESCOUBLAC", p: 22865, z: "H", c: 8 },
{ v: "PORNIC", p: 14126, z: "H", c: 20 }, { v: "PORNICHET", p: 11866, z: "H", c: 7 },
{ v: "ST BREVIN", p: 10348, z: "H", c: 13 }, { v: "GUERANDE", p: 9138, z: "H", c: 27 },
{ v: "PONTCHATEAU", p: 5696, z: "H", c: 34 }, { v: "POULIGUEN", p: 5481, z: "H", c: 10 },
{ v: "CROISIC", p: 5005, z: "H", c: 16 }, { v: "SAVENAY", p: 4027, z: "S", c: 20 },
]},
"RENNES 35": { dept: "35", communes: [
{ v: "CESSON SEVIGNE", p: 11701, z: "H", c: 57 }, { v: "BRUZ", p: 10477, z: "H", c: 80 },
{ v: "BETTON", p: 5443, z: "S", c: 7 }, { v: "ST GREGOIRE", p: 5292, z: "H", c: 31 },
{ v: "PACE", p: 5287, z: "H", c: 10 }, { v: "CHARTRES BRETAGNE", p: 5149, z: "H", c: 30 },
{ v: "NOYAL CHATILLON", p: 4694, z: "H", c: 61 }, { v: "VERN SUR SEICHE", p: 4358, z: "S", c: 6 },
{ v: "RHEU", p: 4357, z: "H", c: 14 }, { v: "MORDELLES", p: 4262, z: "H", c: 13 },
{ v: "LIFFRE", p: 4247, z: "H", c: 17 }, { v: "CHATEAUGIRON", p: 3463, z: "H", c: 17 },
]},
"FONTENAY 85": { dept: "85", communes: [
{ v: "FONTENAY LE COMTE", p: 8586, z: "H", c: 81 }, { v: "LUCON", p: 6089, z: "H", c: 98 },
{ v: "POUZAUGES", p: 3188, z: "H", c: 23 }, { v: "SEVREMONT", p: 3093, z: "H", c: 29 },
{ v: "BENET", p: 2094, z: "H", c: 9 }, { v: "STE HERMINE", p: 1958, z: "H", c: 24 },
{ v: "CHATAIGNERAIE", p: 1684, z: "H", c: 28 }, { v: "ST MICHEL L HERM", p: 1649, z: "H", c: 17 },
]},
"ROCHE SUR YON 85": { dept: "85", communes: [
{ v: "ROCHE SUR YON", p: 30092, z: "H", c: 381 }, { v: "MONTAIGU", p: 9492, z: "H", c: 54 },
{ v: "HERBIERS", p: 8901, z: "H", c: 46 }, { v: "AIZENAY", p: 4514, z: "S", c: 9 },
{ v: "CHANTONNAY", p: 4240, z: "H", c: 27 }, { v: "MORTAGNE SUR SEVRE", p: 3052, z: "S", c: 26 },
{ v: "ESSARTS EN BOCAGE", p: 3031, z: "H", c: 19 }, { v: "CHANVERRIE", p: 2568, z: "H", c: 15 },
]},
"SABLES OLONNE 85": { dept: "85", communes: [
{ v: "SABLES D OLONNE", p: 41454, z: "H", c: 200 }, { v: "ST HILAIRE DE RIEZ", p: 16759, z: "H", c: 25 },
{ v: "ST JEAN DE MONTS", p: 14392, z: "H", c: 10 }, { v: "CHALLANS", p: 13373, z: "H", c: 105 },
{ v: "ST GILLES CROIX DE VIE", p: 9822, z: "H", c: 36 }, { v: "BRETIGNOLLES", p: 7640, z: "H", c: 7 },
{ v: "NOIRMOUTIER", p: 7196, z: "H", c: 5 }, { v: "TALMONT ST HILAIRE", p: 6773, z: "H", c: 16 },
]},
"ROYAN 17": { dept: "17", communes: [
{ v: "ROYAN", p: 20600, z: "H", c: 34 }, { v: "ROCHEFORT", p: 15303, z: "H", c: 9 },
{ v: "ST GEORGES DIDONNE", p: 7988, z: "H", c: 0 }, { v: "ST PIERRE OLERON", p: 7553, z: "H", c: 0 },
{ v: "VAUX SUR MER", p: 6591, z: "H", c: 0 }, { v: "TREMBLADE", p: 5103, z: "H", c: 0 },
]},
"LA ROCHELLE 17": { dept: "17", communes: [
{ v: "LA ROCHELLE", p: 50364, z: "H", c: 118 }, { v: "AYTRE", p: 5433, z: "H", c: 38 },
{ v: "CHATELAILLON", p: 5176, z: "H", c: 0 }, { v: "LAGORD", p: 3821, z: "H", c: 2 },
{ v: "MARANS", p: 2440, z: "H", c: 13 },
]},
"BRESSUIRE 79": { dept: "79", communes: [
{ v: "BRESSUIRE", p: 9571, z: "H", c: 23 }, { v: "THOUARS", p: 7683, z: "H", c: 15 },
{ v: "MAULEON", p: 3578, z: "H", c: 1 }, { v: "NUEIL LES AUBIERS", p: 2592, z: "H", c: 12 },
{ v: "MONCOUTANT", p: 2409, z: "H", c: 10 }, { v: "CERIZAY", p: 2242, z: "H", c: 18 },
{ v: "COURLAY", p: 1068, z: "H", c: 12 },
]},
"NIORT 79": { dept: "79", communes: [
{ v: "NIORT", p: 33450, z: "H", c: 84 }, { v: "CHAURAY", p: 3450, z: "H", c: 1 },
{ v: "ST MAIXENT", p: 3112, z: "H", c: 7 }, { v: "MELLE", p: 2885, z: "H", c: 0 },
{ v: "CRECHE", p: 2768, z: "H", c: 1 },
]},
};

const DEPT_ZONES = {
"44": { b: true, f: "partial", l: "Loire-Atlantique" },
"35": { b: true, f: "partial", l: "Ille-et-Vilaine" },
"85": { b: true, f: true, l: "Vendee" },
"79": { b: true, f: true, l: "Deux-Sevres" },
"17": { b: false, f: true, l: "Charente-Maritime" },
"49": { b: true, f: false, l: "Maine-et-Loire" },
};

const DEMO_TEAM = [
{ id: 1, name: "Djany Legrand", role: "Manager", operators: ["Free"], permis: true, voiture: true, active: true },
{ id: 2, name: "Leo Merde", role: "Confirme", operators: ["Free"], permis: true, voiture: true, active: true },
{ id: 3, name: "Stephane Legrand", role: "Confirme", operators: ["Free"], permis: true, voiture: true, active: true },
{ id: 4, name: "Sandra Pereira", role: "Confirme", operators: ["Free"], permis: true, voiture: false, active: true },
{ id: 5, name: "William Goujon", role: "Confirme", operators: ["Free"], permis: true, voiture: true, active: true },
{ id: 6, name: "Yannis Aboulfatah", role: "Confirme", operators: ["Free"], permis: true, voiture: false, active: true },
{ id: 7, name: "Lyna Belkessa", role: "Confirme", operators: ["Free"], permis: false, voiture: false, active: true },
{ id: 8, name: "Ali Atf", role: "Confirme", operators: ["Free"], permis: true, voiture: true, active: true },
{ id: 9, name: "Victor Moize", role: "Confirme", operators: ["Free"], permis: true, voiture: false, active: true },
{ id: 10, name: "Momed Ali", role: "Confirme", operators: ["Free"], permis: true, voiture: false, active: true },
{ id: 11, name: "Pablo Grasset", role: "Confirme", operators: ["Free"], permis: true, voiture: false, active: true },
{ id: 12, name: "Hamid Atroune", role: "Debutant", operators: ["Free"], permis: true, voiture: false, active: true },
{ id: 13, name: "Cheick Ouedraogo", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true },
{ id: 14, name: "Mohamed Mehdi Larech", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true },
{ id: 15, name: "Omar Mbengue", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true },
{ id: 16, name: "Melodie Mendousse", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true },
{ id: 17, name: "Ronan Kombo", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true },
{ id: 18, name: "Abdellah Cheikh", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true },
{ id: 19, name: "Paul Geriltault", role: "Debutant", operators: ["Free"], permis: true, voiture: false, active: true },
{ id: 20, name: "Abdel Nouar", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true },
{ id: 21, name: "Ouissem Ouirini", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true },
{ id: 22, name: "Titouan Salaun", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true },
{ id: 23, name: "Nora Wahid", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true },
{ id: 24, name: "Eloise Meillerais", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true },
{ id: 25, name: "Come Audonnet", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true },
{ id: 26, name: "Ilhan Kocak", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true },
{ id: 27, name: "Ines Ouirini", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true },
{ id: 28, name: "Shana David", role: "Debutant", operators: ["Free"], permis: false, voiture: false, active: true },
{ id: 29, name: "Adam El Jazouli", role: "Confirme", operators: ["Free"], permis: false, voiture: false, active: true },
];

const DEMO_CARS = [
{ id: 1, name: "Voiture 1 - Clio", seats: 5, owner: "Agence" },
{ id: 2, name: "Voiture 2 - 208", seats: 5, owner: "Agence" },
{ id: 3, name: "Voiture 3 - C3", seats: 5, owner: "Agence" },
{ id: 4, name: "Voiture 4 - Polo", seats: 5, owner: "Agence" },
{ id: 5, name: "Voiture 5 - Ibiza", seats: 5, owner: "Agence" },
{ id: 6, name: "Voiture 6 - Corsa", seats: 5, owner: "Agence" },
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
  });
  // Manual overrides where system login doesn't match the naming pattern
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
(async function() {
// Nettoyer les anciennes clés v1/v2
var oldKeys = ["agency-team-v1","agency-cars-v1","agency-contracts-v1","agency-daily-plan-v1","agency-objectives-v1","agency-team-v2","agency-cars-v2","agency-contracts-v2","agency-daily-plan-v2","agency-objectives-v2"];
for (var k of oldKeys) { try { await store.delete(k); } catch(e) {} }

// Charger ou initialiser avec données propres
setTeam(await store.get(STORAGE_KEYS.team) || DEMO_TEAM);
setCars(await store.get(STORAGE_KEYS.cars) || DEMO_CARS);
// Les contrats : partir toujours de DEMO_CONTRACTS + appliquer les résolutions VTA sauvegardées
var savedResolutions = await store.get(STORAGE_KEYS.contracts) || {};
// savedResolutions est un dict {id -> {commercial, vtaResolved}} pour les contrats modifiés
var mergedContracts = DEMO_CONTRACTS.map(function(c) {
  var saved = savedResolutions[c.id];
  return saved ? Object.assign({}, c, saved) : c;
});
setContracts(mergedContracts);
setDailyPlan(await store.get(STORAGE_KEYS.dailyPlan) || null);
setObjectives(await store.get(STORAGE_KEYS.objectives) || {});
setGroups(await store.get(STORAGE_KEYS.groups) || []);
setLoading(false);
})();
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
    {tab === "dashboard" && <DashboardTab team={team} contracts={contracts} dailyPlan={dailyPlan} lastSync={lastSync} scraperStatus={scraperStatus} />}
    {tab === "team" && <TeamTab team={team} saveTeam={saveTeam} contracts={contracts} groups={groups} saveGroups={saveGroups} />}
    {tab === "cars" && <CarsTab team={team} cars={cars} saveCars={saveCars} dailyPlan={dailyPlan} saveDailyPlan={saveDailyPlan} />}
    {tab === "contracts" && <ContractsTab contracts={contracts} team={team} dailyPlan={dailyPlan} saveContracts={saveContracts} />}
    {tab === "map" && <MapTab dailyPlan={dailyPlan} team={team} cars={cars} />}
    {tab === "objectifs" && <ObjectifsTab team={team} contracts={contracts} objectives={objectives} saveObjectives={saveObjectives} />}
    {tab === "cloche" && <ClocheTab team={team} contracts={contracts} />}
    {tab === "import" && <ImportTab team={team} saveTeam={saveTeam} contracts={contracts} saveContracts={saveContracts} />}
    {tab === "carnet" && <CarnetTab />}
  </main>
</div>
);
}

// DASHBOARD
function DashboardTab({ team, contracts, dailyPlan, lastSync, scraperStatus }) {
var today = new Date().toISOString().split("T")[0];
var yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
var todayC = contracts.filter(function(c) { return c.date === today; });
var yesterdayC = contracts.filter(function(c) { return c.date === yesterday; });
var weekC = contracts.filter(function(c) { return (new Date() - new Date(c.date)) / 86400000 <= 7; });

var yBy = {};
yesterdayC.forEach(function(c) { yBy[c.commercial] = (yBy[c.commercial] || 0) + 1; });
var wBy = {};
weekC.forEach(function(c) { wBy[c.commercial] = (wBy[c.commercial] || 0) + 1; });
var ranking = Object.entries(wBy).sort(function(a, b) { return b[1] - a[1]; });
var medals = ["1er", "2e", "3e"];

return (
<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
<StatCard label="Aujourd'hui" value={todayC.length} color="#0071E3" />
<StatCard label="Hier" value={yesterdayC.length} color="#34C759" sub={yesterdayC.filter(function(c) { return c.status === "Valide"; }).length + " valides"} />
<StatCard label="Semaine" value={weekC.length} color="#FF9F0A" />
<StatCard label="Effectif" value={team.filter(function(m) { return m.active && m.role !== "Manager"; }).length} color="#1D1D1F" />
</div>
<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
<Card>
<h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600, color: "#1D1D1F", letterSpacing: -0.3 }}>Contrats hier</h3>
{Object.entries(yBy).sort(function(a, b) { return b[1] - a[1]; }).map(function(entry) {
return (
<div key={entry[0]} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
<div style={{ width: 30, height: 30, borderRadius: 8, background: "#F5F5F7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: "#6E6E73" }}>{entry[0][0]}</div>
<div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#1D1D1F", letterSpacing: -0.2 }}>{entry[0]}</div>
<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
<div style={{ height: 4, borderRadius: 99, background: "#34C75940", overflow: "hidden", width: Math.max(24, entry[1] * 28) }}><div style={{ height: "100%", width: "100%", background: "#34C759", borderRadius: 99 }} /></div>
<span style={{ fontSize: 14, fontWeight: 600, color: "#1D1D1F", minWidth: 18, textAlign: "right" }}>{entry[1]}</span>
</div>
</div>
);
})}
{Object.keys(yBy).length === 0 && <p style={{ color: "#AEAEB2", fontSize: 13, fontWeight: 400 }}>Aucun contrat hier</p>}
</Card>
<Card>
<h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600, color: "#1D1D1F", letterSpacing: -0.3 }}>Classement semaine</h3>
{ranking.slice(0, 8).map(function(entry, i) {
return (
<div key={entry[0]} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
<div style={{ width: 22, textAlign: "center", fontSize: 11, fontWeight: 600, color: i < 3 ? "#FF9F0A" : "#AEAEB2" }}>{i < 3 ? medals[i] : (i + 1)}</div>
<div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#1D1D1F", letterSpacing: -0.2 }}>{entry[0]}</div>
<span style={{ fontSize: 14, fontWeight: 600, color: "#1D1D1F" }}>{entry[1]}</span>
</div>
);
})}
</Card>
<Card>
<h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600, color: "#1D1D1F", letterSpacing: -0.3 }}>Opérateurs (semaine)</h3>
{(function() {
var bCount = weekC.filter(function(c) { return c.operator === "Bouygues"; }).length;
var fCount = weekC.filter(function(c) { return c.operator === "Free"; }).length;
var total = bCount + fCount || 1;
return (
<div>
<div style={{ display: "flex", gap: 4, height: 32, borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
<div style={{ width: (bCount / total * 100) + "%", background: OP_COLORS.Bouygues, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700 }}>{bCount > 0 ? bCount : ""}</div>
<div style={{ width: (fCount / total * 100) + "%", background: OP_COLORS.Free, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700 }}>{fCount > 0 ? fCount : ""}</div>
</div>
</div>
);
})()}
</Card>
<Card>
<h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600, color: "#1D1D1F", letterSpacing: -0.3 }}>Alertes</h3>
{!dailyPlan && <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#EFF6FF", borderRadius: 8, marginBottom: 6 }}><span style={{ fontSize: 12, color: "#0071E3" }}>Plan voitures pas configuré</span></div>}
{yesterdayC.filter(function(c) { return c.status === "En attente"; }).length > 0 && <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#FEE2E2", borderRadius: 8 }}><span style={{ fontSize: 12, color: "#FF3B30" }}>{yesterdayC.filter(function(c) { return c.status === "En attente"; }).length} contrats en attente</span></div>}
</Card>
</div>
</div>
);
}

// TEAM
function TeamTab({ team, saveTeam, contracts, groups, saveGroups }) {
const [mo, setMo] = useState(false);
const [em, setEm] = useState(null);
const [f, setF] = useState({ name: "", role: "Debutant", operators: ["Free"], permis: false, voiture: false });
const [fl, setFl] = useState("");
const [vue, setVue] = useState("liste");
const [picker, setPicker] = useState(null);

function openAdd() { setEm(null); setF({ name: "", role: "Debutant", operators: ["Free"], permis: false, voiture: false }); setMo(true); }
function openEdit(m) { setEm(m); setF({ name: m.name, role: m.role, operators: Array.isArray(m.operators) ? m.operators : [m.operator || "Free"], permis: m.permis, voiture: m.voiture }); setMo(true); }
function save() {
if (!f.name.trim()) return;
if (em) { saveTeam(team.map(function(m) { return m.id === em.id ? Object.assign({}, m, f) : m; })); }
else { saveTeam([...team, { id: Date.now(), ...f, active: true }]); }
setMo(false);
}

var roleOrder = { "Manager": 0, "Assistant Manager": 1, "Formateur": 2, "Confirme": 3, "Debutant": 4 };

// Weekly contracts per person
var weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
var weekContracts = (contracts || []).filter(function(c) { return c.date >= weekAgo; });
var weekByName = {};
weekContracts.forEach(function(c) { weekByName[c.commercial] = (weekByName[c.commercial] || 0) + 1; });

function MemberCard({ m, onClick, showWeek }) {
  var w = weekByName[m.name] || 0;
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
          </div>
        </div>
        {showWeek && <div style={{ fontSize: 18, fontWeight: 700, color: w > 0 ? "#0071E3" : "#AEAEB2", minWidth: 28, textAlign: "right" }}>{w}</div>}
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
  </div>
  <div style={{ display: "flex", gap: 6 }}>
    {vue === "liste" && ROLES.map(function(r) {
      var count = team.filter(function(m) { return m.role === r; }).length;
      if (!count) return null;
      return <Btn key={r} s="sm" v={fl === r ? "primary" : "secondary"} onClick={function() { setFl(fl === r ? "" : r); }}>{r} ({count})</Btn>;
    })}
    <Btn onClick={openAdd}>+ Ajouter</Btn>
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
        {members.map(function(m) { return <MemberCard key={m.id} m={m} onClick={function() { openEdit(m); }} showWeek={true} />; })}
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
    saveGroups(groups.map(function(g) {
      if (g.id === gid) return Object.assign({}, g, { memberIds: g.memberIds.indexOf(mid) >= 0 ? g.memberIds : g.memberIds.concat(mid) });
      return Object.assign({}, g, { memberIds: g.memberIds.filter(function(id) { return id !== mid; }) });
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

// CARS
function CarsTab({ team, cars, saveCars, dailyPlan, saveDailyPlan }) {
const [mo, setMo] = useState(false);
const [cf, setCf] = useState({ name: "", seats: 5, owner: "Agence" });
const [plan, setPlan] = useState(dailyPlan || {});
const [ec, setEc] = useState(null);

var at = team.filter(function(m) { return m.active && m.role !== "Manager"; });
var assigned = new Set();
Object.values(plan).forEach(function(cp) { if (cp && cp.members) cp.members.forEach(function(id) { assigned.add(id); }); });
var unasgn = at.filter(function(m) { return !assigned.has(m.id); });

function autoAssign() {
var np = {};
var used = new Set();
cars.forEach(function(car) {
np[car.id] = { members: [], sector: "" };
var fd = at.find(function(m) { return !used.has(m.id) && (m.role === "Formateur" || m.role === "Assistant Manager") && m.permis; });
if (fd) { np[car.id].members.push(fd.id); used.add(fd.id); }
else {
var af = at.find(function(m) { return !used.has(m.id) && (m.role === "Formateur" || m.role === "Assistant Manager"); });
if (af) { np[car.id].members.push(af.id); used.add(af.id); }
var ad = at.find(function(m) { return !used.has(m.id) && m.permis; });
if (ad) { np[car.id].members.push(ad.id); used.add(ad.id); }
}
});
var rem = at.filter(function(m) { return !used.has(m.id); });
var ci = 0;
rem.forEach(function(m) { var tid = cars[ci % cars.length]; if (tid && np[tid.id].members.length < 5) np[tid.id].members.push(m.id); ci++; });
setPlan(np);
saveDailyPlan(np);
}

function addM(cid, mid) { var u = JSON.parse(JSON.stringify(plan)); if (!u[cid]) u[cid] = { members: [], sector: "" }; if (u[cid].members.indexOf(mid) === -1) u[cid].members.push(mid); setPlan(u); saveDailyPlan(u); }
function rmM(cid, mid) { var u = JSON.parse(JSON.stringify(plan)); u[cid].members = u[cid].members.filter(function(i) { return i !== mid; }); setPlan(u); saveDailyPlan(u); }
function setSector(cid, s) { var u = JSON.parse(JSON.stringify(plan)); if (!u[cid]) u[cid] = { members: [], sector: "", zoneType: "stratygo", vtaCode: "" }; u[cid].sector = s; setPlan(u); saveDailyPlan(u); }
function setZoneType(cid, z) { var u = JSON.parse(JSON.stringify(plan)); if (!u[cid]) u[cid] = { members: [], sector: "", zoneType: "stratygo", vtaCode: "" }; u[cid].zoneType = z; if (z === "stratygo") u[cid].vtaCode = ""; setPlan(u); saveDailyPlan(u); }
function setVtaCode(cid, v) { var u = JSON.parse(JSON.stringify(plan)); if (!u[cid]) u[cid] = { members: [], sector: "", zoneType: "talc", vtaCode: "" }; u[cid].vtaCode = v; setPlan(u); saveDailyPlan(u); }

function saveCar() {
if (!cf.name.trim()) return;
if (ec) saveCars(cars.map(function(c) { return c.id === ec.id ? Object.assign({}, c, cf) : c; }));
else saveCars([...cars, { id: Date.now(), ...cf }]);
setMo(false); setEc(null);
}

return (

<div>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
<div><h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: -0.4, color: "#1D1D1F" }}>Voitures</h2><p style={{ margin: "4px 0 0", fontSize: 12, color: "#6E6E73" }}>{unasgn.length} non assignés</p></div>
<div style={{ display: "flex", gap: 8 }}><Btn v="secondary" onClick={autoAssign}>Auto-repartir</Btn><Btn onClick={function() { setEc(null); setCf({ name: "", seats: 5, owner: "Agence" }); setMo(true); }}>+ Voiture</Btn></div>
</div>
<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
{cars.map(function(car) {
var cp = plan[car.id] || { members: [], sector: "" };
var cm = cp.members.map(function(id) { return team.find(function(m) { return m.id === id; }); }).filter(Boolean);
var hasF = cm.some(function(m) { return m.role === "Formateur" || m.role === "Assistant Manager"; });
var hasD = cm.some(function(m) { return m.permis; });
return (
<Card key={car.id} style={{ padding: 18 }}>
<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
<div><div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.3, color: "#1D1D1F" }}>{car.name}</div><div style={{ fontSize: 12, color: "#AEAEB2" }}>{car.seats}pl</div></div>
<div style={{ display: "flex", gap: 4 }}>
{!hasF && cm.length > 0 && <span style={{ background: "#FFF4E0", borderRadius: 8, padding: "2px 8px", fontSize: 11, color: "#9A5200", fontWeight: 600 }}>! Form.</span>}
{!hasD && cm.length > 0 && <span style={{ background: "#FFEDEC", borderRadius: 99, padding: "2px 8px", fontSize: 11, color: "#FF3B30", fontWeight: 600 }}>! Cond.</span>}
<button onClick={function() { setEc(car); setCf({ name: car.name, seats: car.seats, owner: car.owner }); setMo(true); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12 }}>Edit</button>
</div>
</div>
<Inp value={cp.sector} onChange={function(v) { setSector(car.id, v); }} placeholder="Secteur / Ville" style={{ marginBottom: 8, fontSize: 12 }} />
<div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
  <button onClick={function() { setZoneType(car.id, "stratygo"); }} style={{ flex: 1, padding: "5px 0", fontSize: 11, fontWeight: 700, borderRadius: 8, border: "none", cursor: "pointer", background: cp.zoneType === "talc" ? "#F5F5F7" : "#1D1D1F", color: cp.zoneType === "talc" ? "#AEAEB2" : "#fff" }}>Stratygo</button>
  <button onClick={function() { setZoneType(car.id, "talc"); }} style={{ flex: 1, padding: "5px 0", fontSize: 11, fontWeight: 700, borderRadius: 8, border: "none", cursor: "pointer", background: cp.zoneType === "talc" ? "#FF3B30" : "#F5F5F7", color: cp.zoneType === "talc" ? "#fff" : "#AEAEB2" }}>TALC</button>
</div>
{cp.zoneType === "talc" && (
  <Sel value={cp.vtaCode || ""} onChange={function(v) { setVtaCode(car.id, v); }} placeholder="Code VTA..."
    options={Object.keys(VTA_GROUPS).map(function(k) { return { value: k, label: k + " (" + VTA_GROUPS[k][0] + "...)" }; })}
    style={{ width: "100%", fontSize: 11, marginBottom: 8 }} />
)}
{cp.zoneType === "talc" && cp.vtaCode && (
  <div style={{ fontSize: 11, color: "#6E6E73", marginBottom: 8, padding: "4px 8px", background: "#FFF4E0", borderRadius: 8 }}>
    Groupe: {(VTA_GROUPS[cp.vtaCode] || []).join(", ")}
  </div>
)}
<div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
{cm.map(function(m) {
return (
<div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#FAFAFA", borderRadius: 8 }}>
<div style={{ width: 26, height: 26, borderRadius: 6, fontSize: 11, fontWeight: 700, background: "#F5F5F7", color: "#6E6E73", display: "flex", alignItems: "center", justifyContent: "center" }}>{m.name[0]}</div>
<div style={{ flex: 1 }}><span style={{ fontSize: 12, fontWeight: 600 }}>{m.name}</span><span style={{ fontSize: 11, color: "#AEAEB2", marginLeft: 6 }}>{m.role}</span></div>
<Badge color={OP_COLORS[m.operator]}>{m.operator[0]}</Badge>
{m.permis && <Badge color="#34C759">P</Badge>}
<button onClick={function() { rmM(car.id, m.id); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>x</button>
</div>
);
})}
{cm.length === 0 && <div style={{ textAlign: "center", padding: 12, color: "#AEAEB2", fontSize: 12 }}>Vide</div>}
</div>
{cm.length < car.seats && unasgn.length > 0 && (
<Sel value="" onChange={function(v) { addM(car.id, Number(v)); }} placeholder="+ Ajouter"
options={unasgn.map(function(m) { return { value: m.id, label: m.name + " (" + m.role + ")" }; })} style={{ width: "100%", fontSize: 12 }} />
)}
<div style={{ marginTop: 8, fontSize: 11, color: "#AEAEB2", textAlign: "right" }}>{cm.length}/{car.seats}</div>
</Card>
);
})}
</div>
{unasgn.length > 0 && (
<Card style={{ marginTop: 20, background: "#FFF9F0" }}>
<h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: "#9A5200" }}>Non assignés ({unasgn.length})</h4>
<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{unasgn.map(function(m) { return <Badge key={m.id} color={ROLE_COLORS[m.role]}>{m.name}</Badge>; })}</div>
</Card>
)}
<Modal open={mo} onClose={function() { setMo(false); setEc(null); }} title={ec ? "Modifier" : "Ajouter voiture"}>
<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
<Inp value={cf.name} onChange={function(v) { setCf(Object.assign({}, cf, { name: v })); }} placeholder="Nom de la voiture" />
<Inp type="number" value={cf.seats} onChange={function(v) { setCf(Object.assign({}, cf, { seats: Number(v) })); }} placeholder="Places" />
<div style={{ display: "flex", gap: 10 }}>
<Btn onClick={saveCar} style={{ flex: 1 }}>{ec ? "Enregistrer" : "Ajouter"}</Btn>
{ec && <Btn v="danger" onClick={function() { saveCars(cars.filter(function(c) { return c.id !== ec.id; })); setMo(false); }}>Suppr</Btn>}
</div>
</div>
</Modal>
</div>
);
}

// CONTRACTS
function ContractsTab({ contracts, team, dailyPlan, saveContracts }) {
const [fD, setFD] = useState("");
const [fC, setFC] = useState("");
const [fO, setFO] = useState("");

// Résoudre les VTA non encore attribués
var pendingVTA = contracts.filter(function(c) { return c.vtaCode && !c.vtaResolved; });
function resolveAllVTA() {
  // Pour chaque contrat VTA non résolu, chercher si quelqu'un du groupe
  // était dans le planning ce jour-là. Sinon, garder le principal du groupe.
  var updated = contracts.map(function(c) {
    if (!c.vtaCode || c.vtaResolved) return c;
    var group = VTA_GROUPS[c.vtaCode];
    if (!group) return Object.assign({}, c, { vtaResolved: true });

    var resolved = c.commercial; // valeur actuelle (principal par défaut)

    if (dailyPlan) {
      // Récupérer les IDs présents dans le planning (tous jours confondus,
      // car on n'a pas de planning par date pour l'instant)
      var presentIds = [];
      Object.values(dailyPlan).forEach(function(entry) {
        if (entry && entry.members) presentIds = presentIds.concat(entry.members);
      });
      var presentNames = presentIds.map(function(id) {
        var m = team.find(function(t) { return t.id === id; });
        return m ? m.name : null;
      }).filter(Boolean);

      var inGroup = group.filter(function(name) { return presentNames.indexOf(name) >= 0; });
      if (inGroup.length === 1) resolved = inGroup[0];
      // Si 0 ou >1 : on garde le principal (c.commercial déjà correct)
    }

    return Object.assign({}, c, { commercial: resolved, vtaResolved: true });
  });
  saveContracts(updated);
}

var filtered = contracts.filter(function(c) {
if (fD && c.date !== fD) return false;
if (fC && c.commercial !== fC) return false;
if (fO && c.operator !== fO) return false;
return true;
}).sort(function(a, b) { return (b.date + b.heure).localeCompare(a.date + a.heure); });

var coms = Array.from(new Set(contracts.map(function(c) { return c.commercial; }))).sort();
var dates = Array.from(new Set(contracts.map(function(c) { return c.date; }))).sort(function(a, b) { return b.localeCompare(a); });

return (

<div>
<Card style={{ marginBottom: 16, padding: "14px 16px" }}>
<div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
<Inp type="date" value={fD} onChange={setFD} style={{ width: 160 }} />
<Sel value={fC} onChange={setFC} placeholder="Tous commerciaux" options={coms} style={{ minWidth: 160 }} />
<Sel value={fO} onChange={setFO} placeholder="Operateurs" options={OPERATORS} style={{ minWidth: 120 }} />
{(fD || fC || fO) && <Btn s="sm" v="ghost" onClick={function() { setFD(""); setFC(""); setFO(""); }}>Reset</Btn>}
{pendingVTA.length > 0 && <Btn s="sm" v="secondary" onClick={resolveAllVTA}>Resoudre VTA ({pendingVTA.length})</Btn>}
<div style={{ marginLeft: "auto", fontSize: 13, color: "#6E6E73", fontWeight: 600 }}>{filtered.length} contrats</div>
</div>
</Card>
{!fD && (
<div style={{ display: "flex", gap: 10, marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
{dates.slice(0, 7).map(function(d) {
var dc = contracts.filter(function(c) { return c.date === d; });
return (
<Card key={d} onClick={function() { setFD(d); }} style={{ minWidth: 100, padding: 14, textAlign: "center", cursor: "pointer", border: fD === d ? "2px solid #0071E3" : "2px solid transparent" }}>
<div style={{ fontSize: 11, color: "#AEAEB2", fontWeight: 500 }}>{new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}</div>
<div style={{ fontSize: 22, fontWeight: 700, marginTop: 2, letterSpacing: -0.5, color: "#1D1D1F" }}>{dc.length}</div>
</Card>
);
})}
</div>
)}
<Card style={{ padding: 0, overflow: "hidden" }}>
<div style={{ overflowX: "auto" }}>
<table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
<thead><tr style={{ background: "#FAFAFA" }}>
{["Date", "Heure", "Commercial", "Ville", "Opérateur", "Statut"].map(function(h) {
return <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontWeight: 500, color: "#AEAEB2", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>{h}</th>;
})}
</tr></thead>
<tbody>
{filtered.slice(0, 80).map(function(c, i) {
return (
<tr key={c.id} style={{ borderTop: "1px solid rgba(0,0,0,0.04)", background: "#fff" }}>
<td style={{ padding: "10px 14px" }}>{new Date(c.date + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</td>
<td style={{ padding: "10px 14px", color: "#6E6E73", fontSize: 12, lineHeight: 1.5 }}>{c.heure}</td>
<td style={{ padding: "10px 14px", fontWeight: 500, color: "#1D1D1F" }}>{c.commercial}</td>
<td style={{ padding: "10px 14px" }}>{c.ville}</td>
<td style={{ padding: "10px 14px" }}><Badge color={OP_COLORS[c.operator]}>{c.operator}</Badge></td>
<td style={{ padding: "10px 14px" }}><Badge color={statusColor(c.status)}>{c.status}</Badge></td>
</tr>
);
})}
</tbody>
</table>
</div>
{filtered.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#AEAEB2" }}>Aucun contrat</div>}
</Card>
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
"NIORT|79":[46.32,-0.46],"CHAURAY|79":[46.35,-0.41],"ST MAIXENT|79":[46.41,-0.21],"MELLE|79":[46.22,-0.14],"CRECHE|79":[46.37,-0.30]
};

var MONTHS_ORDER = ["mar25","avr25","mai25","jun25","jul25","aou25","sep25","oct25","nov25","dec25","jan26","fev26"];
var MONTHS_LABELS = {mar25:"Mars 2025",avr25:"Avril 2025",mai25:"Mai 2025",jun25:"Juin 2025",jul25:"Juillet 2025",aou25:"Aout 2025",sep25:"Sept 2025",oct25:"Oct 2025",nov25:"Nov 2025",dec25:"Dec 2025",jan26:"Janv 2026",fev26:"Fev 2026"};
var MONTH_KEY_MAP = {mar25:"mar",avr25:"avr",mai25:"mai",jun25:"jun",jul25:"jul",aou25:"aou",sep25:"sep",oct25:"oct",nov25:"nov",dec25:"dec",jan26:"jan",fev26:"fev"};
var MONTHLY = {"VERTOU|44":{"fev":2,"jan":3,"nov":8,"sep":3,"aou":2,"jul":9,"jun":14},"VALLET|44":{"oct":12,"sep":1,"jul":12,"jun":1,"mai":3},"MACHECOUL|44":{"dec":4,"oct":6,"sep":4,"jul":5,"mai":9},"ST PHILBERT|44":{"fev":1,"nov":3,"sep":3,"jun":6},"CLISSON|44":{"nov":3,"aou":4,"jun":6,"mai":1},"LOROUX BOTTEREAU|44":{"jan":1,"nov":2,"jun":9},"ST JULIEN CONCELLES|44":{"fev":1,"nov":3,"sep":1,"jun":2},"DIVATTE SUR LOIRE|44":{"nov":4,"jun":4},"ST ETIENNE MONTLUC|44":{"nov":9,"jul":8,"jun":1},"CHEVROLIERE|44":{"nov":1,"sep":14,"aou":1,"mai":8},"STE PAZANNE|44":{"fev":1,"oct":7,"aou":2,"jul":2},"PONT ST MARTIN|44":{"jan":1,"sep":7,"jul":4},"HAUTE GOULAINE|44":{"fev":2,"nov":10,"sep":2,"jul":8},"LEGE|44":{"fev":7,"nov":2,"sep":4,"jun":5},"GORGES|44":{"dec":4,"aou":1,"jun":2},"VIEILLEVIGNE|44":{"oct":2,"jul":7},"HAIE FOUASSIERE|44":{"oct":5,"sep":1,"jul":1},"GETIGNE|44":{"jun":2,"mai":2},"SAINT AIGNAN GRANDLIEU|44":{"nov":4,"sep":5},"BIGNON|44":{"nov":2,"jun":3},"AIGREFEUILLE|44":{"nov":1,"oct":1,"sep":4},"CORDEMAIS|44":{"dec":1,"sep":2},"MONTBERT|44":{"nov":4,"oct":3,"aou":2,"jun":4},"GENESTON|44":{"jun":3},"PALLET|44":{"oct":3},"CORCOUE SUR LOGNE|44":{"fev":3,"nov":2,"sep":9,"jul":3},"LANDREAU|44":{"jan":2,"oct":2},"MOUZILLON|44":{"sep":2,"aou":3},"CHAPELLE HEULIN|44":{"fev":3,"sep":7},"SAINT COLOMBAN|44":{"oct":3},"BOUSSAY|44":{"fev":1,"sep":2,"jun":2},"CHATEAU THEBAUD|44":{"nov":3,"jul":1},"PLANCHE|44":{"oct":2,"aou":4},"MAISDON SUR SEVRE|44":{"nov":3,"sep":4},"SAINT MARS DE COUTAIS|44":{"oct":5},"SAINT LUMINE DE COUTAIS|44":{"nov":2,"oct":2,"jul":9},"LIMOUZINIERE|44":{"sep":3,"jul":4},"MONNIERES|44":{"oct":1},"ROUANS|44":{"jan":2,"oct":6},"SAINT HILAIRE DE CLISSON|44":{"jan":2,"sep":2},"SAINT LUMINE DE CLISSON|44":{"jul":2},"TOUVOIS|44":{"fev":1,"nov":6,"jul":7},"REMOUILLE|44":{"oct":2,"jul":5},"PAULX|44":{"oct":3},"SAINT ETIENNE DE MER MORTE|44":{"jul":5},"REGRIPPIERE|44":{"oct":1,"jun":1},"TEMPLE DE BRETAGNE|44":{"fev":1,"nov":3},"MARNE|44":{"oct":5},"REMAUDIERE|44":{"oct":1,"aou":6},"SAINT FIACRE SUR MAINE|44":{"nov":2,"oct":3},"BOISSIERE DU DORE|44":{"oct":1,"aou":3},"VUE|44":{"jan":1,"oct":5},"PORT SAINT PERE|44":{"oct":1},"SAINT NAZAIRE|44":{"fev":35,"jan":26,"dec":27,"nov":44,"oct":91,"sep":83,"aou":9},"BAULE ESCOUBLAC|44":{"fev":6,"oct":1,"sep":1},"PORNIC|44":{"fev":6,"nov":5,"sep":9},"PORNICHET|44":{"oct":7},"ST BREVIN|44":{"fev":7,"nov":2,"oct":3,"sep":1},"GUERANDE|44":{"jan":3,"dec":2,"nov":8,"oct":1,"sep":13},"SAINT MICHEL CHEF CHEF|44":{"fev":4,"oct":6,"aou":1},"PONTCHATEAU|44":{"fev":4,"jan":14,"oct":13,"sep":3},"POULIGUEN|44":{"nov":8,"sep":2},"CROISIC|44":{"dec":6,"oct":10},"TURBALLE|44":{"nov":7},"PLAINE SUR MER|44":{"oct":4},"SAVENAY|44":{"fev":1,"jan":3,"nov":8,"sep":8},"TRIGNAC|44":{"fev":1,"jan":1,"nov":4,"oct":9},"BERNERIE EN RETZ|44":{"nov":4,"sep":2},"DONGES|44":{"jan":4,"nov":12,"sep":4,"aou":2},"CHAUMES EN RETZ|44":{"dec":2,"oct":1,"aou":1},"HERBIGNAC|44":{"dec":3,"sep":7},"MONTOIR DE BRETAGNE|44":{"jan":1,"nov":6,"oct":1,"sep":1,"aou":2},"MESQUER|44":{"fev":4},"SAINT ANDRE DES EAUX|44":{"oct":8},"VILLENEUVE EN RETZ|44":{"jan":2,"oct":2},"SAINT PERE EN RETZ|44":{"oct":2,"aou":4},"MISSILLAC|44":{"nov":8},"PREFAILLES|44":{"oct":2},"SAINT JOACHIM|44":{"oct":23},"SAINT LYPHARD|44":{"nov":4},"CAMPBON|44":{"jan":7,"oct":3},"GUENROUET|44":{"nov":4,"oct":5,"aou":1},"MOUTIERS EN RETZ|44":{"sep":2},"FROSSAY|44":{"fev":2,"nov":1,"oct":5},"CHAUVE|44":{"jan":4,"oct":3},"PRINQUIAU|44":{"nov":1,"sep":3},"ASSERAC|44":{"nov":1,"sep":4},"MALVILLE|44":{"oct":5},"PAIMBOEUF|44":{"fev":8,"oct":6},"SAINTE ANNE SUR BRIVET|44":{"fev":1,"oct":3},"SAINT GILDAS DES BOIS|44":{"nov":3,"oct":6},"SAINT MOLF|44":{"dec":5,"sep":8},"SAINT MALO DE GUERSAC|44":{"nov":9},"SAINT VIAUD|44":{"fev":3,"oct":5},"CROSSAC|44":{"jan":7,"sep":5},"CHAPELLE LAUNAY|44":{"nov":2,"sep":1},"SAINT HILAIRE DE CHALEONS|44":{"dec":1,"oct":2,"aou":1},"CORSEPT|44":{"oct":3},"DREFFEAC|44":{"fev":3,"nov":1,"oct":4},"SAINTE REINE DE BRETAGNE|44":{"nov":4},"SEVERAC|44":{"nov":2,"oct":1},"QUILLY|44":{"jan":1,"oct":1},"BOUEE|44":{"dec":1,"nov":2,"sep":1},"LAVAU SUR LOIRE|44":{"dec":5,"sep":2},"CESSON SEVIGNE|35":{"fev":5,"nov":4,"sep":6,"aou":7,"jul":5,"jun":30},"BRUZ|35":{"jan":5,"oct":27,"aou":5,"jul":39,"jun":4},"BETTON|35":{"jul":7},"ST GREGOIRE|35":{"fev":3,"jul":5,"mai":8,"avr":15},"PACE|35":{"oct":4,"jul":1,"jun":5},"CHARTRES BRETAGNE|35":{"fev":3,"nov":3,"oct":8,"jun":16},"NOYAL CHATILLON|35":{"fev":1,"oct":8,"jul":13,"mai":39},"VERN SUR SEICHE|35":{"jul":5,"jun":1},"RHEU|35":{"aou":1,"jun":3,"avr":10},"MORDELLES|35":{"aou":1,"jun":5,"mai":7},"LIFFRE|35":{"oct":9,"jul":5,"jun":3},"CHATEAUGIRON|35":{"nov":5,"jun":12},"MELESSE|35":{"oct":5,"jul":6,"mai":13},"MONTFORT SUR MEU|35":{"jul":3},"ORGERES|35":{"fev":2,"dec":2,"aou":7,"jun":10,"avr":5},"BREAL SOUS MONTFORT|35":{"jul":13},"CHAPELLE DES FOUGERETZ|35":{"sep":8,"jun":7,"mai":5},"MEZIERE|35":{"jul":7,"mai":4},"HERMITAGE|35":{"fev":3,"oct":10,"jul":11},"BOURGBARRE|35":{"aou":9},"BOUEXIERE|35":{"aou":1,"jul":8},"PONT PEAN|35":{"fev":2,"nov":2,"oct":8,"aou":12,"jun":2},"NOUVOITOU|35":{"jul":2},"CORPS NUDS|35":{"oct":4,"jul":3,"jun":1},"MONTGERMONT|35":{"fev":2,"sep":11,"mai":4,"avr":9},"ROMILLE|35":{"nov":8,"jun":3},"DOMLOUP|35":{"jul":5},"SAINT ARMEL|35":{"oct":6,"jul":8},"GUIPEL|35":{"jun":1},"FONTENAY LE COMTE|85":{"fev":6,"nov":31,"oct":7,"sep":3,"jul":10,"jun":19,"mai":5},"LUCON|85":{"fev":7,"nov":5,"oct":10,"sep":20,"jul":9,"jun":39,"avr":8},"POUZAUGES|85":{"jan":6,"oct":1,"sep":3,"aou":3,"jul":2,"jun":2,"avr":6},"SEVREMONT|85":{"fev":1,"nov":9,"sep":7,"jun":12},"BENET|85":{"dec":5,"jun":4},"STE HERMINE|85":{"dec":7,"oct":1,"aou":7,"mai":9},"CHATAIGNERAIE|85":{"oct":8,"sep":1,"jul":5,"mai":2,"avr":12},"ST MICHEL L HERM|85":{"jan":9,"jun":8},"BOUPERE|85":{"sep":3,"jul":1,"jun":6},"MAREUIL SUR LAY DISSAIS|85":{"fev":3,"sep":10,"jun":5},"TERVAL|85":{"oct":3,"sep":4},"NALLIERS|85":{"fev":1,"sep":1,"jul":1,"jun":10},"RIVES D AUTISE|85":{"aou":2},"SAINT HILAIRE DES LOGES|85":{"oct":12},"SAINTE GEMME LA PLAINE|85":{"nov":3,"jun":4},"MOUILLERON SAINT GERMAIN|85":{"oct":1,"sep":6,"aou":2},"CHAILLE LES MARAIS|85":{"nov":2},"VIX|85":{"nov":3,"jul":6,"mai":3},"CHAMPAGNE LES MARAIS|85":{"nov":6,"jun":1},"SAINT MESMIN|85":{"jan":1,"dec":1,"sep":8},"MONTOURNAIS|85":{"dec":2,"aou":2},"ILE D ELLE|85":{"jul":5},"GRUES|85":{"nov":3,"jun":3},"SAINT PIERRE DU CHEMIN|85":{"nov":5,"oct":5},"RIVES DU FOUGERAIS|85":{"fev":1,"oct":5},"MAGNILS REIGNIERS|85":{"nov":5},"MEILLERAIE TILLAY|85":{"nov":5},"VELLUIRE SUR VENDEE|85":{"nov":4,"jun":3,"mar":1},"CHATEAU GUIBERT|85":{"sep":3},"MERVENT|85":{"sep":6},"FOUSSAIS PAYRE|85":{"dec":3,"sep":3},"TRIAIZE|85":{"nov":3,"jun":3},"BAZOGES EN PAREDS|85":{"oct":3},"VOUVANT|85":{"fev":1,"aou":6},"CAILLERE SAINT HILAIRE|85":{"oct":2},"MAILLEZAIS|85":{"dec":2,"aou":2},"PISSOTTE|85":{"nov":5},"LONGEVES|85":{"oct":1},"MOUZEUIL SAINT MARTIN|85":{"jun":3},"SERIGNE|85":{"nov":1},"CHEFFOIS|85":{"oct":4},"ANTIGNY|85":{"nov":4},"SAINT MICHEL LE CLOUCQ|85":{"jul":3},"LANGON|85":{"nov":1,"jun":4},"DAMVIX|85":{"sep":5,"jun":2},"MONSIREIGNE|85":{"sep":2},"SAINTE RADEGONDE DES NOYERS|85":{"nov":1,"jul":4},"HERMENAULT|85":{"oct":6},"CORPE|85":{"jan":1,"jul":6},"REAUMUR|85":{"aou":2},"MAILLE|85":{"sep":7},"MOUTIERS SUR LE LAY|85":{"sep":5},"VOUILLE LES MARAIS|85":{"nov":2,"jun":3},"SAINT HILAIRE DE VOUST|85":{"dec":2},"SAINT PIERRE LE VIEUX|85":{"dec":1},"CHASNAIS|85":{"nov":2},"CHAVAGNES LES REDOUX|85":{"nov":4},"LAIROUX|85":{"nov":4},"SAINT JEAN DE BEUGNE|85":{"sep":6},"MONTREUIL|85":{"sep":1},"SAINT MAURICE DES NOUES|85":{"nov":2},"SAINT MARTIN DE FRAIGNEAU|85":{"dec":1,"sep":1,"aou":1,"jul":4},"BOURNEAU|85":{"nov":8},"BRETONNIERE LA CLAYE|85":{"nov":3},"JAUDONNIERE|85":{"oct":2},"MENOMBLET|85":{"dec":1,"nov":3},"XANTON CHASSENON|85":{"jul":5},"SAINT DENIS DU PAYRE|85":{"nov":3},"PEAULT|85":{"sep":3,"jul":2},"MAZEAU|85":{"sep":1,"jun":1},"PINEAUX|85":{"sep":1},"THIRE|85":{"oct":4},"GUE DE VELLUIRE|85":{"jun":2,"mai":2},"POUILLE|85":{"oct":1},"SAINT VALERIEN|85":{"oct":2},"BOUILLE COURDAULT|85":{"jul":3},"SAINT MARTIN LARS EN SAINTE HERMINE|85":{"dec":1},"SAINT ETIENNE DE BRILLOUET|85":{"nov":4},"PETOSSE|85":{"oct":1},"TAILLEE|85":{"nov":2,"jun":3},"PUYRAVAULT|85":{"nov":1,"jul":4},"SAINT AUBIN LA PLAINE|85":{"dec":1,"jun":2},"MARSAIS SAINTE RADEGONDE|85":{"oct":2},"CHAPELLE THEMER|85":{"oct":3},"SAINT SIGISMOND|85":{"sep":5},"TALLUD SAINTE GEMME|85":{"oct":4},"BESSAY|85":{"jul":4},"MOREILLES|85":{"jul":4},"LOGE FOUGEREUSE|85":{"oct":5},"LIEZ|85":{"sep":3},"FAYMOREAU|85":{"oct":3,"sep":5},"SAINTE PEXINE|85":{"sep":4},"ROCHE SUR YON|85":{"fev":61,"jan":81,"oct":2,"sep":98,"aou":3,"jul":55,"jun":60,"mai":16,"mar":5,"dec":1},"MONTAIGU|85":{"fev":5,"jan":10,"sep":5,"jul":12,"jun":16,"avr":6},"HERBIERS|85":{"fev":1,"jan":7,"sep":1,"aou":14,"jul":14,"jun":7,"avr":2},"AIZENAY|85":{"jan":5,"jun":3,"dec":1},"CHANTONNAY|85":{"jan":8,"aou":2,"jun":7,"mai":5,"avr":1,"mar":3,"fev":1,"oct":1},"POIRE SUR VIE|85":{"jan":1,"aou":2,"jun":1},"MORTAGNE SUR SEVRE|85":{"fev":8,"sep":10,"mai":8},"ESSARTS EN BOCAGE|85":{"fev":1,"jan":7,"sep":5,"mai":5,"dec":1},"AUBIGNY LES CLOUZEAUX|85":{"jan":5,"sep":10,"jul":3,"oct":1},"CHANVERRIE|85":{"jan":4,"sep":7,"jun":1,"mai":3},"BELLEVIGNY|85":{"jan":4,"sep":2,"aou":3,"mai":5},"MOUILLERON LE CAPTIF|85":{"jan":1,"jul":1},"FERRIERE|85":{"jan":4,"sep":5,"jun":5},"CUGAND|85":{"sep":5},"RIVES DE L YON|85":{"jan":5,"jul":4,"fev":1},"DOMPIERRE SUR YON|85":{"fev":4,"sep":5,"jun":1,"nov":1},"BRUFFIERE|85":{"fev":1,"sep":6,"jul":5,"mai":3},"SAINT FULGENT|85":{"jan":2,"sep":9,"jun":3},"VENANSAULT|85":{"jan":1},"CHAIZE LE VICOMTE|85":{"jan":2,"jun":7},"BOURNEZEAU|85":{"fev":2,"aou":3,"jan":3},"CHAVAGNES EN PAILLERS|85":{"fev":3,"jul":4},"LUCS SUR BOULOGNE|85":{"fev":4,"aou":6,"jun":3},"MONTREVERD|85":{"jan":2,"aou":11},"SAINT PHILBERT DE BOUAINE|85":{"jun":3},"SAINT LAURENT SUR SEVRE|85":{"fev":4},"GAUBRETIERE|85":{"fev":3,"aou":8},"HERBERGEMENT|85":{"jan":8,"jul":1,"jun":4},"NESMY|85":{"sep":6,"jul":7,"jun":2,"mar":1},"MOUCHAMPS|85":{"fev":2,"jun":1},"TREIZE SEPTIERS|85":{"fev":2,"sep":4,"jul":2,"jun":4},"EPESSES|85":{"fev":2,"aou":4},"BROUZILS|85":{"jul":1,"avr":1},"CHAUCHE|85":{"jan":2,"jun":7},"LANDES GENUSSON|85":{"fev":3,"sep":7,"aou":1,"jun":8},"SAINT MARTIN DES NOYERS|85":{"fev":3,"aou":5,"jan":1},"SAINT DENIS LA CHEVASSE|85":{"jan":3,"oct":1},"BOISSIERE DE MONTAIGU|85":{"fev":3,"sep":7,"jun":2},"APREMONT|85":{"jul":3},"SAINT ETIENNE DU BOIS|85":{"fev":2,"jun":1},"BERNARDIERE|85":{"fev":1},"SAINT GERMAIN DE PRINCAY|85":{"jun":2},"SAINT PROUANT|85":{"sep":1,"jul":1},"TIFFAUGES|85":{"fev":3,"jan":2,"jun":1},"MACHE|85":{"jul":5},"SAINT AUBIN DES ORMEAUX|85":{"jul":4},"THORIGNY|85":{"jul":4},"MESNARD LA BAROTIERE|85":{"fev":3},"SAINT MALO DU BOIS|85":{"fev":1,"sep":3},"TREIZE VENTS|85":{"sep":9},"PALLUAU|85":{"fev":3,"jun":1},"SAINT HILAIRE LE VOUHIS|85":{"aou":10},"SAINT MARTIN DES TILLEULS|85":{"jul":9},"COPECHAGNIERE|85":{"jan":2,"jul":3},"SIGOURNAIS|85":{"jun":2},"CHAPELLE PALLUAU|85":{"jun":2},"RABATELIERE|85":{"jul":2,"jun":5},"MERLATIERE|85":{"jun":1},"SAINT MARS LA REORTHE|85":{"sep":7},"SAINT VINCENT STERLANGES|85":{"jan":5,"jun":5},"GRAND LANDES|85":{"jun":3},"TABLIER|85":{"jul":2},"MALLIEVRE|85":{"sep":3},"ROYAN|17":{"fev":34},"ROCHEFORT|17":{"jan":1,"dec":8},"VOUHE|17":{"fev":1},"LA ROCHELLE|17":{"fev":29,"jan":20,"dec":69},"AYTRE|17":{"jan":23,"dec":15},"LAGORD|17":{"fev":2},"MARANS|17":{"fev":13},"SAINTE SOULLE|17":{"jan":4},"ANDILLY|17":{"jan":2},"NUAILLE D AUNIS|17":{"jan":2},"BRESSUIRE|79":{"fev":18,"jan":5},"THOUARS|79":{"fev":4,"jan":11},"MAULEON|79":{"fev":1},"NUEIL LES AUBIERS|79":{"fev":4,"jan":8},"MONCOUTANT|79":{"fev":10},"CERIZAY|79":{"jan":18},"ARGENTONNAY|79":{"jan":4},"LORETZ D ARGENTON|79":{"fev":4},"COURLAY|79":{"fev":12},"VAL EN VIGNES|79":{"fev":1},"CHAPELLE SAINT LAURENT|79":{"fev":6},"SAINT PIERRE DES ECHAUBROGNES|79":{"jan":4},"SAINT AMAND SUR SEVRE|79":{"jan":5},"CIRIERES|79":{"fev":4},"PIN|79":{"jan":4},"SAINT JACQUES DE THOUARS|79":{"fev":4,"jan":5},"NIORT|79":{"fev":44,"jan":40},"CHAURAY|79":{"jan":1},"ST MAIXENT|79":{"fev":7},"CRECHE|79":{"fev":1},"FRONTENAY ROHAN ROHAN|79":{"fev":4},"SAINT SYMPHORIEN|79":{"fev":2},"EXIREUIL|79":{"fev":7}};

function getC(commune, dept, month) {
if (!month) return commune.c;
var dataKey = MONTH_KEY_MAP[month] || month;
var key = commune.v + "|" + dept;
var m = MONTHLY[key];
return m ? (m[dataKey] || 0) : 0;
}

function MapTab({ dailyPlan, team, cars }) {
var mapRef = useRef(null);
var mapInstance = useRef(null);
const [sel, setSel] = useState(null);
const [sortBy, setSortBy] = useState("c");
const [mapReady, setMapReady] = useState(false);
const [month, setMonth] = useState("");

var stats = Object.entries(JACHERE).map(function(entry) {
var name = entry[0]; var data = entry[1];
var tp = data.communes.reduce(function(s, c) { return s + c.p; }, 0);
var tc = data.communes.reduce(function(s, c) { return s + getC(c, data.dept, month); }, 0);
return { name: name, dept: data.dept, communes: data.communes, tp: tp, tc: tc, taux: tp ? (tc / tp * 100) : 0 };
});
var totalC = stats.reduce(function(s, j) { return s + j.tc; }, 0);
var totalP = stats.reduce(function(s, j) { return s + j.tp; }, 0);

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
L.circleMarker([coords[0], coords[1]], {
radius: radius, fillColor: color, color: "#fff", weight: 2, opacity: 1, fillOpacity: 0.85,
}).addTo(map).bindPopup(
"<div style='font-family:-apple-system,sans-serif;min-width:180px'>" +
"<b style='font-size:14px'>" + commune.v + "</b><br>" +
"<span style='font-size:11px;color:#6B7280'>" + jName + " | " + (commune.z === "H" ? "Haute" : "Standard") + "</span><hr style='margin:6px 0;border:none;border-top:1px solid #eee'>" +
"Prises: <b>" + commune.p.toLocaleString("fr-FR") + "</b><br>" +
"Contrats: <b style='color:" + color + "'>" + c + "</b><br>" +
"Taux: <b style='color:" + color + "'>" + taux.toFixed(2) + "%</b></div>"
);
});
});
}, 400);
return function() { if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; } };
}, [mapReady, month]);

if (sel) {
var jData = JACHERE[sel];
var s = stats.find(function(x) { return x.name === sel; });
var sorted = jData.communes.slice().sort(function(a, b) {
var ac = getC(a, jData.dept, month), bc = getC(b, jData.dept, month);
if (sortBy === "c") return bc - ac;
if (sortBy === "p") return b.p - a.p;
return (bc / (b.p || 1)) - (ac / (a.p || 1));
});
return (

<div>
<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
<Btn v="ghost" onClick={function() { setSel(null); }}>Retour</Btn>
<h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{sel}</h2>
<Badge color={OP_COLORS.Free}>Free</Badge>
{DEPT_ZONES[jData.dept] && DEPT_ZONES[jData.dept].b && <Badge color={OP_COLORS.Bouygues}>Bouygues</Badge>}
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
var cc = getC(c, jData.dept, month);
var t = c.p ? (cc / c.p * 100) : 0;
var col = t > 0.8 ? "#34C759" : t > 0.3 ? "#FF9F0A" : cc === 0 ? "rgba(0,0,0,0.08)" : "#FF3B30";
return (
<div key={c.v} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: i % 2 ? "#FAFAFA" : "#fff", borderRadius: 8 }}>
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

return (

<div>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
<div>
<h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: -0.4, color: "#1D1D1F" }}>Carte des jacheres</h2>
<p style={{ margin: "4px 0 0", fontSize: 13, color: "#6E6E73" }}>{totalC} contrats - {totalP.toLocaleString("fr-FR")} prises - {(totalC / totalP * 100).toFixed(2)}%</p>
</div>
<Sel value={month} onChange={setMonth} placeholder="Tous les mois" options={MONTHS_ORDER.map(function(m) { return { value: m, label: MONTHS_LABELS[m] }; })} style={{ minWidth: 150 }} />
</div>
<Card style={{ padding: 0, overflow: "hidden", marginBottom: 16, borderRadius: 14 }}>
<div ref={mapRef} style={{ width: "100%", height: 480 }}>
{!mapReady && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 480, color: "#AEAEB2" }}>Chargement...</div>}
</div>
</Card>
<div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
<div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 12, height: 12, borderRadius: "50%", background: "#34C759" }} /><span style={{ fontSize: 11, color: "#6E6E73" }}>Bon taux</span></div>
<div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 12, height: 12, borderRadius: "50%", background: "#FF9F0A" }} /><span style={{ fontSize: 11, color: "#6E6E73" }}>Moyen</span></div>
<div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 12, height: 12, borderRadius: "50%", background: "#FF3B30" }} /><span style={{ fontSize: 11, color: "#6E6E73" }}>Faible</span></div>
<div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 12, height: 12, borderRadius: "50%", background: "#AEAEB2" }} /><span style={{ fontSize: 11, color: "#6E6E73" }}>0 contrats</span></div>
</div>
<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
{stats.sort(function(a, b) { return b.tc - a.tc; }).map(function(j) {
var col = j.taux > 0.5 ? "#34C759" : j.taux > 0.2 ? "#FF9F0A" : "#FF3B30";
return (
<Card key={j.name} onClick={function() { setSel(j.name); }} style={{ cursor: "pointer", padding: 18, border: "2px solid transparent" }}>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
<div>
<div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.3, color: "#1D1D1F" }}>{j.name}</div>
<div style={{ fontSize: 12, color: "#AEAEB2", marginTop: 2 }}>{j.communes.length} com. - {j.tp.toLocaleString("fr-FR")} prises</div>
</div>
<Badge color={col}>{j.taux.toFixed(2)}%</Badge>
</div>
<div style={{ height: 8, borderRadius: 4, background: "#F5F5F7", overflow: "hidden", marginBottom: 8 }}>
<div style={{ width: Math.min(j.taux * 50, 100) + "%", height: "100%", borderRadius: 4, background: col }} />
</div>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
<span style={{ fontSize: 22, fontWeight: 800 }}>{j.tc}</span>
<div style={{ display: "flex", gap: 4 }}>
<Badge color={OP_COLORS.Free}>Free</Badge>
{DEPT_ZONES[j.dept] && DEPT_ZONES[j.dept].b && <Badge color={OP_COLORS.Bouygues}>B</Badge>}
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
  } else {
    var yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    veilleDate.push(yesterday.toISOString().split("T")[0]);
  }

  var dateLabel = veilleDate.length === 2
    ? new Date(veilleDate[0] + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
      + " & " + new Date(veilleDate[1] + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
    : new Date(veilleDate[0] + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  // Compter les contrats par commercial sur les dates veille
  var counts = {};
  team.filter(function(m) { return m.active; }).forEach(function(m) { counts[m.name] = 0; });
  contracts.forEach(function(c) {
    if (veilleDate.indexOf(c.date) >= 0 && counts[c.commercial] !== undefined) {
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
  // Helpers pour les semaines
  function getWeekKey(date) {
    var d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay() + 1); // Lundi
    return d.toISOString().split("T")[0];
  }

  function getWeekLabel(weekKey) {
    var start = new Date(weekKey + "T12:00:00");
    var end = new Date(start);
    end.setDate(end.getDate() + 6);
    var fmt = function(d) { return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }); };
    return "Sem. " + fmt(start) + " – " + fmt(end);
  }

  function getWeekDates(weekKey) {
    var start = new Date(weekKey + "T12:00:00");
    var dates = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(start);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().split("T")[0]);
    }
    return dates;
  }

  // Semaines disponibles : toutes les semaines avec des contrats + semaine courante + 4 semaines futures
  var today = new Date();
  var currentWeek = getWeekKey(today.toISOString().split("T")[0]);

  var weeksFromContracts = Array.from(new Set(contracts.map(function(c) { return getWeekKey(c.date); })));
  var futureWeeks = [];
  for (var i = 0; i <= 4; i++) {
    var d = new Date(today);
    d.setDate(d.getDate() + i * 7);
    futureWeeks.push(getWeekKey(d.toISOString().split("T")[0]));
  }
  var allWeeks = Array.from(new Set(weeksFromContracts.concat(futureWeeks))).sort(function(a, b) { return b.localeCompare(a); });

  var [selectedWeek, setSelectedWeek] = useState(currentWeek);
  var [editMode, setEditMode] = useState(false);
  var [draft, setDraft] = useState({});

  var activeTeam = team.filter(function(m) { return m.active; });

  // Contrats de la semaine sélectionnée
  var weekDates = getWeekDates(selectedWeek);
  var weekContracts = contracts.filter(function(c) { return weekDates.indexOf(c.date) >= 0; });

  // Objectifs de la semaine
  var weekObjectives = (objectives[selectedWeek] || {});

  // Réalisé par commercial
  var realise = {};
  activeTeam.forEach(function(m) { realise[m.name] = 0; });
  weekContracts.forEach(function(c) { if (realise[c.commercial] !== undefined) realise[c.commercial]++; });

  // Total équipe
  var totalObjectif = activeTeam.reduce(function(s, m) { return s + (weekObjectives[m.name] || 0); }, 0);
  var totalRealise = activeTeam.reduce(function(s, m) { return s + (realise[m.name] || 0); }, 0);
  var isPast = selectedWeek < currentWeek;
  var isCurrent = selectedWeek === currentWeek;

  function startEdit() {
    var d = {};
    activeTeam.forEach(function(m) { d[m.name] = weekObjectives[m.name] || 0; });
    setDraft(d);
    setEditMode(true);
  }

  function saveWeek() {
    var updated = Object.assign({}, objectives, {});
    updated[selectedWeek] = Object.assign({}, draft);
    saveObjectives(updated);
    setEditMode(false);
  }

  var pct = totalObjectif > 0 ? Math.min(100, Math.round(totalRealise / totalObjectif * 100)) : 0;
  var pctColor = pct >= 100 ? "#34C759" : pct >= 70 ? "#FF9F0A" : "#FF3B30";

  return (
    <div>
      {/* Header semaine */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: -0.6, color: "#1D1D1F" }}>Objectifs</h2>
          <select
            value={selectedWeek}
            onChange={function(e) { setSelectedWeek(e.target.value); setEditMode(false); }}
            style={{ border: "1px solid #E5E7EB", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 600, background: "#fff", cursor: "pointer" }}
          >
            {allWeeks.map(function(w) {
              return <option key={w} value={w}>{getWeekLabel(w)}{w === currentWeek ? " (en cours)" : ""}</option>;
            })}
          </select>
        </div>
        {!editMode && (
          <Btn onClick={startEdit} v="primary" s="sm">
            {totalObjectif === 0 ? "Fixer les objectifs" : "Modifier les objectifs"}
          </Btn>
        )}
        {editMode && (
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={function() { setEditMode(false); }} v="secondary" s="sm">Annuler</Btn>
            <Btn onClick={saveWeek} v="primary" s="sm">Enregistrer</Btn>
          </div>
        )}
      </div>

      {/* KPI global */}
      {totalObjectif > 0 && (
        <Card style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "#AEAEB2", fontWeight: 500, letterSpacing: 0.5, marginBottom: 4 }}>ÉQUIPE — {getWeekLabel(selectedWeek)}</div>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.8, color: pctColor }}>{totalRealise} <span style={{ fontSize: 16, color: "#AEAEB2", fontWeight: 500 }}>/ {totalObjectif} contrats</span></div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1, color: pctColor }}>{pct}%</div>
              <div style={{ fontSize: 12, color: "#AEAEB2" }}>{isPast ? "final" : "atteint"}</div>
            </div>
          </div>
          <div style={{ background: "#F5F5F7", borderRadius: 999, height: 6, overflow: "hidden" }}>
            <div style={{ width: pct + "%", background: pctColor, height: "100%", borderRadius: 999, transition: "width 0.4s" }} />
          </div>
        </Card>
      )}

      {/* Tableau commerciaux */}
      <Card>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #F3F4F6" }}>
                <th style={{ textAlign: "left", padding: "10px 14px", color: "#AEAEB2", fontWeight: 500, fontSize: 11, letterSpacing: 0.4 }}>COMMERCIAL</th>
                <th style={{ textAlign: "center", padding: "10px 14px", color: "#AEAEB2", fontWeight: 500, fontSize: 11, letterSpacing: 0.4 }}>OBJECTIF</th>
                <th style={{ textAlign: "center", padding: "10px 14px", color: "#AEAEB2", fontWeight: 500, fontSize: 11, letterSpacing: 0.4 }}>RÉALISÉ</th>
                <th style={{ textAlign: "left", padding: "10px 14px", color: "#AEAEB2", fontWeight: 500, fontSize: 11, letterSpacing: 0.4 }}>PROGRESSION</th>
                <th style={{ textAlign: "center", padding: "10px 14px", color: "#AEAEB2", fontWeight: 500, fontSize: 11, letterSpacing: 0.4 }}>STATUT</th>
              </tr>
            </thead>
            <tbody>
              {activeTeam.sort(function(a, b) { return (realise[b.name] || 0) - (realise[a.name] || 0); }).map(function(m, i) {
                var obj = editMode ? (draft[m.name] || 0) : (weekObjectives[m.name] || 0);
                var done = realise[m.name] || 0;
                var p = obj > 0 ? Math.min(100, Math.round(done / obj * 100)) : 0;
                var col = obj === 0 ? "#AEAEB2" : p >= 100 ? "#34C759" : p >= 70 ? "#FF9F0A" : "#FF3B30";
                var atteint = obj > 0 && done >= obj;

                return (
                  <tr key={m.id} style={{ borderTop: i === 0 ? "none" : "1px solid #F3F4F6", background: "#fff" }}>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ fontWeight: 500, color: "#1D1D1F", letterSpacing: -0.2 }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: "#AEAEB2" }}>{m.role}</div>
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "center" }}>
                      {editMode ? (
                        <input
                          type="number"
                          min="0"
                          value={draft[m.name] || 0}
                          onChange={function(e) {
                            var v = parseInt(e.target.value) || 0;
                            setDraft(function(prev) { return Object.assign({}, prev, { [m.name]: v }); });
                          }}
                          style={{ width: 64, border: "1.5px solid #0071E3", borderRadius: 8, padding: "4px 8px", textAlign: "center", fontWeight: 700, fontSize: 14, fontFamily: "inherit" }}
                        />
                      ) : (
                        <span style={{ fontWeight: 700, fontSize: 15, color: obj === 0 ? "#D1D1D6" : "#1D1D1F" }}>{obj === 0 ? "—" : obj}</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "center" }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: done === 0 ? "#AEAEB2" : "#1D1D1F" }}>{done}</span>
                    </td>
                    <td style={{ padding: "12px 14px", minWidth: 140 }}>
                      {obj > 0 ? (
                        <div>
                          <div style={{ background: "#F5F5F7", borderRadius: 999, height: 5, overflow: "hidden", marginBottom: 4 }}>
                            <div style={{ width: p + "%", background: col, height: "100%", borderRadius: 999, transition: "width 0.3s" }} />
                          </div>
                          <div style={{ fontSize: 11, color: col, fontWeight: 600 }}>{p}%</div>
                        </div>
                      ) : (
                        <span style={{ color: "#D1D1D6", fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "center" }}>
                      {obj === 0 ? (
                        <span style={{ fontSize: 18 }}>—</span>
                      ) : atteint ? (
                        <span style={{ background: "#E8F8ED", color: "#1C7A3A", borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>✓ Atteint</span>
                      ) : isPast ? (
                        <span style={{ background: "#FFEDEC", color: "#FF3B30", borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>✗ Non atteint</span>
                      ) : (
                        <span style={{ background: "#F5F5F7", color: "#6E6E73", borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>En cours</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Message si pas d'objectifs */}
      {totalObjectif === 0 && !editMode && (
        <div style={{ textAlign: "center", color: "#AEAEB2", marginTop: 32, fontSize: 14 }}>
          Aucun objectif fixé pour cette semaine.<br />
          <span style={{ fontSize: 12 }}>Clique sur "Fixer les objectifs" pour commencer.</span>
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