import { quantiteEtUnite } from '@/config/vip'

// Messages WhatsApp pré-remplis des commandes de l'espace client : pack (« Commander rapidement ») et achat libre VIP.
// Le montant et la référence viennent de la commande enregistrée par le serveur quand elle existe.

export interface InfosLivraison {
  quartier: string
  zone: string // Nom lisible de la zone (« Akpakpa, Cotonou »), vide si inconnue
  adresse: string
  lienLocalisation: string
  telephone: string
}

const fcfa = (montant: number) => `${montant.toLocaleString('fr-FR')} FCFA`

// Partie commune : infos de livraison du client, ou rappel qu'elles manquent
export function texteLivraison(infos: InfosLivraison): string {
  if (!infos.quartier && !infos.telephone) {
    return `⚠️ _Je n'ai pas encore renseigné mes détails de livraison, nous ferons le point ici._`
  }
  let texte = `📍 *Infos de livraison :*\n`
  texte += `- *Quartier :* ${infos.quartier || 'Non spécifié'}${infos.zone ? ` (${infos.zone})` : ''}\n`
  texte += `- *Repères/Maison :* ${infos.adresse || 'Non spécifié'}\n`
  if (infos.lienLocalisation) texte += `- *Localisation :* ${infos.lienLocalisation}\n`
  texte += `- *Contact de livraison :* ${infos.telephone || 'Non spécifié'}`
  return texte
}

// Achat libre enregistré : référence, total fixé par le serveur, demandes libres dont le prix reste à confirmer
export function messageAchatLibre(commande: { reference: string; total: number; demandesAChiffrer: number }, infos: InfosLivraison): string {
  let message = `Bonjour Ahitché ! 👋\n\n`
  message += `Je viens de passer un *achat libre VIP*.\n`
  message += `Référence de commande : *${commande.reference}*\n`
  // Commande faite seulement de demandes libres : pas de ligne « Total des produits » à 0
  if (commande.total > 0) message += `Total des produits : *${fcfa(commande.total)}*\n`
  const n = commande.demandesAChiffrer
  if (n) message += `J'ai ajouté ${n > 1 ? `${n} demandes libres` : '1 demande libre'} : merci de m'envoyer ${n > 1 ? 'leur' : 'son'} prix avant la livraison.\n`
  return `${message}\n${texteLivraison(infos)}`
}

// Achat libre non enregistré (réseau ou serveur indisponible) : le panier est recopié pour finir sur WhatsApp
export function messageAchatLibreSecours(
  panier: { nom: string; quantite: number; unite: string }[],
  demandes: { designation: string; quantite: string }[],
  totalIndicatif: number,
  infos: InfosLivraison,
): string {
  let message = `Bonjour Ahitché ! 👋\n\nJe souhaite passer un *achat libre VIP* :\n`
  for (const p of panier) message += `- ${p.nom} : ${quantiteEtUnite(p.quantite, p.unite)}\n`
  if (demandes.length) {
    message += `\nDemandes libres (merci de m'envoyer leur prix avant la livraison) :\n`
    for (const d of demandes) message += `- ${d.designation}${d.quantite ? ` (${d.quantite})` : ''}\n`
  }
  if (panier.length) message += `\nTotal des produits : *${fcfa(totalIndicatif)}*\n`
  return `${message}\n${texteLivraison(infos)}`
}
