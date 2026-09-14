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
  `)
}
