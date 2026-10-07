const mongoose = require('mongoose');
const Product = require('../models/product');
const { prixDeVente } = require('./formuleService');

// Prix d'une commande saisie dans l'admin (décision D-10) : le serveur impose le prix de la formule.
//   total = prix de la formule + extras (au prix du catalogue) − remise validée
// Une remise exige un motif ; saisie par l'admin, elle est validée d'office, sinon elle attend sa validation
// et ne s'applique pas au total d'ici là. Les ajustements de quantité des produits du pack ne changent pas le prix.
// D-06 : Mobile Money ou espèces (l'acompte reste lisible sur les anciennes commandes).
const MODES_PAIEMENT_ACCEPTES = ['Mobile Money', 'Espèces'];

const nombre = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * @param {object} p
 * @param {object} p.formule - document Formule
 * @param {Array} p.lignes - [{ productId, quantity, isExtra }] envoyées par le formulaire (prix ignorés)
 * @param {{ montant?, motif? }} [p.remise]
 * @param {{ id, role }} p.utilisateur
 * @param {object} [p.remiseExistante] - remise déjà enregistrée sur la commande (modification)
 */
async function calculerPrixCommande({ formule, lignes, remise, utilisateur, remiseExistante }) {
  const prixFormule = prixDeVente(formule);
  if (prixFormule === null) return { erreur: "Le prix de cette formule n'est pas encore fixé." };
  if (!Array.isArray(lignes)) return { erreur: 'Panier invalide.' };

  const ids = lignes.map(l => l.productId).filter(id => mongoose.isValidObjectId(id));
  const produits = new Map((await Product.find({ _id: { $in: ids }, deletedAt: null })).map(p => [String(p._id), p]));

  const snapshots = [];
  let montantExtras = 0;
  for (const ligne of lignes) {
    const produit = produits.get(String(ligne.productId));
    const quantite = nombre(ligne.quantity);
    if (!produit) return { erreur: 'Un produit du panier est introuvable dans le catalogue.' };
    if (!(quantite > 0)) return { erreur: `Quantité invalide pour ${produit.name}.` };
    const prix = produit.priceUnit;
    if (ligne.isExtra) {
      if (prix === null || prix === undefined) return { erreur: `${produit.name} n'a pas de prix : il ne peut pas être ajouté en extra.` };
      if (produit.statut === 'indisponible') return { erreur: `${produit.name} est indisponible.` };
      montantExtras += quantite * prix;
    }
    snapshots.push({
      productId: produit._id, name: produit.name, quantity: quantite, unit: produit.unit,
      unitPrice: prix ?? null, totalPrice: prix === null || prix === undefined ? null : quantite * prix,
      isExtra: !!ligne.isExtra
    });
  }

  const brut = prixFormule + montantExtras;
  const montant = remise?.montant === undefined || remise?.montant === null || remise?.montant === '' ? 0 : nombre(remise.montant);
  const motif = typeof remise?.motif === 'string' ? remise.motif.trim().slice(0, 300) : '';
  if (!(montant >= 0)) return { erreur: 'Montant de remise invalide.' };
  if (montant > brut) return { erreur: 'La remise dépasse le prix de la commande.' };
  if (montant > 0 && motif.length < 3) return { erreur: 'Indiquez le motif de la remise.' };

  let remiseFinale = { montant: 0, motif: '', statut: 'Aucune', demandeePar: null, valideePar: null, valideeLe: null };
  if (montant > 0) {
    const inchangee = remiseExistante && remiseExistante.montant === montant && remiseExistante.motif === motif;
    if (inchangee && ['Validée', 'À valider', 'Refusée'].includes(remiseExistante.statut)) {
      remiseFinale = { ...remiseExistante };
    } else if (utilisateur.role === 'admin') {
      remiseFinale = { montant, motif, statut: 'Validée', demandeePar: utilisateur.id, valideePar: utilisateur.id, valideeLe: new Date() };
    } else {
      remiseFinale = { montant, motif, statut: 'À valider', demandeePar: utilisateur.id, valideePar: null, valideeLe: null };
    }
  }

  const total = brut - (remiseFinale.statut === 'Validée' ? remiseFinale.montant : 0);
  return { prixFormule, montantExtras, remise: remiseFinale, total, snapshots };
}

module.exports = { MODES_PAIEMENT_ACCEPTES, calculerPrixCommande };
