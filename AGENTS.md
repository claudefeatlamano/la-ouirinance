# AGENTS.md - Dashboard La Ouirinance

## Board agence (etat + reste a faire)

Source de verite unique du projet agence (bot + dashboard) : `C:\Users\hnoua\Desktop\Cerveau\Large Memory\wiki\projects\Agence — Board.md`.
Quand Hamid dit "je travaille sur le projet de l'agence" (ou /agence) : lis le board et sors-lui "Ou on en est" + "Reste a faire". Inscris-toi dans "En cours", et mets le board a jour apres chaque tache significative.

## Contexte obligatoire

Avant de modifier ce repo, lire :

1. `C:\Users\hnoua\Desktop\Cerveau\Large Memory\wiki\projects\Agence — Board.md`
2. `C:\Users\hnoua\Desktop\Cerveau\CURRENT.md`
2. `C:\Users\hnoua\Desktop\Cerveau\Large Memory\wiki\projects\La Ouirinance.md`
3. `C:\Users\hnoua\Desktop\Cerveau\Large Memory\wiki\projects\La Ouirinance - Multi-agence v1.md`
4. `C:\Users\hnoua\Desktop\Cerveau\Large Memory\wiki\projects\Dashboard la-ouirinance.md`

## Contrat architecture actif

La centralisation v1 est active.

- `src/data/agencyConfig.js` est la source centrale pour `agencyId`, `agencyName`, collection Firestore et `STORAGE_KEYS`.
- Ne pas utiliser directement `doc(db, "agency", ...)`.
- Ne pas recreer `STORAGE_KEYS` dans un autre fichier.
- Toute nouvelle cle Firestore ou donnee specifique agence doit passer par `AGENCY_CONFIG`.
- Le dashboard et le bot sont deux sous-projets du meme ecosysteme `La Ouirinance`.

## Verification

```bash
npm run test:agency-config
npm run build
```

## Regles

- Ne pas afficher de secrets.
- Ne pas contourner `AGENCY_CONFIG` pour aller plus vite.
- Mettre a jour le Cerveau pour toute decision durable.
