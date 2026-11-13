// Actualités de l'accueil, trois cartes au plus (faits vérifiés, sans date inventée). Les articles complets restent
// dans le blog (/blog, gérés depuis le back-office « Articles du blog »).
// Tant que rien n'est publié depuis l'admin (écran « Site public », onglet « Actualités »), ce sont les cartes
// ci-dessous, et la carte « Suivez-nous » suit les réseaux sociaux publiés (retirée s'il n'y en a aucun). Une fois les
// actualités publiées, ce sont les cartes publiées qui s'affichent ; une liste vide masque la section.
// Les résumés utilisent des variables ({livraison}, {nb_produits}…), remplacées à l'affichage (config/variablesTexte.ts).
import { computed, shallowRef } from 'vue'
import { fusionnerActualites, lienExterne, type CarteActualite } from '@/services/valeursSite'
import { RESEAUX_SOCIAUX, type ReseauSocial } from './contact'
import { avecVariables } from './variablesTexte'

export type { CarteActualite }

// Carte affichée : texte final, lien marqué externe (nouvel onglet) s'il quitte le site
export interface Actualite extends Omit<CarteActualite, 'lien'> {
  lien: { texte: string; vers: string; externe: boolean } | null
}

const TEXTE_LIEN_RESEAU = { Facebook: 'Voir la page Facebook', TikTok: 'Voir le compte TikTok' } as const

// Cartes du code, dont la carte « Suivez-nous » d'après les réseaux publiés
export function cartesDuCode(reseaux: readonly ReseauSocial[]): CarteActualite[] {
  const premier = reseaux[0]
  return [
    {
      id: 'lancement',
      categorie: 'Lancement',
      icone: 'lancement',
      titre: 'Ahitché livre à Cotonou et Abomey-Calavi',
      resume: 'Trois formules, {nb_produits} produits de base, {livraison} et paiement à la livraison : le ravitaillement de votre foyer, sans passer vos samedis au marché.',
      lien: { texte: 'Découvrir les formules', vers: '#formules' },
    },
    {
      id: 'partenaires',
      categorie: 'Partenaires',
      icone: 'partenaire',
      titre: 'Un projet accompagné par Sèmè City',
      resume: 'Ahitché est développé sous l\'Agence de Développement de Sèmè City, à travers le programme Next Impact, avec le soutien du FP2E et un financement de la Banque mondiale.',
      lien: null,
    },
    // Carte retirée si aucun lien de réseau social n'est publié
    ...(premier
      ? [{
          id: 'communaute',
          categorie: 'Communauté',
          icone: 'communaute' as const,
          titre: `Suivez-nous sur ${reseaux.map(r => r.nom).join(' et ')}`,
          resume: 'Les coulisses de la préparation des packs, les produits de la semaine et des idées pour mieux manger au quotidien.',
          lien: { texte: TEXTE_LIEN_RESEAU[premier.nom], vers: premier.url },
        }]
      : []),
  ]
}

// Cartes publiées depuis l'admin ; null tant que rien n'est publié (les cartes du code s'affichent)
const actualitesPubliees = shallowRef<CarteActualite[] | null>(null)

export function appliquerActualites(recu: unknown) {
  actualitesPubliees.value = Array.isArray(recu) ? fusionnerActualites([], recu) : null
}

// Carte telle que l'accueil l'affiche (l'aperçu de l'admin passe ses propres valeurs de variables)
export const carteAffichee = (c: CarteActualite, texte: (t: string) => string = avecVariables): Actualite => ({
  ...c,
  resume: texte(c.resume),
  lien: c.lien ? { ...c.lien, externe: lienExterne(c.lien.vers) } : null,
})

export const ACTUALITES = computed<Actualite[]>(() =>
  (actualitesPubliees.value ?? cartesDuCode(RESEAUX_SOCIAUX.value)).map(c => carteAffichee(c)))
