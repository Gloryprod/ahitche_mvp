// Trois actualités de l'accueil (faits vérifiés, sans date inventée). Les articles complets restent dans le blog
// (/blog, gérés depuis le back-office « Articles du blog »). Liste calculée : elle suit les valeurs publiées depuis
// l'admin (jours de livraison, liens des réseaux sociaux).
import { computed } from 'vue'
import { LIVRAISON_ANNONCE, RESEAUX_SOCIAUX } from './contact'
import { PRODUITS_INCLUS } from './formules'

export interface Actualite {
  categorie: string
  icone: 'lancement' | 'partenaire' | 'communaute'
  titre: string
  resume: string
  lien?: { texte: string; vers: string; externe?: boolean }
}

const TEXTE_LIEN_RESEAU = { Facebook: 'Voir la page Facebook', TikTok: 'Voir le compte TikTok' } as const

export const ACTUALITES = computed<Actualite[]>(() => {
  const reseaux = RESEAUX_SOCIAUX.value
  const premier = reseaux[0]
  return [
    {
      categorie: 'Lancement',
      icone: 'lancement',
      titre: 'Ahitché livre à Cotonou et Abomey-Calavi',
      resume: `Trois formules, ${PRODUITS_INCLUS.length} produits de base, ${LIVRAISON_ANNONCE.value.toLowerCase()} et paiement à la livraison : le ravitaillement de votre foyer, sans passer vos samedis au marché.`,
      lien: { texte: 'Découvrir les formules', vers: '#formules' },
    },
    {
      categorie: 'Partenaires',
      icone: 'partenaire',
      titre: 'Un projet accompagné par Sèmè City',
      resume: 'Ahitché est développé sous l\'Agence de Développement de Sèmè City, à travers le programme Next Impact, avec le soutien du FP2E et un financement de la Banque mondiale.',
    },
    // Carte retirée si aucun lien de réseau social n'est publié
    ...(premier
      ? [{
          categorie: 'Communauté',
          icone: 'communaute' as const,
          titre: `Suivez-nous sur ${reseaux.map(r => r.nom).join(' et ')}`,
          resume: 'Les coulisses de la préparation des packs, les produits de la semaine et des idées pour mieux manger au quotidien.',
          lien: { texte: TEXTE_LIEN_RESEAU[premier.nom], vers: premier.url, externe: true },
        }]
      : []),
  ]
})
