import type { StatutCommande } from '@/config/commandes'

// Codes VIP et achats libres VIP, en miroir de back/src/services/achatLibreService.js, back/src/controllers/VipController.js
// et du chiffrage (back/src/controllers/admin/OrderController.js). Le serveur fait foi : ces valeurs guident seulement
// la saisie et l'affichage.

export const NOM_ACHAT_LIBRE = 'Achat libre VIP'

// Commande d'un compte VIP : 50 produits, 10 demandes libres, note de 500 caractères au plus
export const MAX_LIGNES = 50
export const MAX_DEMANDES = 10
export const DESIGNATION = { min: 2, max: 120 }
export const QUANTITE_DEMANDE_MAX = 60 // Quantité d'une demande libre, en texte (« 2 tas », « 1 sachet »)
export const NOTE_MAX = 500

// Chiffrage par l'admin : motif d'un retrait, statuts où les demandes se modifient encore (avant le départ en livraison)
export const MOTIF_RETRAIT = { min: 3, max: 300 }
export const STATUTS_CHIFFRABLES: readonly StatutCommande[] = ['En attente', 'Confirmée', 'En préparation', 'Échec']

// Codes : 4 à 30 caractères (lettres, chiffres, tirets), plafond d'un code partagé, libellé
export const FORMAT_CODE = '[A-Za-z0-9][A-Za-z0-9\\-]{3,29}' // Attribut pattern du champ (le serveur met en majuscules)
export const PLAFOND_MAX = 10000
export const LIBELLE_CODE_MAX = 80

// Demande libre d'un achat libre : sans prix tant que l'admin ne l'a pas chiffrée ; une demande retirée ne compte plus
export interface DemandeLibre {
  _id: string
  designation: string
  quantite: string
  prix: number | null
  retiree: boolean
  motif?: string // Motif du retrait : renvoyé à l'équipe seulement
}

// Produit du catalogue VIP (GET /api/auth/vip/catalogue et /api/admin/commandes/achat-libre/catalogue) : prix VIP
// seulement, jamais le prix du catalogue
export interface ProduitVip {
  productId: string
  reference: string | null
  nom: string
  unite: string
  famille: 'P' | 'V'
  prixVip: number
  pas: number // 0,5 pour kg et L, 1 sinon
  maximum: number
}

// Prix d'une demande libre fixé à la saisie par l'admin : FCFA, 0 ou plus (le serveur fait foi)
export const MAX_PRIX_DEMANDE = 10000000

// Ligne d'un achat libre telle que le client la voit (prix VIP)
export interface LigneAchatLibre {
  nom: string
  quantite: number
  unite: string
  prixUnitaire: number
  total: number // Peut être décimal (prix VIP × 1,5 kg) : seul le total de la commande est arrondi
}

export const estAchatLibre = (commande?: { typeCommande?: string | null } | null) => commande?.typeCommande === 'achat-libre'

export type EtatDemande = 'chiffree' | 'a-chiffrer' | 'retiree'
export const etatDemande = (d: Pick<DemandeLibre, 'prix' | 'retiree'>): EtatDemande =>
  d.retiree ? 'retiree' : d.prix === null || d.prix === undefined ? 'a-chiffrer' : 'chiffree'
export const nombreAChiffrer = (demandes?: DemandeLibre[]) => (demandes ?? []).filter(d => etatDemande(d) === 'a-chiffrer').length

// Montants et quantités à la française : décimales seulement quand il y en a (« 787,5 F », « 1,5 kg »)
export const formaterFrancs = (montant: number) => `${montant.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} F`
export const formaterQuantite = (quantite: number) => quantite.toLocaleString('fr-FR', { maximumFractionDigits: 2 })

// « 1,5 kg », « 3 unités », « 2 × 500 g » : symboles invariables, mots au pluriel à partir de 2, unité chiffrée multipliée
// Écrans des clients : l'unité monétaire s'écrit en entier (« 787,5 FCFA »)
export const formaterFcfa = (montant: number) => `${montant.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA`

const SYMBOLES = ['kg', 'g', 'l', 'cl', 'ml']
export function quantiteEtUnite(quantite: number, unite: string): string {
  const q = formaterQuantite(quantite)
  const u = (unite || '').trim()
  if (!u) return q
  if (/^\d/.test(u)) return `${q} × ${u}`
  if (SYMBOLES.includes(u.toLowerCase()) || quantite < 2 || /[sx]$/i.test(u)) return `${q} ${u}`
  return `${q} ${u}s`
}
