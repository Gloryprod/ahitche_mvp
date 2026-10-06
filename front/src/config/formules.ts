// Formules affichées sur l'accueil (vitrine). Les prix doivent rester identiques au référentiel en base :
// back/src/scripts/createFormules.js. Toute modification de prix se fait aux deux endroits.

export interface FormuleVitrine {
  emoji: string
  nom: string // Ex : "AHI ESSENTIEL"
  cible: string // Ex : "1 personne · par semaine" (référentiel packs v4)
  accroche: string
  repas: string // Ex : "20–30"
  heures: string // Ex : "2–4h"
  prix: number // Prix de vente en FCFA, par semaine (D-02 ; aucun prix barré, D-03)
  foyer: TailleFoyer // Taille de foyer pour laquelle la formule est conseillée
  recommandee?: boolean
}

// Tailles de foyer du comparateur de l'accueil
export type TailleFoyer = '1' | '2-3' | '4-6'
export const TAILLES_FOYER: { valeur: TailleFoyer; libelle: string }[] = [
  { valeur: '1', libelle: '1 personne' },
  { valeur: '2-3', libelle: '2–3 personnes' },
  { valeur: '4-6', libelle: '4–6 personnes' },
]

// Formules ouvertes au lancement : cibles, accroches, repas et heures du référentiel packs v4 (cycle d'une semaine)
export const FORMULES: FormuleVitrine[] = [
  { emoji: '🌿', nom: 'AHI ESSENTIEL', cible: '1 personne · par semaine', accroche: 'Les bases de votre semaine déjà organisées.', repas: '20–30', heures: '2–4h', prix: 10800, foyer: '1' },
  { emoji: '🌾', nom: 'AHI ÉQUILIBRÉ', cible: 'Couples et familles actives · par semaine', accroche: 'Mieux manger sans compliquer votre quotidien.', repas: '35–50', heures: '4–6h', prix: 22500, foyer: '2-3', recommandee: true },
  { emoji: '👑', nom: 'AHI CONFORT', cible: 'Familles établies · par semaine', accroche: 'Votre cuisine organisée sans stress.', repas: '60–90', heures: '6–10h', prix: 50300, foyer: '4-6' },
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
