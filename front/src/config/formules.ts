// Formules affichées sur l'accueil (vitrine).
// Prix : le site affiche le prix de vente de la base (écran « Formules et prix » de l'admin), reçu avec les contenus
// du site (services/contenuSite.ts). Le prix écrit ici n'est plus qu'une valeur de secours (API muette, formule sans
// prix en base) et la réserve de place du prix d'appel du haut de l'accueil : il reste identique au référentiel
// (back/src/scripts/createFormules.js).
// Réglages des cartes (affichage, ordre, emoji, couleur, niveau, cible, accroche, repas, heures, foyer, formule
// recommandée) : modifiables dans l'écran « Site public », pour n'importe quel pack de la base ; ceux du code servent
// tant que rien n'est publié. Un pack créé dans l'admin n'a pas de carte tant qu'elle n'y est pas affichée.
// FORMULES est un tableau réactif de taille variable : il suit les valeurs publiées dès leur arrivée.
import { computed, reactive } from 'vue'
import {
  fusionnerTextesFormules, lireNoms, lirePrix, trierParOrdre,
  type CouleurFormule, type Foyer, type FoyerCarte, type TexteFormule, type TextesFormules,
} from '@/services/valeursSite'

export interface FormuleVitrine {
  slug: string // Identifiant en base (valeur estimée servie par l'API)
  emoji: string
  nom: string // Ex : "AHI ESSENTIEL"
  cible: string // Ex : "1 personne · par mois" (référentiel packs v4, un pack couvre un mois)
  accroche: string
  repas: string // Ex : "20–30"
  heures: string // Ex : "2–4h"
  prix: number // Prix de vente en FCFA, par mois (un pack couvre un mois) ; le prix barré (valeur estimée, D-03) vient de l'API
  foyer: FoyerCarte // Taille de foyer pour laquelle la formule est conseillée ('' : aucune)
  recommandee?: boolean
  couleur: CouleurFormule // Thème réglé pour le contraste, ou couleur libre « #RRGGBB »
  niveau: 1 | 2 | 3 // Niveau de confort (jauge de la carte)
  ordre: number // Place de la carte, croissante de gauche à droite
}

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
  { slug: 'ahi-essentiel', emoji: '🌿', nom: 'AHI ESSENTIEL', cible: '1 personne · par mois', accroche: 'Les bases de votre mois déjà organisées.', repas: '20–30', heures: '2–4h', prix: 10800, foyer: '1', couleur: 'savane', niveau: 1, ordre: 0 },
  { slug: 'ahi-equilibre', emoji: '🌾', nom: 'AHI ÉQUILIBRÉ', cible: 'Couples et familles actives · par mois', accroche: 'Mieux manger sans compliquer votre quotidien.', repas: '35–50', heures: '4–6h', prix: 22500, foyer: '2-3', recommandee: true, couleur: 'foret', niveau: 2, ordre: 1 },
  { slug: 'ahi-confort', emoji: '👑', nom: 'AHI CONFORT', cible: 'Familles établies · par mois', accroche: 'Votre cuisine organisée sans stress.', repas: '60–90', heures: '6–10h', prix: 50300, foyer: '4-6', couleur: 'marine', niveau: 3, ordre: 2 },
]

// Réglages des cartes tels qu'écrits dans le code (valeurs par défaut de l'écran « Site public »)
export const TEXTES_FORMULES_DU_CODE: TextesFormules = Object.fromEntries(FORMULES_DU_CODE.map(f => [f.slug, {
  afficher: true, ordre: f.ordre, emoji: f.emoji, couleur: f.couleur, niveau: f.niveau,
  cible: f.cible, accroche: f.accroche, repas: f.repas, heures: f.heures, foyer: f.foyer, recommandee: !!f.recommandee,
} satisfies TexteFormule]))
export const SLUGS_VITRINE = FORMULES_DU_CODE.map(f => f.slug)

// Cartes affichées par le site avec ces réglages, ces prix et ces noms, rangées par ordre :
// - les trois cartes du code gardent leur nom, et leur prix si la base n'en donne pas ;
// - une autre carte n'est affichée qu'avec son nom en base, un prix et ses quatre textes ;
// - si le serveur envoie « noms » (cartes dont le pack est actif), une carte absente de cette liste est masquée.
// Sans aucune carte, celles du code reviennent : la section et le prix d'appel du hero ne restent jamais vides.
export function composerFormules(textes: unknown, prix: unknown, noms?: unknown): FormuleVitrine[] {
  const reglages = fusionnerTextesFormules(TEXTES_FORMULES_DU_CODE, textes)
  const p = lirePrix(Object.keys(reglages), prix)
  const n = lireNoms(noms)
  const cartes = trierParOrdre(reglages).flatMap((slug): FormuleVitrine[] => {
    const r = reglages[slug]!
    if (!r.afficher || (n && !(slug in n))) return []
    const duCode = FORMULES_DU_CODE.find(f => f.slug === slug)
    const nom = duCode?.nom ?? n?.[slug]?.trim().toLocaleUpperCase('fr-FR')
    const prixCarte = p[slug] ?? duCode?.prix
    if (!nom || !prixCarte || (!duCode && !(r.cible && r.accroche && r.repas && r.heures))) return []
    return [{
      slug, nom, emoji: r.emoji, couleur: r.couleur, niveau: r.niveau, ordre: r.ordre, cible: r.cible, accroche: r.accroche,
      repas: r.repas, heures: r.heures, prix: prixCarte, foyer: r.foyer, recommandee: r.recommandee,
    }]
  })
  return cartes.length ? cartes : composerFormules(null, null)
}

// État partagé des cartes : valeurs du code, puis réglages, prix et noms publiés dès leur arrivée
export const FORMULES = reactive<FormuleVitrine[]>(composerFormules(null, null))

// Remplace les cartes affichées : cartes ajoutées ou retirées ; une carte qui reste garde son objet (les composants
// suivent sans se recréer)
export function appliquerFormules(textes: unknown, prix: unknown, noms?: unknown) {
  const cartes = composerFormules(textes, prix, noms).map(f => Object.assign(FORMULES.find(x => x.slug === f.slug) ?? {}, f))
  FORMULES.splice(0, FORMULES.length, ...cartes)
}

// Prix de la formule la moins chère, repris dans le hero (« dès … FCFA ») : suit les prix publiés
export const PRIX_D_APPEL = computed(() => Math.min(...FORMULES.map(f => f.prix)))
// Le même, d'après le code : il réserve la place du prix dans le haut de l'accueil (rien ne bouge à l'arrivée du vrai)
export const PRIX_D_APPEL_DU_CODE = Math.min(...FORMULES_DU_CODE.map(f => f.prix))

// 17 produits de base, les mêmes dans les trois formules (référentiel v4 : le sel remplace l'huile de palme) ;
// les quantités varient selon la formule et ne sont pas affichées
export const PRODUITS_INCLUS = [
  "Riz local", "Haricots", "Coquillettes", "Spaghetti",
  "Couscous", "Gari", "Tapioca", "Farine de maïs", "Huile végétale",
  "Tomates", "Oignons", "Sucre", "Lait concentré",
  "Œufs", "Épices Ahitché", "Assaisonnement", "Sel"
]

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
