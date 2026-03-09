# La Ouirinance — CLAUDE.md

## Commandes

```bash
npm run dev      # dev server → localhost:5173
npm run build    # build prod
git push origin main  # → GitHub Actions → scrape + build + deploy Pages (automatique)
```

## Architecture

- **Multi-fichier** structuré par domaine :
  - `src/App.jsx` — orchestrateur (state, Firestore sync, header, nav, routing tabs)
  - `src/constants/` — données statiques (vta.js, jachere.js, roles.js)
  - `src/data/` — store Firebase (store.js), team/cars (team.js), contrats (contracts.js), GPS (gps.js)
  - `src/helpers/` — logique métier (resolution.js, status.js, carnet.js)
  - `src/components/` — UI réutilisables (ui.jsx) + un fichier par onglet (*Tab.jsx) + autocompletes
- `src/data.json` — données carnet scrappées par `scraper.py`, baked into build
- `.github/workflows/scrape.yml` — scrape + build + deploy toutes les heures + sur push main
- Pas de router : navigation via state `tab` (onglets) + sous-états `view`, `selectedCom`, etc.
- Pas de Redux/Context : tout via `useState` dans les composants fonctions
- **Persistance** : Firebase Firestore (collection `agency/`). Listeners temps réel onSnapshot pour `dailyPlan` et `objectives`.

## Flux de données

```
Carnet Proxad (live) → scraper.py (GitHub Actions, 1h) → src/data.json
  → carnetToContracts() → DEMO_CONTRACTS (module-level)
  → App state (contracts) → merge avec overrides Firestore (vtaResolved, commercial)
  → Composants (DashboardTab, ContractsTab, etc.)
```

## Structure fichiers

```
src/
  App.jsx                          — Orchestrateur : state, Firestore, header, nav, tabs
  data.json                        — Données carnet (scraper output)
  main.jsx                         — Point d'entrée React
  constants/
    vta.js                         — VTA_GROUPS (code → commerciaux)
    jachere.js                     — JACHERE, JACHERE_TALC (secteurs → communes)
    roles.js                       — ROLES, ROLE_COLORS, OPERATORS, OP_COLORS, DEPT_ZONES
  data/
    store.js                       — Firebase config, db, store CRUD, STORAGE_KEYS
    team.js                        — DEMO_TEAM, DEMO_CARS
    contracts.js                   — makeDemoContracts, makeVTAContracts, carnetToContracts, DEMO_CONTRACTS
    gps.js                         — GPS coordonnées communes
  helpers/
    resolution.js                  — resolveVTA(), getPendingResolutions()
    status.js                      — statusColor(), isCaduque()
    carnet.js                      — CARNET_BY_VILLE_MONTH, getTalcC, getC, MONTHLY, MONTHS_ORDER
  components/
    ui.jsx                         — Badge, Card, Btn, Sel, Inp, Modal, StatCard
    DashboardTab.jsx               — KPIs, résolutions, voitures du jour
    TeamTab.jsx                    — Gestion équipe, codes VST, prêts
    CarsTab.jsx                    — Planning voitures, drag-drop, VTA manuelle
    ContractsTab.jsx               — Vues today/week/month/quality/commercial
    MapTab.jsx                     — Carte Leaflet, CommuneHeatmap
    SecteursTab.jsx                — Secteur → commune → rue + heatmap
    ClocheTab.jsx                  — Alertes veille (≥3 contrats)
    ObjectifsTab.jsx               — Objectifs hebdo par commercial
    ImportTab.jsx                  — Import Excel/CSV drag-drop
    CarnetTab.jsx                  — Vue brute données carnet
    SectorAutocomplete.jsx         — Autocompletes secteur/commune
```

## Structures de données clés

### Contrat
```js
{
  id: "f-892555" | "vta-892555",
  commercial: "Djany Legrand",
  date: "2026-03-05",           // YYYY-MM-DD
  heure: "19:48",
  ville: "Nesmy",
  rue: "8 Rue Du Vieux Bourg",
  operator: "Free",
  type: "Fibre",
  box: "ULTRA" | "ULTRA_LIGHT" | "POP",
  status: "Nouveau" | "En attente RDV" | "RDV pris" | "RDV pris J+7" | "Branché" | "Branché VRF" | "Annulé" | "Résilié" | "RIB MANQUANT",
  vstLogin: "vst-xxx",          // si contrat VST
  vtaCode: "vta-xxx",           // si contrat VTA
  vtaResolved: false,           // true une fois attribué au bon commercial
}
```

### Cycle de vie statut (contrats blancs du carnet)
```
etat_commande vide + < 2h  →  "Nouveau"        (compté normalement)
etat_commande vide + ≥ 2h  →  "RIB MANQUANT"   (caduque, exclu des stats)
"inscription ok"            →  "En attente RDV"  (compté)
"vente validée"             →  "RDV pris"        (compté)
"connexion ok"              →  "Branché"          (compté)
"vente abandonnée"          →  "Annulé"           (compté mais négatif)
```

