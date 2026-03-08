# La Ouirinance — CLAUDE.md

## Commandes

```bash
npm run dev      # dev server → localhost:5173
npm run build    # build prod
git push origin main  # → GitHub Actions → scrape + build + deploy Pages (automatique)
```

## Architecture

- **Mono-fichier** : `src/App.jsx` (~4900 lignes). Ne pas splitter sans demande explicite.
- `src/data.json` — données carnet scrappées par `scraper.py`, baked into build
- `.github/workflows/scrape.yml` — scrape + build + deploy toutes les heures + sur push main
- Pas de router : navigation via state `tab` (onglets) + sous-états `view`, `selectedCom`, etc.
- Pas de Redux/Context : tout via `useState` dans les composants fonctions

## Structure de App.jsx (lignes clés)

```
L.1–7      STORAGE_KEYS, imports
L.7–152    VTA_GROUPS, VTA_PERSON_MAP, helpers VTA
L.152–226  JACHERE, JACHERE_TALC (secteurs → communes)
L.227–1321 DEMO_TEAM, DEMO_CARS, makeDemoContracts, makeVTAContracts
L.1322–1407 carnetToContracts() — mapping carnet brut → contrats app
L.1408      DEMO_CONTRACTS (source de données principale)
L.1524      export default function App() — composant racine
L.1525–1534 States globaux : tab, team, cars, contracts, objectives, dailyPlan, groups
L.1590      Poll Flask local (60s)
L.1704      Barre de navigation (tabs)
L.1733      DashboardTab
L.1912      TeamTab — states internes L.1913+
L.2445–2521 SectorAutocomplete, CommuneAutocomplete (composants standalone)
L.2523      CarsTab — states internes L.2525+
L.2920      ContractsTab — states internes L.2921+
L.2934      Helpers partagés (comColor, topComs, isBrC, isRdC, isAnC…)
L.3001–3033 Calculs dates partagés (todayStr, wkStartStr, moStartStr, todayC/weekC/monthC)
L.3034      Vues détail : today / week / month / quality / commercial
L.3509      view === "commercial" (Récap Commercial)
L.3803      Vue overview ContractsTab (liste principale + filtres)
L.4016–4045 MONTHS_ORDER, _ML_KEYS, MONTHS_LABELS, MONTH_KEY_MAP
L.4047      MapTab
L.4134      SecteursTab (3 niveaux navigation)
L.4426      ClocheTab
L.4532      ObjectifsTab
L.4741      ImportTab
L.4828      CarnetTab
```

## Conventions de code

- **`var`** (pas `const/let`) pour les variables locales dans le render — style existant
- **Dates** : format `"YYYY-MM-DD"`, comparées lexicographiquement (`<` et `>`)
- **Clés localStorage** avec suffixe version : `agency-team-v4` — bumper si structure change
- **Fonctions inline** : `function(x){ return ... }` (pas arrow functions) — style existant
- **Styles inline** : tout en `style={{ ... }}`, pas de CSS classes

## Helpers statuts contrat (définis L.3511–3513, dans ContractsTab)

```js
isBrC(c)  // Branché ou Branché VRF
isRdC(c)  // RDV pris ou RDV pris J+7
isAnC(c)  // Annulé ou Résilié
// "En attente RDV" = ni branché, ni rdv, ni annulé
```

## Valeurs box (PAS d'espaces)

`"ULTRA"` | `"ULTRA_LIGHT"` | `"POP"`

## Constantes clés (module-level, hors composants)

- `VTA_GROUPS` L.7 : `{ "vta-xxx": ["Nom Prénom", ...] }` — code VTA → commerciaux
- `JACHERE` L.152 / `JACHERE_TALC` L.173 : secteur → `{ communes: [...] }`
- `STORAGE_KEYS` L.4 : toutes les clés localStorage
- `MONTHS_ORDER` L.4018 : array `["mar25","avr25",…]` de mar 2025 à mois courant
- `_ML_KEYS` L.4016 : `["jan","fev","mar","avr","mai","jun","jul","aou","sep","oct","nov","dec"]`
- `DEMO_CONTRACTS` L.1408 : source unique de vérité pour les contrats (live carnet ou demo)

## ⚠️ ANTI-PATTERNS — NE JAMAIS FAIRE

```js
// ❌ BUG stale closure — la 2e écrase la 1re avec l'ancienne valeur
setSector(x);
setZoneType(y);

// ✅ Toujours un seul appel combiné
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

## Domaine métier (résumé)

- **Commercial** = vendeur terrain chez revendeur Free Télécom
- **Contrat** = abonnement internet souscrit (Free ou Bouygues)
- **VST** = login réseau Free (`vst-xxx`) → mappe vers nom commercial via carnetToContracts
- **VTA** = territoire de travail terrain (`vta-xxx`) → mappe vers commercial via VTA_GROUPS
- **Jachère** = secteur géographique (Stratygo = classique, TALC = territoire VTA spécifique)
- **TALC** = mode terrain avec codes VTA assignés automatiquement par personne

## Git workflow

- Développer dans un worktree `.claude/worktrees/<branch>/src/App.jsx`
- Merger dans `main` et push → déclenche déploiement automatique
- Ne jamais `push --force` sur main

## Préférences

- Réponses directes, sans "shall we proceed?" ni "voulez-vous que je…"
- Push/déployer sans demander
- Pas de fichiers README/doc sauf si demande explicite
- Pas de commentaires dans le code sauf si demande explicite
