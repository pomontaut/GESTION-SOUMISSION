/** Résultat structuré produit par l'agent acheteur (outil `emettre_tco`), côté serveur et client. */
export type Nature = 'F' | 'C' | 'H'

export interface Parametre {
  libelle: string
  valeur: number
  format: 'chf' | 'pct' | 'nombre'
  source: string
  nature: Nature
}

export interface PositionOffre {
  pos: string
  article: string
  produit: string
  /** Matériau / lot de regroupement (ex. « Laine de roche », « EPS »). */
  lot: string
  caracteristiques: string
  quantite: number
  unite: string
  conditionnement: string
  prix_brut: number
  /** Supplément en fraction (0,0549 = 5,49 %) : renchérissement, énergie, taxe… */
  supplement_pct: number
}

export interface TransportOffre {
  seuil_franco: number | null
  surtaxe_sous_seuil: number
  /** Supplément transport en fraction de la valeur nette (0,0095 = 0,95 %). */
  pct_valeur: number
  fixe: number
  source: string
}

export interface OffreTco {
  fournisseur: string
  offre_ref: string
  date_offre: string
  /** Rabais global en fraction (0 si aucun). */
  rabais_pct: number
  /** false si l'offre ne couvre qu'une partie du besoin. */
  complet: boolean
  positions: PositionOffre[]
  transport: TransportOffre
}

export interface ScenarioTco {
  nom: string
  complet: boolean
  parts: { fournisseur: string; lots: string[] }[]
  remarque: string
}

export interface TcoResult {
  titre: string
  chantier: string
  demandeur: string
  taux_tva: number | null
  tva_source: string
  budget_total: number | null
  parametres: Parametre[]
  offres: OffreTco[]
  scenarios: ScenarioTco[]
  conditions: {
    critere: string
    valeurs: { fournisseur: string; valeur: string; alerte: boolean }[]
  }[]
  points_a_clarifier: { gravite: 'Bloquant' | 'Majeur' | 'Mineur'; texte: string }[]
  hypotheses: string[]
  recommandation: string
}
