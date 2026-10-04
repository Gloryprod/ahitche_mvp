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
export const DELAI_LIVRAISON = '24 h' // Délai de livraison annoncé sur l'accueil (espace insécable)
