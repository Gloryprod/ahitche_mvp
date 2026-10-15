// Formules affichées sur l'accueil (vitrine). Les prix doivent rester identiques au référentiel en base :
// back/src/scripts/createFormules.js. Toute modification de prix se fait aux deux endroits.

export interface FormuleVitrine {
  slug: string // Identifiant en base (valeur estimée servie par l'API)
  emoji: string
  nom: string // Ex : "AHI ESSENTIEL"
  cible: string // Ex : "1 personne · par mois" (référentiel packs v4, un pack couvre un mois)
  accroche: string
  repas: string // Ex : "20–30"
  heures: string // Ex : "2–4h"
  prix: number // Prix de vente en FCFA, par mois (un pack couvre un mois) ; le prix barré (valeur estimée, D-03) vient de l'API
  foyer: TailleFoyer // Taille de foyer pour laquelle la formule est conseillée
  recommandee?: boolean
  teinte: TeinteFormule // Couleur de la carte, pour distinguer les packs d'un coup d'œil
  niveau: 1 | 2 | 3 // Niveau de confort (jauge de la carte)
}

// Couleurs des cartes, dans la charte : savane clair (entrée), forêt (cœur de gamme), noir et or (premium)
export type TeinteFormule = 'savane' | 'foret' | 'or'

// Tailles de foyer du comparateur de l'accueil
export type TailleFoyer = '1' | '2-3' | '4-6'
export const TAILLES_FOYER: { valeur: TailleFoyer; libelle: string }[] = [
  { valeur: '1', libelle: '1 personne' },
  { valeur: '2-3', libelle: '2–3 personnes' },
  { valeur: '4-6', libelle: '4–6 personnes' },
]

// Formules ouvertes au lancement : cibles, accroches, repas et heures du référentiel packs v4, donnés pour un mois
export const FORMULES: FormuleVitrine[] = [
  { slug: 'ahi-essentiel', emoji: '🌿', nom: 'AHI ESSENTIEL', cible: '1 personne · par mois', accroche: 'Les bases de votre mois déjà organisées.', repas: '20–30', heures: '2–4h', prix: 10800, foyer: '1', teinte: 'savane', niveau: 1 },
  { slug: 'ahi-equilibre', emoji: '🌾', nom: 'AHI ÉQUILIBRÉ', cible: 'Couples et familles actives · par mois', accroche: 'Mieux manger sans compliquer votre quotidien.', repas: '35–50', heures: '4–6h', prix: 22500, foyer: '2-3', recommandee: true, teinte: 'foret', niveau: 2 },
  { slug: 'ahi-confort', emoji: '👑', nom: 'AHI CONFORT', cible: 'Familles établies · par mois', accroche: 'Votre cuisine organisée sans stress.', repas: '60–90', heures: '6–10h', prix: 50300, foyer: '4-6', teinte: 'or', niveau: 3 },
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

// Animation de la liste des produits de base (section Formules) : les produits défilent par groupes, en boucle.
// Ajouter un produit à PRODUITS_INCLUS suffit : les groupes se recalculent. Sans animation (réglage du téléphone
// « réduire les animations »), la liste complète s'affiche.
export type EffetProduits = 'fondu' | 'glissement' | 'cascade'
export const ANIMATION_PRODUITS = {
  effet: 'cascade' as EffetProduits, // fondu : apparition douce ; glissement : arrive par le bas ; cascade : produit par produit
  produitsParGroupe: 6,
  affichageMs: 3500, // Temps pendant lequel un groupe reste à l'écran
  transitionMs: 500, // Durée de l'apparition et de la disparition
}

// Montant en FCFA avec espaces de milliers (« 10 800 »)
export const formaterPrix = (montant: number) => montant.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
