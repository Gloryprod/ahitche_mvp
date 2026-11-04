// Formules affichées sur l'accueil (vitrine).
// Prix : le site affiche le prix de vente de la base (écran « Formules et prix » de l'admin), reçu avec les contenus
// du site (services/contenuSite.ts). Le prix écrit ici n'est plus qu'une valeur de secours (API muette, formule sans
// prix en base) et la réserve de place du prix d'appel du haut de l'accueil : il reste identique au référentiel
// (back/src/scripts/createFormules.js).
// Textes des cartes (cible, accroche, repas, heures, foyer, formule recommandée) : modifiables dans l'écran
// « Site public » ; ceux du code servent tant que rien n'est publié. Nom, emoji, teinte, niveau, ordre des cartes et
// produits restent ici. FORMULES est un tableau réactif : il suit les valeurs publiées dès leur arrivée.
import { computed, reactive } from 'vue'
import { fusionnerTextesFormules, lirePrix, type Foyer, type TextesFormules } from '@/services/valeursSite'

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

// Couleurs des cartes : savane clair (entrée), forêt (cœur de gamme), bleu marine et or (premium, hors charte)
export type TeinteFormule = 'savane' | 'foret' | 'marine'

// Jauge « niveau de confort » des cartes (hors charte, choisie pour se lire sur les trois en-têtes) :
// une couleur par barre, du vert à l'orange ; les barres non atteintes restent grises
export const COULEURS_NIVEAU = ['#059669', '#D97706', '#EA580C'] as const

// Tailles de foyer du comparateur de l'accueil
export type TailleFoyer = Foyer
export const TAILLES_FOYER: { valeur: TailleFoyer; libelle: string }[] = [
  { valeur: '1', libelle: '1 personne' },
  { valeur: '2-3', libelle: '2–3 personnes' },
  { valeur: '4-6', libelle: '4–6 personnes' },
]

// Formules ouvertes au lancement : cibles, accroches, repas et heures du référentiel packs v4, donnés pour un mois
export const FORMULES_DU_CODE: readonly Readonly<FormuleVitrine>[] = [
  { slug: 'ahi-essentiel', emoji: '🌿', nom: 'AHI ESSENTIEL', cible: '1 personne · par mois', accroche: 'Les bases de votre mois déjà organisées.', repas: '20–30', heures: '2–4h', prix: 10800, foyer: '1', teinte: 'savane', niveau: 1 },
  { slug: 'ahi-equilibre', emoji: '🌾', nom: 'AHI ÉQUILIBRÉ', cible: 'Couples et familles actives · par mois', accroche: 'Mieux manger sans compliquer votre quotidien.', repas: '35–50', heures: '4–6h', prix: 22500, foyer: '2-3', recommandee: true, teinte: 'foret', niveau: 2 },
  { slug: 'ahi-confort', emoji: '👑', nom: 'AHI CONFORT', cible: 'Familles établies · par mois', accroche: 'Votre cuisine organisée sans stress.', repas: '60–90', heures: '6–10h', prix: 50300, foyer: '4-6', teinte: 'marine', niveau: 3 },
]

// Textes des cartes tels qu'écrits dans le code (valeurs par défaut de l'écran « Site public »)
export const TEXTES_FORMULES_DU_CODE: TextesFormules = Object.fromEntries(FORMULES_DU_CODE.map(f => [f.slug, {
  cible: f.cible, accroche: f.accroche, repas: f.repas, heures: f.heures, foyer: f.foyer, recommandee: !!f.recommandee,
}]))
export const SLUGS_VITRINE = FORMULES_DU_CODE.map(f => f.slug)

// Formules telles que le site les affiche avec ces textes et ces prix (champ par champ, valeurs du code par défaut)
export function composerFormules(textes: unknown, prix: unknown): FormuleVitrine[] {
  const t = fusionnerTextesFormules(TEXTES_FORMULES_DU_CODE, textes)
  const p = lirePrix(SLUGS_VITRINE, prix)
  return FORMULES_DU_CODE.map(f => ({ ...f, ...t[f.slug], prix: p[f.slug] ?? f.prix }))
}

// État partagé des cartes : valeurs du code, puis textes et prix publiés dès leur arrivée
export const FORMULES = reactive<FormuleVitrine[]>(composerFormules(null, null))

// Remplace les cartes affichées (les objets gardent leur identité : les composants suivent sans se recréer)
export function appliquerFormules(textes: unknown, prix: unknown) {
  composerFormules(textes, prix).forEach((f, i) => Object.assign(FORMULES[i]!, f))
}

// Prix de la formule la moins chère, repris dans le hero (« dès … FCFA ») : suit les prix publiés
export const PRIX_D_APPEL = computed(() => Math.min(...FORMULES.map(f => f.prix)))
// Le même, d'après le code : il réserve la place du prix dans le haut de l'accueil (rien ne bouge à l'arrivée du vrai)
export const PRIX_D_APPEL_DU_CODE = Math.min(...FORMULES_DU_CODE.map(f => f.prix))

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
