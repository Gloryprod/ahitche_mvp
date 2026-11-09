// Questions fréquentes de l'accueil : réponses fondées sur les règles validées (docs/conception-menu-admin.md).
// Elles alimentent aussi les données structurées FAQPage (référencement local).
// Les questions ci-dessous sont celles du site tant que rien n'est publié depuis l'admin (écran « Site public »,
// onglet « Questions fréquentes ») ; elles servent au rendu de l'accueil au build et restent si l'API ne répond pas.
// Les réponses utilisent des variables ({paiement}, {jours_livraison}, {horaires}, {nb_produits}…), remplacées à
// l'affichage par les valeurs du site (config/variablesTexte.ts) : le texte affiché suit les infos publiées.
import { computed, shallowRef } from 'vue'
import { fusionnerFaq, type QuestionFaq } from '@/services/valeursSite'
import { avecVariables } from './variablesTexte'

export type { QuestionFaq }

export const FAQ_PAR_DEFAUT: readonly QuestionFaq[] = [
  {
    id: 'commander',
    question: 'Comment passer commande ?',
    reponse: 'Choisissez votre formule et touchez « Commander » : WhatsApp s\'ouvre avec un message prêt à envoyer. Nous confirmons avec vous la formule, l\'adresse et le créneau de livraison.',
    visible: true,
    lien: null,
  },
  {
    id: 'paiement',
    question: 'Quand et comment je paie ?',
    reponse: 'Vous payez à la livraison, une fois vos vivres reçus, par {paiement}. Rien n\'est à régler à l\'avance.',
    visible: true,
    lien: null,
  },
  {
    id: 'zones',
    question: 'Où livrez-vous ?',
    reponse: 'À Cotonou et à Abomey-Calavi, dans 22 zones de livraison couvrant leurs arrondissements. Indiquez votre quartier à la commande : nous confirmons la zone avec vous.',
    visible: true,
    lien: null,
  },
  {
    // Sans jours publiés : « Nous livrons à jour fixe : le jour… » ; avec : « Nous livrons à jour fixe, le mardi et le samedi : … »
    id: 'livraison',
    question: 'Quand suis-je livré ?',
    reponse: 'Nous livrons à jour fixe, {jours_livraison} : le jour et le créneau vous sont confirmés à la commande. Le livreur vous appelle avant d\'arriver. Nous répondons sur WhatsApp : {horaires}.',
    visible: true,
    lien: null,
  },
  {
    id: 'contenu-pack',
    question: 'Que contient un pack ?',
    reponse: 'Les {nb_produits} produits de base (riz local, gari, haricots, huile, tomates, oignons…), en quantités adaptées à la formule et à la taille de votre foyer. Le contenu exact peut varier selon les saisons. La formule Essentiel ne contient pas d\'huile de palme.',
    visible: true,
    lien: null,
  },
  {
    id: 'garantie',
    question: 'Et si un produit manque ou arrive abîmé ?',
    reponse: 'C\'est la garantie Ahitché : tout produit manquant ou abîmé est remplacé à l\'identique à la livraison suivante.',
    visible: true,
    lien: null,
  },
  {
    id: 'renouvellement',
    question: 'Comment se passe le renouvellement ?',
    reponse: 'Avant la fin de votre pack, nous vous recontactons sur WhatsApp pour le renouveler si vous le souhaitez. Vous pouvez aussi ajouter des compléments de la semaine à votre commande.',
    visible: true,
    lien: null,
  },
  {
    id: 'donnees',
    question: 'Que faites-vous de mes données ?',
    reponse: 'Nous n\'utilisons vos coordonnées (nom, téléphone, adresse) que pour préparer et livrer vos commandes et assurer votre suivi. Elles ne sont ni vendues ni cédées.',
    visible: true,
    lien: { texte: 'Mentions légales et données personnelles', vers: '/mentions-legales' },
  },
]

// Questions publiées depuis l'admin (le site public ne reçoit que les visibles), sinon celles du code
const faqPubliee = shallowRef<QuestionFaq[]>(fusionnerFaq(FAQ_PAR_DEFAUT, null))

export function appliquerFaq(recu: unknown) {
  faqPubliee.value = fusionnerFaq(FAQ_PAR_DEFAUT, recu)
}

// Questions affichées : visibles seulement, variables remplacées
export const FAQ = computed<QuestionFaq[]>(() => faqPubliee.value
  .filter(q => q.visible)
  .map(q => ({ ...q, reponse: avecVariables(q.reponse) })))