### Membre équipe
```js
{
  id: 1,
  name: "Djany Legrand",
  role: "Manager" | "Assistant Manager" | "Formateur" | "Confirme" | "Debutant",
  operators: ["Free"],
  permis: true, voiture: true, active: true,
  vstCodes: ["vst-dclavereuil"],
  lentCodes: [{ code: "vst-xxx", borrowerId: 5 }],
}
```

### DailyPlan (historisé par date)
```js
{
  "2026-03-09": {                    // clé = date ISO
    carId: {
      members: [1, 2, 3],           // IDs passagers
      memberCommunes: { 1: "BETTON", 2: "LIFFRE" },
      memberVtaCodes: { 1: "vta-zourhalm", 2: "vta-rgrasset" },
      sector: "RENNES 35",
      zoneType: "talc" | "stratygo",
    }
  },
  "2026-03-08": { ... }             // jours précédents conservés
}
```

### Objectifs
```js
{ "2026-03-03": { "Djany Legrand": 8, "Leo Merde": 6 } }  // clé = lundi de la semaine
```

## Domaine métier

- **Commercial** = vendeur terrain chez revendeur Free Télécom (Stratygo ou Agence)
- **Contrat** = abonnement internet souscrit (Free ou Bouygues)
- **VST** (`vst-xxx`) = code vendeur pour les zones **Stratygo**
- **VTA** (`vta-xxx`) = code vendeur pour les zones **TALC**
- VST et VTA ont la **même utilité** (identifier un vendeur), seul le type de zone diffère
- **Jachère** = secteur géographique (ensemble de communes avec potentiel de prises fibre)
- **Stratygo** = zones classiques (Nantes, St Nazaire, Rennes, Fontenay, Roche/Yon, Sables)
- **TALC** = zones VTA (Royan, La Rochelle, Bressuire, Niort)
- **Prise** = foyer raccordable fibre = prospect potentiel
- **Cloche** 🔔 = commercial avec ≥3 contrats la veille

### Résolution VTA (priorités)
1. **Code VTA assigné manuellement** dans le plan voiture (`memberVtaCodes`) → attribution directe
2. **Présence dans le plan** + matching commune → attribution automatique
3. **Ambiguïté** → résolution manuelle via dashboard

### DailyPlan historisé
Le plan voiture est stocké par date. Chaque jour conserve ses propres assignations VTA. Modifier le plan du lendemain n'affecte pas les contrats de la veille.

## Conventions de code

- **`var`** (pas `const/let`) pour les variables locales dans le render — style existant
- **Dates** : format `"YYYY-MM-DD"`, comparées lexicographiquement (`<` et `>`)
- **Clés Firestore** avec suffixe version : `agency-team-v4` — bumper si structure change
- **Fonctions inline** : `function(x){ return ... }` (pas arrow functions)
- **Styles inline** : tout en `style={{ ... }}`, pas de CSS classes
- **Langue** : UI et variables en français, code technique en anglais

## ⚠️ ANTI-PATTERNS — NE JAMAIS FAIRE

```js
// ❌ BUG stale closure — la 2e écrase la 1re avec l'ancienne valeur
setSector(x);
setZoneType(y);

// ✅ Toujours un seul appel combiné via updatePlan
updatePlan({ ...plan, sector: x, zoneType: y });
```

```js
// ❌ Le champ n'existe pas dans les données carnet brutes
row.date

// ✅
row.date_inscription
```

```js
// ❌ [] est truthy — ce check ne fonctionne pas
if (!member.vstCodes) { ... }

// ✅
if (!member.vstCodes || member.vstCodes.length === 0) { ... }
```

```js
// ❌ dailyPlan est historisé par date — accéder par carId directement ne marche plus
dailyPlan[car.id]

// ✅ Extraire le plan du jour d'abord
var _dp = dailyPlan ? (dailyPlan[todayStr] || {}) : {};
_dp[car.id]
```

```js
// ❌ VTA n'est PAS un "code territoire" — c'est un code vendeur
"VTA = territoire de travail"

// ✅ VST et VTA sont tous les deux des codes vendeurs
"VST = code vendeur zones Stratygo, VTA = code vendeur zones TALC"
```

## Git workflow

- Commiter directement sur `main` et push → déploiement automatique
- Ne jamais `push --force` sur main

## Préférences

- Réponses directes, sans "shall we proceed?" ni "voulez-vous que je…"
- Push/déployer sans demander
- Pas de fichiers README/doc sauf si demande explicite
- Pas de commentaires dans le code sauf si demande explicite
