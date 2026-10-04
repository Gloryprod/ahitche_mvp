const Expense = require('../models/expense');
const Product = require('../models/product');
const { journaliser, tauxCourant } = require('./journalService');

// Chaque entrée de stock crée automatiquement sa dépense d'exploitation « Achat stock »,
// rattachée au fournisseur (conception, question 7). Elle reste « prévue » jusqu'à ce que la
// comptabilité joigne la facture et la marque effectuée.

const arrondir2 = (n) => Math.round(n * 100) / 100;

async function libelleAchat(lot) {
  const produit = await Product.findById(lot.product).select('name');
  return `Achat ${produit?.name || 'produit'} - lot ${lot.numeroLot}`;
}

async function creerDepenseAchat(req, lot) {
  const taux = await tauxCourant();
  const montant = Math.round(lot.quantiteInitiale * lot.prixAchatUnitaire);
  const depense = await Expense.create({
    categorie: 'Exploitation',
    typeExploitation: 'Achat stock',
    libelle: await libelleAchat(lot),
    partenaireId: lot.fournisseurId || null,
    lotStockId: lot._id,
    montantPrevuFcfa: montant,
    montantPrevuUsd: arrondir2(montant / taux),
    tauxApplique: taux,
    creePar: req.user.id
  });
  await journaliser(req, { action: 'Création', entite: 'Dépense', entiteId: depense._id, resume: `Dépense créée par l'entrée de stock ${lot.numeroLot} : ${montant} FCFA à payer à ${lot.fournisseur}` });
  return depense;
}

// Après modification du lot : la dépense prévue suit (une dépense déjà effectuée ne bouge plus)
async function mettreAJourDepenseAchat(req, lot) {
  const depense = await Expense.findOne({ lotStockId: lot._id, deletedAt: null });
  if (!depense) return creerDepenseAchat(req, lot);
  if (depense.estEffectue) return depense;

  const montant = Math.round(lot.quantiteInitiale * lot.prixAchatUnitaire);
  depense.libelle = await libelleAchat(lot);
  depense.partenaireId = lot.fournisseurId || null;
  depense.montantPrevuFcfa = montant;
  depense.montantPrevuUsd = arrondir2(montant / depense.tauxApplique);
  await depense.save();
  return depense;
}

// Lot supprimé : la dépense prévue disparaît aussi (une dépense effectuée reste, pour l'audit)
async function annulerDepenseAchat(req, lot) {
  const depense = await Expense.findOne({ lotStockId: lot._id, deletedAt: null, estEffectue: false });
  if (!depense) return;
  depense.deletedAt = new Date();
  await depense.save();
  await journaliser(req, { action: 'Suppression', entite: 'Dépense', entiteId: depense._id, resume: `Dépense prévue du lot ${lot.numeroLot} supprimée avec le lot` });
}

module.exports = { creerDepenseAchat, mettreAJourDepenseAchat, annulerDepenseAchat };
