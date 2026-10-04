// Trois actualités de l'accueil (faits vérifiés, sans date inventée). Les articles complets restent dans le blog
// (/blog, gérés depuis le back-office « Contenus & Médias »).
import { DELAI_LIVRAISON, RESEAUX_SOCIAUX } from './contact'
import { PRODUITS_INCLUS } from './formules'

export interface Actualite {
  categorie: string
  icone: 'lancement' | 'partenaire' | 'communaute'
  titre: string
  resume: string
  lien?: { texte: string; vers: string; externe?: boolean }
}

export const ACTUALITES: Actualite[] = [
  {
    categorie: 'Lancement',
    icone: 'lancement',
    titre: 'Ahitché livre à Cotonou et Abomey-Calavi',
    resume: `Trois formules, ${PRODUITS_INCLUS.length} produits de base, livraison sous ${DELAI_LIVRAISON} et paiement à la livraison : le ravitaillement de votre foyer, sans passer vos samedis au marché.`,
    lien: { texte: 'Découvrir les formules', vers: '#formules' },
  },
  {
    categorie: 'Partenaires',
    icone: 'partenaire',
    titre: 'Un projet accompagné par Sèmè City',
    resume: 'Ahitché est développé sous l\'Agence de Développement de Sèmè City, à travers le programme Next Impact, avec le soutien du FP2E et un financement de la Banque mondiale.',
  },
  {
    categorie: 'Communauté',
    icone: 'communaute',
    titre: 'Suivez-nous sur Facebook et TikTok',
    resume: 'Les coulisses de la préparation des packs, les produits de la semaine et des idées pour mieux manger au quotidien.',
    lien: { texte: 'Voir la page Facebook', vers: RESEAUX_SOCIAUX[0].url, externe: true },
  },
]
