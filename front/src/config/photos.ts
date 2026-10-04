// Emplacements photo du site. Tant qu'une photo n'a pas de licence vérifiable (photos d'Ahitché, ou
// licence/attestation conservée), l'emplacement affiche « PHOTO À FOURNIR » avec le sujet et le format attendus.
// Pour ajouter une photo : déposer les fichiers WebP dans front/public/photos/ (largeurs 400, 800 et 1200 px,
// ex. hero-reception-800.webp), puis renseigner `fichier` (ex. '/photos/hero-reception') et `alt`.

export interface EmplacementPhoto {
  sujet: string // Ce que la photo doit montrer
  cadrage: string
  dimensions: string // Dimensions de l'original à fournir
  ratio: string // Rapport largeur / hauteur affiché (CSS aspect-ratio)
  fichier?: string // Chemin sans suffixe ni extension ; absent : photo à fournir
  alt?: string // Description pour les lecteurs d'écran (obligatoire avec un fichier)
}

export const PHOTOS = {
  heroReception: {
    sujet: 'Un(e) client(e) reçoit son pack Ahitché à sa porte, emballage avec logo visible',
    cadrage: 'Plan moyen, vertical, sujet décentré',
    dimensions: '1200 × 1500 px (4:5)',
    ratio: '4 / 5',
  },
  fermeProduction: {
    sujet: 'Producteur ou productrice partenaire au champ (maïs, tomate, riz)',
    cadrage: 'Plan large',
    dimensions: '1600 × 1200 px (4:3)',
    ratio: '4 / 3',
  },
  fermeRecolte: {
    sujet: 'Mains qui récoltent ou trient des légumes',
    cadrage: 'Gros plan',
    dimensions: '1600 × 1200 px (4:3)',
    ratio: '4 / 3',
  },
  fermePreparation: {
    sujet: "L'équipe Ahitché compose un pack (riz, gari, huile…)",
    cadrage: 'Plan moyen',
    dimensions: '1600 × 1200 px (4:3)',
    ratio: '4 / 3',
  },
  fermeLivraison: {
    sujet: 'Livreur Ahitché à moto dans une rue de Cotonou ou d’Abomey-Calavi',
    cadrage: 'Plan large',
    dimensions: '1600 × 1200 px (4:3)',
    ratio: '4 / 3',
  },
  fermeReception: {
    sujet: 'Déballage du pack dans une cuisine',
    cadrage: 'Plan moyen',
    dimensions: '1600 × 1200 px (4:3)',
    ratio: '4 / 3',
  },
} satisfies Record<string, EmplacementPhoto>
