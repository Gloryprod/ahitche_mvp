// Coordonnées et engagements affichés sur le site (menu, accueil, cartes, pied de page…).
// Les valeurs ci-dessous sont celles du site tant que rien n'est publié depuis l'admin (écran « Site public ») :
// elles servent au rendu de l'accueil au build et restent en place si l'API ne répond pas.
// Les valeurs publiées arrivent une fois par chargement (services/contenuSite.ts) et les remplacent partout :
// les constantes exportées plus bas sont des valeurs calculées (computed), à lire avec .value dans le code
// (dans un gabarit Vue, {{ HORAIRES }} suffit).
import { computed, reactive } from 'vue'
import {
  annonceLivraison, copierInfos, formaterHoraires, formaterNumero, fusionnerInfos, horairesGoogle, type InfosSite,
} from '@/services/valeursSite'

export const INFOS_PAR_DEFAUT: InfosSite = {
  whatsappNumero: '22998136635', // Format international sans « + » (liens wa.me)
  messages: {
    commande: 'Bonjour Ahitché ! Je souhaite commander une formule. Pouvez-vous me conseiller selon la taille de mon foyer ?',
    premiereCommande: 'Bonjour Ahitché ! Je souhaite passer ma première commande.',
    complements: 'Bonjour Ahitché ! Je souhaite ajouter des produits variables à ma commande. Quels produits sont disponibles cette semaine ?',
    fondateur: 'Bonjour Ahitché ! Je voudrais devenir client fondateur.',
  },
  // Réseaux sociaux (ouverts dans un nouvel onglet) ; vide : lien masqué
  facebook: 'https://www.facebook.com/Ahitche',
  tiktok: 'https://www.tiktok.com/@ahitchebj.com',
  horaires: { jours: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'], ouverture: '09:00', fermeture: '18:00' },
  // Livraison à jour fixe (D-07) : les jours de tournée se fixent avec le livreur ; vide tant qu'ils ne sont pas confirmés
  joursLivraison: '', // Ex : « le mardi et le samedi »
  // Paiement à la livraison (D-06) : Mobile Money ou espèces
  paiement: 'MTN MoMo, Moov Money ou espèces',
}

// État partagé : valeurs du code, puis valeurs publiées dès leur arrivée
export const infosSite = reactive<InfosSite>(copierInfos(INFOS_PAR_DEFAUT))

// Remplace les valeurs affichées ; les objets gardent leur identité (MESSAGES_WHATSAPP reste le même objet)
export function appliquerInfos(recu: unknown) {
  const valeurs = fusionnerInfos(INFOS_PAR_DEFAUT, recu)
  Object.assign(infosSite.messages, valeurs.messages)
  Object.assign(infosSite.horaires, valeurs.horaires)
  infosSite.whatsappNumero = valeurs.whatsappNumero
  infosSite.facebook = valeurs.facebook
  infosSite.tiktok = valeurs.tiktok
  infosSite.joursLivraison = valeurs.joursLivraison
  infosSite.paiement = valeurs.paiement
}

export const WHATSAPP_NUMERO = computed(() => infosSite.whatsappNumero)
export const WHATSAPP_AFFICHAGE = computed(() => formaterNumero(infosSite.whatsappNumero)) // « +229 98 13 66 35 »

// Lien WhatsApp avec un message pré-rempli (lu au moment de l'appel : suit le numéro publié)
export function lienWhatsApp(message?: string) {
  const base = `https://wa.me/${infosSite.whatsappNumero}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}

// Objet réactif : MESSAGES_WHATSAPP.commande suit le message publié
export const MESSAGES_WHATSAPP = infosSite.messages

export interface ReseauSocial { nom: 'Facebook' | 'TikTok'; url: string; libelle: string }
// Réseaux dont le lien est rempli (un lien vidé dans l'admin masque le réseau)
export const reseauxDe = (infos: Pick<InfosSite, 'facebook' | 'tiktok'>): ReseauSocial[] => [
  { nom: 'Facebook' as const, url: infos.facebook, libelle: 'Ahitché sur Facebook' },
  { nom: 'TikTok' as const, url: infos.tiktok, libelle: 'Ahitché sur TikTok' },
].filter(r => r.url)
export const RESEAUX_SOCIAUX = computed<ReseauSocial[]>(() => reseauxDe(infosSite))

export const HORAIRES = computed(() => formaterHoraires(infosSite.horaires)) // « Lundi – Samedi, 9h00 – 18h00 »
// Les mêmes horaires pour Google (données structurées de l'accueil)
export const HORAIRES_GOOGLE = computed(() => horairesGoogle(infosSite.horaires))
export const JOURS_LIVRAISON = computed(() => infosSite.joursLivraison)
export const LIVRAISON_ANNONCE = computed(() => annonceLivraison(infosSite.joursLivraison)) // « Livraison à jour fixe »
export const PAIEMENT_ANNONCE = computed(() => infosSite.paiement)

// Haut de l'accueil rendu au build : son texte garde la valeur du code, pour que rien ne bouge ni ne change à
// l'arrivée des valeurs publiées (ses liens WhatsApp, invisibles, suivent le numéro publié)
export const LIVRAISON_ANNONCE_DU_CODE = annonceLivraison(INFOS_PAR_DEFAUT.joursLivraison)
