// Emplacements photo du site. Tant qu'une photo n'a pas de licence vérifiable (photos d'Ahitché, ou
// licence/attestation conservée), l'emplacement affiche « PHOTO À FOURNIR » avec le sujet et le format attendus.
// Pour ajouter une photo : déposer les fichiers WebP dans front/public/photos/ (largeurs 400, 800 et 1200 px,
// ex. hero-reception-800.webp), puis renseigner `fichier` (ex. '/photos/hero-reception') et `alt`.
// Les 5 photos de la frise « De la ferme à vous » se remplacent aussi depuis l'admin (écran « Site public », onglet
// « Photos ») : la photo publiée (Cloudinary) prend la place du fichier ci-dessous, qui reste la valeur par défaut.
// La photo du haut de l'accueil (heroReception) reste dans le code : rendue au build et chargée en priorité.
import { computed, shallowRef } from 'vue'
import { EMPLACEMENTS_FRISE, fusionnerPhotos, type EmplacementFrise, type PhotoSite, type PhotosSite } from '@/services/valeursSite'

export interface EmplacementPhoto {
  sujet: string // Ce que la photo doit montrer
  cadrage: string
  dimensions: string // Dimensions de l'original à fournir
  ratio: string // Rapport largeur / hauteur affiché (CSS aspect-ratio)
  fichier?: string // Chemin sans suffixe ni extension ; absent : photo à fournir
  url?: string // Photo publiée depuis l'admin (adresse Cloudinary) : remplace le fichier
  alt?: string // Description pour les lecteurs d'écran (obligatoire avec un fichier ou une adresse)
}

export const PHOTOS = {
  heroReception: {
    sujet: 'Un(e) client(e) reçoit son pack Ahitché à sa porte, emballage avec logo visible',
    cadrage: 'Plan moyen, vertical, sujet décentré',
    dimensions: '1200 × 1500 px (4:5)',
    ratio: '4 / 5',
    fichier: '/photos/client_recoit_ahitche',
    alt: 'Un client reçoit son pack Ahitché à sa porte, emballage avec logo visible',
  },
  fermeProduction: {
    sujet: 'Producteur ou productrice partenaire au champ (maïs, tomate, riz)',
    cadrage: 'Plan large',
    dimensions: '1600 × 1200 px (4:3)',
    ratio: '4 / 3',
    fichier: '/photos/producteur_partenaire',
    alt: 'Producteur ou productrice partenaire au champ (maïs, tomate, riz)',
  },
  fermeRecolte: {
    sujet: 'Mains qui récoltent ou trient des légumes',
    cadrage: 'Gros plan',
    dimensions: '1600 × 1200 px (4:3)',
    ratio: '4 / 3',
    fichier: '/photos/trie_legumes',
    alt: 'Mains qui récoltent ou trient des légumes',
  },
  fermePreparation: {
    sujet: "L'équipe Ahitché compose un pack (riz, gari, huile…)",
    cadrage: 'Plan moyen',
    dimensions: '1600 × 1200 px (4:3)',
    ratio: '4 / 3',
    fichier: '/photos/composition_pack',
    alt: "L'équipe Ahitché compose un pack (riz, gari, huile…)",
  },
  fermeLivraison: {
    sujet: 'Livreur Ahitché à moto dans une rue de Cotonou ou d’Abomey-Calavi',
    cadrage: 'Plan large',
    dimensions: '1600 × 1200 px (4:3)',
    ratio: '4 / 3',
    fichier: '/photos/livreur',
    alt: 'Livreur Ahitché à moto dans une rue de Cotonou ou d’Abomey-Calavi',
  },
  fermeReception: {
    sujet: 'Déballage du pack dans une cuisine',
    cadrage: 'Plan moyen',
    dimensions: '1600 × 1200 px (4:3)',
    ratio: '4 / 3',
    fichier: '/photos/deballage',
    alt: 'Déballage du pack dans une cuisine',
  },
} satisfies Record<string, EmplacementPhoto>

export type PhotosFrise = Record<EmplacementFrise, EmplacementPhoto>

// Titres des étapes de la frise (FermeAVous.vue), repris dans l'écran « Site public » et dans les messages du serveur
// (« Photo « Production » : … », back/src/services/contenuSiteService.js) : à garder identiques
export const TITRES_FRISE: Record<EmplacementFrise, string> = {
  fermeProduction: 'Production',
  fermeRecolte: 'Récolte et tri',
  fermePreparation: 'Préparation',
  fermeLivraison: 'Livraison',
  fermeReception: 'Réception',
}

// Photo d'un emplacement de la frise telle que le site l'affiche : la photo publiée, sinon celle du code
export const photoAffichee = (cle: EmplacementFrise, publiee: PhotoSite | undefined): EmplacementPhoto =>
  (publiee?.url ? { ...PHOTOS[cle], fichier: undefined, url: publiee.url, alt: publiee.alt } : PHOTOS[cle])
export const composerFrise = (photos: PhotosSite | null): PhotosFrise =>
  Object.fromEntries(EMPLACEMENTS_FRISE.map(cle => [cle, photoAffichee(cle, photos?.[cle])])) as PhotosFrise

// Photos publiées depuis l'admin (services/contenuSite.ts) ; null tant que rien n'est publié
const photosPubliees = shallowRef<PhotosSite | null>(null)

export function appliquerPhotos(recu: unknown) {
  photosPubliees.value = recu ? fusionnerPhotos(recu) : null
}

export const PHOTOS_FRISE = computed<PhotosFrise>(() => composerFrise(photosPubliees.value))
