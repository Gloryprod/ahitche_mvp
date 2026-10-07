// Outils communs aux formules : lien WhatsApp pré-rempli et prix de vente

const WHATSAPP_NUMERO = '22998136635';

// Montant FCFA avec espaces de milliers (« 10 800 »)
const formaterMontant = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// Lien WhatsApp de commande d'une formule ; sans prix (à définir), le message ne cite pas de montant
function lienWhatsAppFormule(formule) {
  const prix = formule.prixCommercial ?? formule.prixActuel;
  const message = prix === null || prix === undefined
    ? `Bonjour Ahitché ! Je souhaite des informations sur la formule ${formule.nom}.`
    : `Bonjour Ahitché ! Je souhaite commander la formule ${formule.nom} (${formaterMontant(prix)} FCFA).`;
  return `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(message)}`;
}

// Prix de vente : prix fixé par l'admin, sinon prix du référentiel ; null si aucun prix n'est encore fixé
const prixDeVente = (formule) => formule.prixCommercial ?? formule.prixActuel ?? null;

module.exports = { lienWhatsAppFormule, prixDeVente };
