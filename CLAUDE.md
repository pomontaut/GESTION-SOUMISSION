# GESTION-SOUMISSION

Outil interne INDUNI de sourcing pour les demandes de prix soumission (React/Vite + Express/PostgreSQL, sans authentification, données partagées). Voir `README.md` pour l'architecture, le déploiement Railway et le schéma de données.

## Agent dédié : lots-fournisseurs

Ce projet a un sous-agent spécialisé, `.claude/agents/lots-fournisseurs.md`, expert de la détection de lots dans les PDF de soumission (format CAN) et de l'association des fournisseurs par catégorie/nature. C'est la mémoire du domaine métier accumulée sur ce projet (méthode de surlignage, quirks par bureau d'ingénieurs, règle nature ↔ prestation) - **toujours l'invoquer en priorité**, plutôt que de raisonner de zéro, pour toute tâche touchant :

- la détection de lots dans un PDF de soumission (`src/pdf/analyze.ts`), y compris déboguer un cas où elle ne correspond pas à l'analyse manuelle de l'utilisateur ;
- l'association fournisseurs ↔ lot (`src/data/matching.ts`, `src/data/categorize.ts`, `src/data/suppliersSeed.json`) ;
- la validation de la détection/du matching contre de nouveaux documents réels (PDF de soumission, Grilles Excel de suivi manuel des acheteurs).

Quand l'utilisateur fournit de nouveaux PDF/Excel réels (soumissions, Grilles de suivi), c'est cet agent qui doit les analyser - pas une analyse ad hoc dans la conversation principale. Les corrections qu'il propose sur `analyze.ts` doivent rester des règles générales motivées par un cas réel (jamais un correctif pour un seul document) et être revalidées sur l'ensemble des documents de test disponibles avant d'être appliquées, pour ne jamais régresser les cas de référence déjà confirmés manuellement par l'utilisateur (actuellement : Trelex et Clos du Midi, voir historique du projet).
