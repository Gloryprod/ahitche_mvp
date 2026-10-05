const Expense = require('../models/expense');
const Product = require('../models/product');
const { journaliser, tauxCourant } = require('./journalService');

// Une seule dépense par achat (Q 6.3) : une entrée de stock se rattache à la dépense qui porte son numéro
// de pièce. Sans dépense existante, elle crée sa dépense d'exploitation « Achat stock », rattachée au
// fournisseur, sauf si l'on précise qu'elle ne doit pas en créer (import du stock de départ : les factures
// sont déjà dans les dépenses). La dépense reste « prévue » jusqu'à ce que la comptabilité joigne la facture.

const arrondir2 = (n) => Math.round(n * 100) / 100;

async function libelleAchat(lot) {
  const produit = await Product.findById(lot.product).select('name');
  return `Achat ${produit?.name || 'produit'} - lot ${lot.numeroLot}`;
}

// Montant du lot : valeur facturée, sinon quantité × prix d'achat ; null si inconnu
function montantLot(lot) {
  if (lot.valeurFcfa !== null && lot.valeurFcfa !== undefined) return Math.round(lot.valeurFcfa);
  if (lot.quantiteInitiale === null || lot.prixAchatUnitaire === null) return null;
  return Math.round(lot.quantiteInitiale * lot.prixAchatUnitaire);
}

// Dépense existante portant ce numéro de pièce (null si aucune)
async function depenseDeLaPiece(numeroPiece, session = null) {
  if (!numeroPiece) return null;
  return Expense.findOne({ numeroPiece, deletedAt: null }).session(session);
}

/**
 * Rattache le lot à la dépense de sa pièce, ou crée la dépense si demandé.
 * Renvoie { depense, creee } ; le lot reçoit depenseId (à enregistrer par l'appelant).
 */
async function rattacherDepenseAchat(req, lot, { creerDepense = true, session = null } = {}) {
  const existante = await depenseDeLaPiece(lot.numeroPiece, session);
  if (existante) {
    lot.depenseId = existante._id;
    return { depense: existante, creee: false };
  }
  if (!creerDepense) return { depense: null, creee: false };

  const montant = montantLot(lot);
  if (montant === null) return { depense: null, creee: false };
  const taux = await tauxCourant();
  const [depense] = await Expense.create([{
    categorie: 'Exploitation',
    typeExploitation: 'Achat stock',
    libelle: await libelleAchat(lot),
    partenaireId: lot.fournisseurId || null,
    lotStockId: lot._id,
    numeroPiece: lot.numeroPiece || '',
    montantPrevuFcfa: montant,
    montantPrevuUsd: arrondir2(montant / taux),
    tauxApplique: taux,
    creePar: req.user.id
  }], { session });
  lot.depenseId = depense._id;
  await journaliser(req, { action: 'Création', entite: 'Dépense', entiteId: depense._id, resume: `Dépense créée par l'entrée de stock ${lot.numeroLot} : ${montant} FCFA à payer à ${lot.fournisseur}` }, session);
  return { depense, creee: true };
}

// Après modification du lot : seule la dépense créée par ce lot suit (une dépense déjà effectuée,
// ou celle d'une facture saisie dans les Finances, ne bouge pas)
async function mettreAJourDepenseAchat(req, lot) {
  const depense = await Expense.findOne({ lotStockId: lot._id, deletedAt: null });
  if (!depense || depense.estEffectue) return depense;

  const montant = montantLot(lot);
  depense.libelle = await libelleAchat(lot);
  depense.partenaireId = lot.fournisseurId || null;
  depense.numeroPiece = lot.numeroPiece || '';
  if (montant !== null) {
    depense.montantPrevuFcfa = montant;
    depense.montantPrevuUsd = arrondir2(montant / depense.tauxApplique);
  }
  await depense.save();
  return depense;
}

// Lot supprimé : la dépense prévue créée par ce lot disparaît aussi (une dépense effectuée reste, pour l'audit)
async function annulerDepenseAchat(req, lot) {
  const depense = await Expense.findOne({ lotStockId: lot._id, deletedAt: null, estEffectue: false });
  if (!depense) return;
  depense.deletedAt = new Date();
  await depense.save();
  await journaliser(req, { action: 'Suppression', entite: 'Dépense', entiteId: depense._id, resume: `Dépense prévue du lot ${lot.numeroLot} supprimée avec le lot` });
}

module.exports = { rattacherDepenseAchat, mettreAJourDepenseAchat, annulerDepenseAchat, depenseDeLaPiece, montantLot };
