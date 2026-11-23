// Enquête de satisfaction (docs-internes/enquete/CONTRAT.md) : choix proposés et limites de saisie, en miroir
// du serveur (back/src/models/reponseEnquete.js), qui fait foi. Partagé par la page /enquete et l'écran admin.

export const FORMULES_ENQUETE = [
  { valeur: 'ahi-essentiel', libelle: 'Essentiel' },
  { valeur: 'ahi-equilibre', libelle: 'Équilibré' },
  { valeur: 'ahi-confort', libelle: 'Confort' },
  { valeur: 'autre', libelle: 'Autre' },
  { valeur: 'ne-sait-pas', libelle: 'Je ne sais pas' },
] as const

export type AvisProduit = 'moins' | 'bien' | 'plus' | 'autre'
export const AVIS_PRODUIT: { valeur: AvisProduit; libelle: string }[] = [
  { valeur: 'moins', libelle: 'Moins' },
  { valeur: 'bien', libelle: 'Bien' },
  { valeur: 'plus', libelle: 'Plus' },
  { valeur: 'autre', libelle: 'Autre chose' },
]

export const LIMITES_ENQUETE = { produits: 3, produitSouhaite: 200, remplacement: 80, suggestion: 1000, prenom: 50 }

// Message copié depuis l'écran admin, à envoyer aux clients sur WhatsApp
export const MESSAGE_ENQUETE = 'Bonjour ! Ton avis compte pour nous : 2 minutes pour nous dire ce que tu penses de ton pack Ahitché 🙏 https://ahitchebj.com/enquete'
