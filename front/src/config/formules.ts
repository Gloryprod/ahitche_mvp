// Formules affichées sur l'accueil (vitrine). Les prix doivent rester identiques au référentiel en base :
// back/src/scripts/createFormules.js. Toute modification de prix se fait aux deux endroits.

export interface FormuleVitrine {
  emoji: string
  nom: string // Ex : "AHI ESSENTIEL"
  cible: string // Ex : "1 personne · par mois"
  accroche: string
  repas: string // Ex : "20–30"
  heures: string // Ex : "2–4h"
  ancienPrix: number
  prix: number // Prix de vente en FCFA
  recommandee?: boolean
}

// Formules ouvertes au lancement
export const FORMULES: FormuleVitrine[] = [
  { emoji: '🌿', nom: 'AHI ESSENTIEL', cible: '1 personne · par mois', accroche: 'Un suivi alimentaire simple, pour commencer.', repas: '20–30', heures: '2–4h', ancienPrix: 24000, prix: 10800 },
  { emoji: '🌾', nom: 'AHI ÉQUILIBRÉ', cible: '2–3 personnes · par mois', accroche: 'Mieux manger sans compliquer votre quotidien.', repas: '35–50', heures: '4–6h', ancienPrix: 50000, prix: 22500, recommandee: true },
  { emoji: '👑', nom: 'AHI CONFORT', cible: 'Famille 4–6 · par mois', accroche: 'Un ravitaillement complet, pensé pour toute la famille.', repas: '60–90', heures: '6–10h', ancienPrix: 110000, prix: 50300 },
]

// Prix de la formule la moins chère, repris dans le hero (« dès … FCFA »)
export const PRIX_D_APPEL = Math.min(...FORMULES.map(f => f.prix))

// 17 produits de base ; les quantités varient selon la formule et ne sont pas affichées
export const PRODUITS_INCLUS = [
  "Riz local", "Haricots", "Coquillettes", "Spaghetti",
  "Couscous", "Gari", "Tapioca", "Farine de maïs", "Huile végétale",
  "Tomates", "Oignons", "Sucre", "Lait concentré",
  "Œufs", "Épices Ahitché", "Assaisonnement", "Huile de palme"
]

// Produits absents de la formule AHI Essentiel
export const EXCLUS_ESSENTIEL = ['Huile de palme']

// Montant en FCFA avec espaces de milliers (« 10 800 »)
export const formaterPrix = (montant: number) => montant.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
