// Outils communs aux formules : lien WhatsApp pré-rempli et prix de vente
const Formule = require('../models/formules');

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

/**
 * Prix de vente affichés sur la vitrine (cartes, « dès … FCFA », données structurées, llms.txt), lus en une requête.
 * Pour chaque slug : le prix de vente si la formule est active, commandable (pas « bientôt disponible ») et a un prix
 * positif ; null sinon (formule absente, inactive, bientôt disponible ou sans prix) : le site garde alors le prix du code.
 * @param {string[]} slugs
 * @returns {Promise<Record<string, number | null>>}
 */
async function prixVitrine(slugs) {
  const formules = await Formule.find({ slug: { $in: slugs } })
    .select('slug prixCommercial prixActuel statut bientotDisponible').lean();
  return Object.fromEntries(slugs.map((slug) => {
    const f = formules.find((x) => x.slug === slug);
    const prix = f && f.statut === 'actif' && !f.bientotDisponible ? prixDeVente(f) : null;
    return [slug, Number.isFinite(prix) && prix > 0 ? prix : null];
  }));
}

module.exports = { lienWhatsAppFormule, prixDeVente, prixVitrine };
