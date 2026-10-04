// Questions fréquentes de l'accueil : réponses fondées sur les règles validées (docs/conception-menu-admin.md).
// Elles alimentent aussi les données structurées FAQPage (référencement local).
import { DELAI_LIVRAISON, HORAIRES } from './contact'
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
    reponse: 'Vous payez à la livraison, une fois vos vivres reçus, par MTN MoMo ou Moov Money. Rien n\'est à régler à l\'avance.',
  },
  {
    question: 'Où livrez-vous ?',
    reponse: 'À Cotonou et à Abomey-Calavi, dans 22 zones de livraison couvrant leurs arrondissements. Indiquez votre quartier à la commande : nous confirmons la zone avec vous.',
  },
  {
    question: 'Quels sont les délais de livraison ?',
    reponse: `Vous êtes livré sous ${DELAI_LIVRAISON} après confirmation de la commande. Le livreur vous appelle avant d'arriver. Nous répondons sur WhatsApp : ${HORAIRES}.`,
  },
  {
    question: 'Que contient un pack ?',
    reponse: `Les ${PRODUITS_INCLUS.length} produits de base (riz local, gari, haricots, huile, tomates, oignons…), en quantités adaptées à la formule et à la taille de votre foyer. Le contenu exact peut varier selon les saisons. La formule Essentiel ne contient pas d'huile de palme.`,
  },
  {
    question: 'Et si un produit manque ou si la livraison est en retard ?',
    reponse: 'C\'est la garantie Ahitché : si votre formule est incomplète ou livrée avec plus de 24 h de retard, le produit manquant ou un bon de compensation vous est offert à la livraison suivante.',
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
