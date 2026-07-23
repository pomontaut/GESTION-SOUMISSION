# Outil sourcing — Demandes de prix soumission

Application web (React + TypeScript + Vite) pour :
1. importer un PDF de soumission (format CAN) et détecter automatiquement les lots à sourcer à partir des surlignages (jaune = fourniture seule, autre couleur = fourniture et pose) ;
2. gérer les lots, catégories et fournisseurs, et générer un e-mail groupé (Cci) avec le PDF du lot ;
3. suivre les offres reçues par lot/fournisseur (dashboard) et exporter en CSV/JSON.

Toutes les données (soumissions, fournisseurs, PDF) restent stockées localement dans le navigateur (IndexedDB) — rien n'est envoyé à un serveur.

## Développement

```bash
npm install
npm run dev
```

## Build de production

```bash
npm run build
npm run preview   # pour tester le build localement
```

Le résultat est un site 100% statique dans `dist/`, déployable tel quel sur n'importe quel hébergeur statique (GitHub Pages, Netlify, Vercel, etc.).

## Méthode de détection des lots

Voir l'onglet « Annexe — Méthode de détection » dans l'application.
