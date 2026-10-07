// Questions fréquentes de l'accueil : réponses fondées sur les règles validées (docs/conception-menu-admin.md).
// Elles alimentent aussi les données structurées FAQPage (référencement local).
import { JOURS_LIVRAISON, PAIEMENT_ANNONCE, HORAIRES } from './contact'
import { PRODUITS_INCLUS } from './formules'

export interface QuestionFaq {
  question: string
  reponse: string
  lien?: { texte: string; vers: string } // Lien interne facultatif sous la réponse
}

export const FAQ: QuestionFaq[] = [
  {
    question: 'Comment passer commande ?',
    reponse: 'Choisissez votre formule et touchez « Commander » : WhatsApp s\'ouvre avec un message prêt à envoyer. Nous confirmons avec vous la formule, l\'adresse et le créneau de livraison.',
  },
  {
    question: 'Quand et comment je paie ?',
    reponse: `Vous payez à la livraison, une fois vos vivres reçus, par ${PAIEMENT_ANNONCE}. Rien n'est à régler à l'avance.`,
  },
  {
    question: 'Où livrez-vous ?',
    reponse: 'À Cotonou et à Abomey-Calavi, dans 22 zones de livraison couvrant leurs arrondissements. Indiquez votre quartier à la commande : nous confirmons la zone avec vous.',
  },
  {
    question: 'Quand suis-je livré ?',
    reponse: `Nous livrons à jour fixe${JOURS_LIVRAISON ? `, ${JOURS_LIVRAISON}` : ''} : le jour et le créneau vous sont confirmés à la commande. Le livreur vous appelle avant d'arriver. Nous répondons sur WhatsApp : ${HORAIRES}.`,
  },
  {
    question: 'Que contient un pack ?',
    reponse: `Les ${PRODUITS_INCLUS.length} produits de base (riz local, gari, haricots, huile, tomates, oignons…), en quantités adaptées à la formule et à la taille de votre foyer. Le contenu exact peut varier selon les saisons. La formule Essentiel ne contient pas d'huile de palme.`,
  },
  {
    question: 'Et si un produit manque ou arrive abîmé ?',
    reponse: 'C\'est la garantie Ahitché : tout produit manquant ou abîmé est remplacé à l\'identique à la livraison suivante.',
  },
  {
    question: 'Comment se passe le renouvellement ?',
    reponse: 'Avant la fin de votre pack, nous vous recontactons sur WhatsApp pour le renouveler si vous le souhaitez. Vous pouvez aussi ajouter des compléments de la semaine à votre commande.',
  },
  {
    question: 'Que faites-vous de mes données ?',
    reponse: 'Nous n\'utilisons vos coordonnées (nom, téléphone, adresse) que pour préparer et livrer vos commandes et assurer votre suivi. Elles ne sont ni vendues ni cédées.',
    lien: { texte: 'Mentions légales et données personnelles', vers: '/mentions-legales' },
  },
]
