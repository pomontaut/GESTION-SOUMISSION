# Outil sourcing — Demandes de prix soumission

Application web (React + TypeScript + Vite côté client, Express + PostgreSQL côté serveur) pour :
1. importer un PDF de soumission (format CAN) et détecter automatiquement les lots à sourcer à partir des surlignages (jaune = fourniture seule, autre couleur = fourniture et pose) ;
2. gérer les lots, catégories et fournisseurs, et préparer un e-mail groupé (Cci) avec le PDF du lot déjà joint, prêt à ouvrir dans Outlook et à envoyer ;
3. suivre les offres reçues par lot/fournisseur (dashboard) et exporter en CSV/JSON.

Les données (soumissions, fournisseurs, PDF) sont stockées côté serveur dans une base PostgreSQL et partagées entre tous les utilisateurs de l'outil. Il n'y a pas de compte ni de mot de passe : toute personne ayant l'URL peut consulter et modifier les données.

## Développement local

Il faut une base PostgreSQL accessible (locale ou distante).

```bash
npm install
cp .env.example .env   # renseigner DATABASE_URL
npm run dev:all        # lance le frontend (Vite) et l'API (Express) en parallèle
```

Le frontend est servi sur http://localhost:5173 et proxifie les appels `/api` vers le serveur Express sur le port 8787.

Scripts utiles :
- `npm run dev` — frontend seul (Vite)
- `npm run dev:server` — API seule (redémarre automatiquement sur modification)
- `npm run dev:all` — les deux en parallèle

## Build de production

```bash
npm run build          # build du frontend -> dist/
npm run build:server   # compilation du serveur -> server-dist/
npm start               # lance le serveur Express (sert l'API + le frontend buildé)
```

## Déploiement sur Railway

1. Créer un projet Railway et y ajouter un service PostgreSQL (« New » → « Database » → « PostgreSQL »). Railway fournit alors une variable `DATABASE_URL`.
2. Ajouter un service à partir de ce dépôt GitHub (« New » → « GitHub Repo »), sur la branche à déployer.
3. Dans les variables d'environnement du service, référencer `DATABASE_URL` du service PostgreSQL (Railway propose une référence automatique entre services).
4. Build command : `npm run build && npm run build:server`
5. Start command : `npm start`

Railway assigne automatiquement `PORT` ; le serveur l'utilise tel quel.

## Méthode de détection des lots

Voir l'onglet « Annexe — Méthode de détection » dans l'application.
