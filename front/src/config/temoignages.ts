// Témoignages affichés sur l'accueil. Uniquement des avis réels, dont le texte a été validé par la
// personne (accord donné le 2026-10-04 pour David, Nadine et Boniface). Pas de photo : avatar à initiale.
// `note` : nombre d'étoiles (sur 5) donné par le client.

export interface Temoignage {
  prenom: string
  quartier: string
  note: number
  texte: string
}

export const TEMOIGNAGES: Temoignage[] = [
  {
    prenom: 'David',
    quartier: 'Zogbadjé',
    note: 5,
    texte: "Ahitché m'a libéré de l'organisation quotidienne de mes courses. Les produits arrivent frais, les délais sont respectés, et payer à la livraison c'est pratique. Je reprends le pack Équilibré chaque mois.",
  },
  {
    prenom: 'Nadine',
    quartier: 'Tokan',
    note: 5,
    texte: "Avec Ahitché, mes enfants mangent mieux. Les produits viennent directement de la ferme, c'est frais et ça se voit. Le pack Essentiel me suffit et le prix est juste. Je recommande !",
  },
  {
    prenom: 'Boniface',
    quartier: 'Cadjéhoun',
    note: 5,
    texte: "J'étais sceptique au départ, mais Ahitché m'a convaincu. Livraison rapide jusqu'à Cadjéhoun, produits de qualité, zéro surprise. C'est transparent et fiable.",
  },
]
