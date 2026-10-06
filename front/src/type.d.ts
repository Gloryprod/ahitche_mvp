export interface Client {
  _id: string
  quartier: string,
  adresse: string,
  formuleHabituelle: string,
  telephone:string,
  username: string
  email: string
}

interface Commande {
  id: string
  userId: string | null
  clientName: string
  whatsapp: string
  formule: 'AHI ESSENTIEL' | 'AHI EQUILIBRE' | 'AHI CONFORT' | 'AHI RESERVE' | 'AHI FRAÎCHEUR'
  total: number
  prixFormule: number | null
  montantExtras: number
  remise: { montant: number; motif: string; statut: 'Aucune' | 'À valider' | 'Validée' | 'Refusée' }
  date: string
  formuleSlug: string
  modePaiement: 'Mobile Money' | 'Espèces' | 'Acompte'
  notes: string
  statut: import('@/config/commandes').StatutCommande
  productsSnapshot: ProductSnapshot[]
  deletedAt: Date
  dateLivraison: Date
  reference: string
  zone: string | null
  creneau: { date: string | null; periode: 'Matin' | 'Après-midi' | null }
  livreurId: string | null
  paiement: { statut: 'En attente' | 'Payé'; reference: string; note: string; date: string | null }
  enRetard: boolean
  compensation: { statut: 'Aucune' | 'À appliquer' | 'Appliquée'; motif: string }
  compensationRecue: { reference: string; motif: string }
}

export interface Category {
  _id: string
  name: string,
  description: string,
  active: boolean,
}

export interface CompositionRule {
  _id: string
  name: string
  multiplierEquilibre: number | null // Libellé seulement (D-14) ; vide possible
  multiplierConfort: number | null
  description?: string
  createdAt?: string
}

export type PackType = 'essentiel' | 'equilibre' | 'confort' | 'reserve' | 'fraicheur'

export interface Product {
  _id: string
  reference: string | null
  name: string
  category: Category | null
  compositionRule: CompositionRule | null // Libellé seulement (les quantités par pack font foi)
  type: 'base fixe' | 'extra'
  statut: 'disponible' | 'indisponible'
  quantites: Record<PackType, number | null> // Vide = absent du pack
  unit: string
  priceUnit: number | null // Vide = à renseigner
  seuilAlerte: number | null
  commentaire: string
}

