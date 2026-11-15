// Témoignages affichés sur l'accueil. Uniquement des avis réels, dont le texte a été validé par la
// personne (accord donné le 2026-10-04 pour David, Nadine et Boniface). Pas de photo : avatar à initiale.
// `note` : nombre d'étoiles (sur 5) donné par le client.
// Les avis publiés depuis les espaces clients (validés par l'admin, GET /api/public/avis) s'affichent avant ceux-ci.
// Les témoignages ci-dessous sont ceux du site tant que rien n'est publié depuis l'admin (écran « Site public »,
// onglet « Témoignages ») ; ils restent si l'API ne répond pas. Une liste publiée vide n'affiche que les avis des clients.
import { computed, shallowRef } from 'vue'
import { fusionnerTemoignages, type Temoignage, type TemoignageSite } from '@/services/valeursSite'

export type { Temoignage, TemoignageSite }

export const TEMOIGNAGES_PAR_DEFAUT: readonly TemoignageSite[] = [
  {
    id: 'david',
    prenom: 'David',
    quartier: 'Zogbadjé',
    note: 5,
    texte: "Ahitché m'a libéré de l'organisation quotidienne de mes courses. Les produits arrivent frais, les délais sont respectés, et payer à la livraison c'est pratique. Je reprends le pack Équilibré chaque mois.",
    accordLe: '2026-10-04',
    visible: true,
  },
  {
    id: 'nadine',
    prenom: 'Nadine',
    quartier: 'Tokan',
    note: 5,
    texte: "Avec Ahitché, mes enfants mangent mieux. Les produits viennent directement de la ferme, c'est frais et ça se voit. Le pack Essentiel me suffit et le prix est juste. Je recommande !",
    accordLe: '2026-10-04',
    visible: true,
  },
  {
    id: 'boniface',
    prenom: 'Boniface',
    quartier: 'Cadjéhoun',
    note: 5,
    texte: "J'étais sceptique au départ, mais Ahitché m'a convaincu. Livraison rapide jusqu'à Cadjéhoun, produits de qualité, zéro surprise. C'est transparent et fiable.",
    accordLe: '2026-10-04',
    visible: true,
  },
]

// Témoignages publiés depuis l'admin (le site public ne reçoit que les visibles), sinon ceux du code
const temoignagesPublies = shallowRef<TemoignageSite[]>(fusionnerTemoignages(TEMOIGNAGES_PAR_DEFAUT, null))

export function appliquerTemoignages(recu: unknown) {
  temoignagesPublies.value = fusionnerTemoignages(TEMOIGNAGES_PAR_DEFAUT, recu)
}

// Témoignages affichés, dans l'ordre : visibles seulement, sans la date de l'accord
export const TEMOIGNAGES = computed<Temoignage[]>(() => temoignagesPublies.value
  .filter(t => t.visible)
  .map(({ prenom, quartier, note, texte }) => ({ prenom, quartier, note, texte })))
