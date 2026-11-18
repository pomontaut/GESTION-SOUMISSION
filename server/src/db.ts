import { Pool } from 'pg'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set')
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
})

export async function initSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      data JSONB NOT NULL,
      pdf_file_name TEXT,
      pdf_data BYTEA
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS offer_files (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      content_type TEXT NOT NULL,
      file_data BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- CFC/chapter codes are standardized by the CAN legend, not project-specific - "chapter 172
    -- under CFC 211.5" means the same thing on every submission. Whenever a supplier is added by
    -- hand to a lot (because automatic category/supplier matching missed it), we remember that
    -- pairing here so the next submission with the same CFC+chapter proposes it automatically.
    CREATE TABLE IF NOT EXISTS lot_supplier_learnings (
      id TEXT PRIMARY KEY,
      cfc_code TEXT NOT NULL,
      chapter_code TEXT NOT NULL,
      supplier_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (cfc_code, chapter_code, supplier_id)
    );

    -- Same idea keyed on the lot's normalized wording (title without its code): a bureau may number
    -- the same work differently (R898 vs 814...), but "essai de resistance a la compression" stays
    -- the same text - so a manual pick also generalizes to other submissions via the title.
    CREATE TABLE IF NOT EXISTS lot_supplier_title_learnings (
      id TEXT PRIMARY KEY,
      title_key TEXT NOT NULL,
      supplier_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (title_key, supplier_id)
    );

    -- Chat avec l'agent : historique partagé, et consignes d'amélioration (règles formulées par
    -- l'équipe) réinjectées dans le prompt de l'agent de chat et de l'agent TCO à chaque appel.
    CREATE TABLE IF NOT EXISTS agent_chat_messages (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS agent_consignes (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL DEFAULT 'general',
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Règle exécutable (JSON) : appliquée automatiquement par runLotAgent / « Appliquer aux lots ».
    -- NULL = consigne en texte libre (réinjectée seulement dans les prompts des agents).
    ALTER TABLE agent_consignes ADD COLUMN IF NOT EXISTS rule JSONB;
  `)

  // Mémoire de l'agent : méthode de construction de la grille de référence (Brodbeck). Id fixe =
  // posée une seule fois, jamais dupliquée ; supprimable depuis l'onglet « Chat agent ».
  await pool.query(
    `INSERT INTO agent_consignes (id, scope, text) VALUES ($1, 'general', $2) ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text`,
    [
      'methode-grille-brodbeck',
      "RÈGLE PRIORITAIRE : à l'import d'une soumission (PDF), tu produis TOUJOURS toi-même les lots et le matching fournisseurs à partir du PDF, sans jamais demander de grille Excel ; la grille n'est qu'exceptionnelle (correction manuelle a posteriori), ne la réclame ni ne la suggère. Méthode de la grille de référence « 26-553 Brodbeck Roulet – Ernest Bloch » (format CAN / article), exemple à REPRODUIRE automatiquement pour toute future consultation : " +
        "(1) la grille est un tableau Excel avec les FOURNISSEURS en lignes (nom en colonne B) et, en colonnes, les N° DE PAGES du PDF de soumission où figurent les positions surlignées (ex. 1, 5, 8, 12, 29à30…) ; un « X » = ce fournisseur est consulté pour cette page. " +
        "(2) Un LOT = un groupe de fournisseurs consultés sur exactement les mêmes pages (ils reçoivent la même demande) ; les pages du lot sont les colonnes cochées, page 1 (garde) comprise ; le lot 1 est celui du premier fournisseur de la grille. " +
        "(3) Les fournisseurs sont choisis par métier/catégorie en face de chaque famille d'articles CAN (revêtements bitumineux : Colas, Scrasa, Asfalsa, SAPA, WALO ; matériaux/canalisations : HGC, GETAZ, CHALLANDE, etc.), pas par chapitre isolé : une même page peut donc figurer dans plusieurs lots. " +
        "(4) Pour une nouvelle consultation sans grille, propose les fournisseurs par article/page selon la même logique (catégorie du métier ↔ positions surlignées) et regroupe ceux qui ont les mêmes pages.",
    ],
  )
}