export interface Formule {
  _id: string;
  slug: 'ahi-essentiel' | 'ahi-equilibre' | 'ahi-confort';
  nom: string;
  emoji: string;
  cible: string;
  phraseAccroche: string; // Vide : à valider (D-05)
  promesse: string;
  foyersCibles: string;
  logiqueCommande: string;
  changementsMax: number | null;
  variationQuantitePct: number | null;
  cycleJours: number;
  bientotDisponible: boolean;
  estimationRepas: { min: number | null; max: number | null };
  heuresEconomisees: { min: number | null; max: number | null };
  prixActuel: number | null;  // Prix affiché du référentiel v4 ; vide = à définir (Fraîcheur)
  prixCommercial: number | null;  // Valeur personnalisée définie par l'admin
  estRecommandee: boolean;
  statut: 'actif' | 'inactif';
  lienWhatsApp: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductItem {
  productId: string;
  reference: string | null;
  name: string;
  category: string;
  regle: string;
  unit: string;
  priceUnit: number | null; // Vide = prix à renseigner
  quantity: number;
  totalPrice: number | null;
  indisponible: boolean;
  commentaire: string;
}

export interface ProductSnapshot {
  orderId: string;
  productId: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number | null;
  totalPrice: number | null;
  isExtra: boolean; 
}

export type TypePrestataire = 'Fournisseur' | 'Livreur' | 'Autre'

export interface Prestataire {
  _id: string
  nom: string
  type: TypePrestataire
  telephone: string
  quartier: string
  ifuRccm: string
  modePaiement: 'Mobile Money' | 'Espèces' | 'Virement' | 'Chèque'
  notes: string
  actif: boolean
}

// Commande vue par la Logistique (GET /api/admin/logistique)
export interface CommandeTerrain {
  id: string
  reference: string
  statut: import('@/config/commandes').StatutCommande
  formule: string
  total: number
  modePaiement: 'Mobile Money' | 'Espèces' | 'Acompte'
  client: { nom: string; telephone: string; quartier: string; adresse: string; lienLocalisation: string }
  zone: { code: string; nom: string; commune: string; prioritaire: boolean } | null
  creneau: { date: string | null; periode: 'Matin' | 'Après-midi' | null }
  livreur: { _id: string; nom: string; telephone: string } | null
  produits: { nom: string; quantite: number; unite: string }[]
  compensationRecue: { reference: string; motif: string } | null
  enRetard: boolean
}

export interface ZoneLivraison {
  _id?: string
  code: string
  commune: string
  nom: string
  quartiers: string[]
  prioritaire: boolean
  tarifCourse: number
  actif: boolean
}

// --- Finances ---
export interface LigneBudget {
  _id: string
  code: string
  libelle: string
  montantPrevuUsd: number
  montantPrevuFcfa: number
  categorieAd: 1 | 2 | null // Catégorie de la convention : pièces exigées
  passation: string
  engageFcfa: number // Payé (réel) + prévu non payé
  payeFcfa: number
  justifieFcfa: number // Payé et retenu pour l'audit (pièces complètes)
  justifieUsd: number
  resteFcfa: number
  depassementFcfa: number // Alerte sans blocage (D-20)
  nbDepenses: number
  tauxExecution: number // Engagé / prévu
  tauxJustifie: number
}

export interface Justificatif {
  _id: string
  nom: string
  format: string
  typePiece: string
  taille: number
  televerseLe: string
}

export interface Depense {
  _id: string
  categorie: 'Budget' | 'Exploitation'
  referenceLigne: string
  typeExploitation: 'Achat stock' | 'Livraison' | 'Compensation' | 'Autre' | null
  libelle: string
  partenaireId: { _id: string; nom: string; type: string } | null
  lotStockId: string | null
  montantPrevuUsd: number | null // Vide : non fixé avant l'achat
  montantPrevuFcfa: number | null
  numeroPiece: string
  numeroAutorisation: string
  sousLigne: string
  modePaiement: string
  detailPaiement: string
  referencePaiement: string
  sourceFinancement: string
  moisProjet: string // M1… : mois du projet (du 26 au 25)
  categorieAd: 1 | 2 | null
  piecesManquantes: string
  fichiersAttendus: string[]
  commentaire: string
  pieces: { attendues: string[]; facultatives: string[]; presentes: string[]; manquantes: string[] }
  horsPeriode: boolean
  montantReelUsd: number
  montantReelFcfa: number
  tauxApplique: number
  estEffectue: boolean
  estValidePourAudit: boolean
  datePaiement: string | null
  urlPieceJointe: string | null // Ancien lien public (avant le stockage privé) : pièce à téléverser de nouveau
  justificatifs: Justificatif[]
  creePar: { username: string } | null
  createdAt: string
}

export interface ClotureMois {
  mois: string
  du: string
  au: string
  close: boolean
  engageFcfa: number
  nbDepenses: number
  historique: { action: 'Clôture' | 'Réouverture'; le: string; motif: string; par?: { username: string } }[]
}

export interface SyntheseFinances {
  periode: { du: string; au: string }
  exploitation: {
    encaissements: { total: number; nombreLivraisons: number; parMode: { mode: string; total: number; nombre: number }[] }
    coutLivraison: number
    depenses: Record<'Achat stock' | 'Livraison' | 'Compensation' | 'Autre', { paye: number; aPayer: number }>
    marge: number
    livraisonsEnRetard: number
  }
  budget: {
    prevuFcfa: number
    prevuUsd: number
    engageFcfa: number
    justifieFcfa: number
    justifieUsd: number
    soldeFcfa: number
    absorption: number
    parMois: { mois: string; engageFcfa: number }[]
    sansMois: number
    alertes: { type: 'depassement' | 'horsPeriode'; ligne: string; montantFcfa: number; message: string }[]
  }
  taux: number
}
