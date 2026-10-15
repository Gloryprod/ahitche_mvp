// Coordonnées et engagements affichés sur le site : à modifier ici seulement (menu, accueil, cartes, pied de page…)

export const WHATSAPP_NUMERO = '22998136635' // Format international sans « + » (liens wa.me)
export const WHATSAPP_AFFICHAGE = '+229 98 13 66 35'

// Lien WhatsApp avec un message pré-rempli
export function lienWhatsApp(message?: string) {
  const base = `https://wa.me/${WHATSAPP_NUMERO}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}

export const MESSAGES_WHATSAPP = {
  commande: 'Bonjour Ahitché ! Je souhaite commander une formule. Pouvez-vous me conseiller selon la taille de mon foyer ?',
  premiereCommande: 'Bonjour Ahitché ! Je souhaite passer ma première commande.',
  complements: 'Bonjour Ahitché ! Je souhaite ajouter des produits variables à ma commande. Quels produits sont disponibles cette semaine ?',
  fondateur: 'Bonjour Ahitché ! Je voudrais devenir client fondateur.',
}

// Réseaux sociaux (ouverts dans un nouvel onglet)
export const RESEAUX_SOCIAUX = [
  { nom: 'Facebook', url: 'https://www.facebook.com/Ahitche', libelle: 'Ahitché sur Facebook' },
  { nom: 'TikTok', url: 'https://www.tiktok.com/@ahitchebj.com', libelle: 'Ahitché sur TikTok' },
] as const

export const HORAIRES = 'Lundi – Samedi, 9h00 – 18h00'
// Les mêmes horaires pour Google (données structurées de l'accueil) : à changer avec HORAIRES
export const HORAIRES_GOOGLE = {
  jours: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  ouverture: '09:00',
  fermeture: '18:00',
}
// Livraison à jour fixe (D-07) : les jours de tournée se fixent avec le livreur ; vide tant qu'ils ne sont pas confirmés
export const JOURS_LIVRAISON = '' // Ex : « le mardi et le samedi »
export const LIVRAISON_ANNONCE = JOURS_LIVRAISON ? `Livraison ${JOURS_LIVRAISON}` : 'Livraison à jour fixe'
// Paiement à la livraison (D-06) : Mobile Money ou espèces
export const PAIEMENT_ANNONCE = 'MTN MoMo, Moov Money ou espèces'
