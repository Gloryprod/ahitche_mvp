// Packs de l'admin (GET /api/admin/packs) : la collection Formules fait foi. Le type (« etudiant ») vient du slug
// « ahi-<type> » et sert de clé des quantités du catalogue (Product.quantites[type]).
export interface Pack {
  type: string
  slug: string
  nom: string
  statut: 'actif' | 'inactif'
  bientotDisponible: boolean
  ordre: number | null
}

// Même règle que le serveur (back/src/services/packService.js) : minuscules et chiffres, 2 à 20 caractères
export const TYPE_PACK = /^[a-z][a-z0-9]{1,19}$/

// Pack ouvert à la commande : actif et pas « bientôt disponible »
export const estOuvert = (p: Pack) => p.statut === 'actif' && !p.bientotDisponible

// Les formules du référentiel sont en capitales en base (« AHI ÉQUILIBRÉ », createFormules.js) : affichées
// « AHI Équilibré » comme avant. Un nom saisi en minuscules et majuscules (« AHI Étudiant ») reste tel quel.
export function nomPack(nom: string): string {
  if (nom !== nom.toUpperCase()) return nom
  return nom.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, espace: string, lettre: string) => espace + lettre.toUpperCase()).replace(/^Ahi\b/, 'AHI')
}

// « AHI Équilibré » -> « Équilibré »
export const libelleCourt = (nom: string) => nom.replace(/^AHI\s+/i, '')

// Identifiant proposé à partir du nom : « AHI Étudiant » -> « etudiant » (sans accent, espace ni préfixe AHI)
export function identifiantDepuisNom(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^\s*ahi\s+/, '')
    .replace(/[^a-z0-9]/g, '')
    .replace(/^[0-9]+/, '')
    .slice(0, 20)
}
