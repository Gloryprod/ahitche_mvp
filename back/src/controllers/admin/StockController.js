const mongoose = require('mongoose');
const { LotStockFifo, MouvementStock, FOURNISSEUR_INTERNE } = require('../../models/stock');
const Product = require('../../models/product');
const User = require('../../models/user');
const { trouverFournisseur } = require('../../services/fournisseurService');
const { echapperRegex } = require('../../utils/texte');
const { rattacherDepenseAchat, mettreAJourDepenseAchat, annulerDepenseAchat } = require('../../services/depenseStockService');
const { consommerStockFIFO } = require('../../services/stockService');
const { journaliser } = require('../../services/journalService');

// Motifs d'une correction saisie à la main (Q 6.5) ; « Comptage » est réservé à la confirmation d'un lot à compter
const RAISONS_SAISIE = ['Perte', 'Péremption', 'Erreur de saisie'];

// Nombre facultatif : vide → null ; invalide ou négatif → NaN (refusé par l'appelant)
function nombreOuVide(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}
const texte = (v, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const estDate = (v) => v && !Number.isNaN(new Date(v).getTime());

async function nomResponsable(req) {
  const u = await User.findById(req.user.id).select('username');
  return u?.username || req.user.role || 'Équipe';
}

// Numéro de lot généré : LOT-<référence produit>-AAAAMMJJ-NN (Q 6.4)
async function genererNumeroLot(produit, date, session = null) {
  if (!produit.reference) return null;
  // Jour à l'heure du Bénin (une date « AAAA-MM-JJ » reste ce jour-là)
  const jour = new Date(date || Date.now()).toLocaleDateString('sv-SE', { timeZone: 'Africa/Porto-Novo' }).replace(/-/g, '');
  const prefixe = `LOT-${produit.reference}-${jour}-`;
  const existants = await LotStockFifo.find({ numeroLot: { $regex: '^' + echapperRegex(prefixe) } }).select('numeroLot').session(session);
  const max = existants.reduce((m, l) => Math.max(m, parseInt(l.numeroLot.slice(prefixe.length), 10) || 0), 0);
  return prefixe + String(max + 1).padStart(2, '0');
}

/**
 * 1. LIRE LES LOTS (GET /api/admin/stock/lots) - Avec Pagination & Recherche
 * ?aConfirmer=1 : seulement les lots à compter ou à vérifier
 */
async function obtenirLotsStock(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const search = req.query.search || '';
    const skip = (page - 1) * limit;

    const filtre = { deletedAt: null };
    if (search) {
      filtre.$or = [
        { numeroLot: { $regex: echapperRegex(search), $options: 'i' } },
        { fournisseur: { $regex: echapperRegex(search), $options: 'i' } },
        { numeroPiece: { $regex: echapperRegex(search), $options: 'i' } }
      ];
    }
    if (req.query.aConfirmer === '1') filtre.aConfirmer = { $gt: '' };

    const lots = await LotStockFifo.find(filtre)
      .populate('product', 'name unit reference')
      .sort({ dateReception: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit + 1);

    const hasMore = lots.length > limit;
    if (hasMore) lots.pop();

    const aConfirmer = await LotStockFifo.countDocuments({ deletedAt: null, aConfirmer: { $gt: '' } });
    return res.status(200).json({ lots, hasMore, aConfirmer });
  } catch (error) {
    console.error("Erreur obtenirLotsStock:", error);
    return res.status(500).json({ message: "Erreur lors de la récupération des lots." });
  }
}

/**
 * 2. ENREGISTRER UNE ENTRÉE (POST /api/admin/stock/lots)
 * Quantité et prix connus, ou lot « à compter » : valeur facturée et ce qu'il faut compter.
 * Le lot se rattache à la dépense de sa pièce ; sans dépense existante, il la crée (sauf creerDepense = false).
 */
async function enregistrerEntreeStock(req, res) {
  try {
    const { productId, fournisseurId, dateReception } = req.body;
    const quantite = nombreOuVide(req.body.quantiteRecue);
    const prix = nombreOuVide(req.body.prixAchatUnitaire);
    const valeur = nombreOuVide(req.body.valeurFcfa);
    const aConfirmer = texte(req.body.aConfirmer);

    if (!mongoose.isValidObjectId(productId) || !fournisseurId) {
      return res.status(400).json({ message: "Choisissez le produit et le fournisseur." });
    }
    if ([quantite, prix, valeur].some(Number.isNaN)) {
      return res.status(400).json({ message: "Quantité, prix et valeur : nombres positifs ou vides." });
    }
    if (quantite === null) {
      if (valeur === null || !aConfirmer) {
        return res.status(400).json({ message: "Lot à compter : indiquez sa valeur facturée et ce qu'il faut compter." });
      }
    } else if (!(quantite > 0) || (prix === null && valeur === null)) {
      return res.status(400).json({ message: "Indiquez une quantité et le prix d'achat unitaire (ou la valeur du lot)." });
    }
    if (dateReception && !estDate(dateReception)) return res.status(400).json({ message: "Date de réception invalide." });

    const produit = await Product.findOne({ _id: productId, deletedAt: null });
    if (!produit) return res.status(400).json({ message: "Produit introuvable." });

    const fournisseurFiche = await trouverFournisseur(fournisseurId);
    if (!fournisseurFiche) {
      return res.status(400).json({ message: "Fournisseur introuvable ou inactif (voir Prestataires)." });
    }

    const date = dateReception || Date.now();
    const numeroLot = texte(req.body.numeroLot, 60) || await genererNumeroLot(produit, date);
    if (!numeroLot) return res.status(400).json({ message: "Ce produit n'a pas de référence : saisissez le numéro de lot." });
    if (await LotStockFifo.exists({ numeroLot, deletedAt: null })) return res.status(400).json({ message: "Ce numéro de lot existe déjà." });

    // Prix déduit de la valeur facturée si seul le montant du lot est connu
    const prixUnitaire = quantite === null ? null : (prix ?? Math.round((valeur / quantite) * 100) / 100);
    const lot = new LotStockFifo({
      numeroLot,
      product: produit._id,
      quantiteInitiale: quantite,
      quantiteRestante: quantite,
      prixAchatUnitaire: prixUnitaire,
      valeurFcfa: valeur ?? (quantite === null ? null : Math.round(quantite * prixUnitaire)),
      fournisseurId: fournisseurFiche._id,
      fournisseur: fournisseurFiche.nom,
      dateReception: date,
      lotFournisseur: texte(req.body.lotFournisseur, 60),
      conditionnement: texte(req.body.conditionnement),
      aConfirmer,
      numeroPiece: texte(req.body.numeroPiece, 60),
      commentaire: texte(req.body.commentaire, 500)
    });

    const { depense, creee } = await rattacherDepenseAchat(req, lot, { creerDepense: req.body.creerDepense !== false });
    await lot.save();

    if (quantite !== null) {
      await MouvementStock.create({
        product: produit._id,
        lotId: lot._id,
        type: 'entree',
        quantite,
        motif: `Réception de marchandise auprès de ${lot.fournisseur}${lot.numeroPiece ? ` (pièce ${lot.numeroPiece})` : ''}`,
        responsable: await nomResponsable(req)
      });
    }
    await journaliser(req, {
      action: 'Création', entite: 'Lot de stock', entiteId: lot._id,
      resume: `Entrée ${lot.numeroLot} : ${produit.name}, ${quantite === null ? `à compter (${aConfirmer})` : `${quantite} ${produit.unit}`}${depense ? (creee ? ', dépense créée' : `, rattachée à la dépense de la pièce ${lot.numeroPiece}`) : ''}`
    });

    const message = depense && !creee
      ? `Entrée enregistrée, rattachée à la dépense existante de la pièce ${lot.numeroPiece}.`
      : "Entrée enregistrée avec succès !";
    return res.status(201).json({ message, lot, depenseRattachee: !!depense, depenseCreee: creee });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: "Ce numéro de lot existe déjà." });
    console.error("Erreur enregistrerEntreeStock:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

/**
 * 3. MODIFIER UN LOT (PUT /api/admin/stock/lots/:id)
 * Informations du lot uniquement : la quantité change par un comptage ou une correction motivée.
 */
async function modifierLotStock(req, res) {
  try {
    const { id } = req.params;
    const { numeroLot, productId, fournisseurId, dateReception } = req.body;

    const lot = await LotStockFifo.findOne({ _id: id, deletedAt: null });
    if (!lot) {
      return res.status(404).json({ message: "Lot introuvable ou archivé." });
    }
    const avant = lot.toObject();

    const quantite = nombreOuVide(req.body.quantiteRecue);
    if (req.body.quantiteRecue !== undefined && quantite !== lot.quantiteInitiale) {
      return res.status(400).json({ message: "La quantité se modifie par « Compter » ou « Corriger », avec un motif." });
    }

    const prix = nombreOuVide(req.body.prixAchatUnitaire);
    if (Number.isNaN(prix)) return res.status(400).json({ message: "Prix d'achat invalide." });
    if (req.body.prixAchatUnitaire !== undefined && lot.quantiteInitiale !== null) {
      lot.prixAchatUnitaire = prix;
    }

    if (fournisseurId && String(fournisseurId) !== String(lot.fournisseurId)) {
      const fournisseurFiche = await trouverFournisseur(fournisseurId);
      if (!fournisseurFiche) {
        return res.status(400).json({ message: "Fournisseur introuvable ou inactif (voir Prestataires)." });
      }
      lot.fournisseurId = fournisseurFiche._id;
      lot.fournisseur = fournisseurFiche.nom;
    }
    if (dateReception !== undefined) {
      if (dateReception && !estDate(dateReception)) return res.status(400).json({ message: "Date de réception invalide." });
      lot.dateReception = dateReception || null;
    }
    if (numeroLot) lot.numeroLot = texte(numeroLot, 60);
    if (productId && String(productId) !== String(lot.product)) {
      const sorties = await MouvementStock.countDocuments({ lotId: lot._id, type: { $ne: 'entree' } });
      if (sorties) return res.status(400).json({ message: "Ce lot a déjà des mouvements : son produit ne peut plus changer." });
      if (!await Product.exists({ _id: productId, deletedAt: null })) return res.status(400).json({ message: "Produit introuvable." });
      lot.product = productId;
      await MouvementStock.updateMany({ lotId: lot._id }, { $set: { product: productId } });
    }
    for (const champ of ['lotFournisseur', 'conditionnement', 'aConfirmer', 'numeroPiece', 'commentaire']) {
      if (req.body[champ] !== undefined) lot[champ] = texte(req.body[champ], champ === 'commentaire' ? 500 : 300);
    }

    await lot.save();
    await mettreAJourDepenseAchat(req, lot);
    await journaliser(req, {
      action: 'Modification', entite: 'Lot de stock', entiteId: lot._id,
      resume: `Lot ${lot.numeroLot} modifié`,
      avant: { prixAchatUnitaire: avant.prixAchatUnitaire, fournisseur: avant.fournisseur, dateReception: avant.dateReception, aConfirmer: avant.aConfirmer, numeroPiece: avant.numeroPiece },
      apres: { prixAchatUnitaire: lot.prixAchatUnitaire, fournisseur: lot.fournisseur, dateReception: lot.dateReception, aConfirmer: lot.aConfirmer, numeroPiece: lot.numeroPiece }
    });

    return res.status(200).json({ message: "Lot mis à jour avec succès !", lot });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: "Ce numéro de lot existe déjà." });
    console.error("Erreur modifierLotStock:", error);
    return res.status(500).json({ message: "Erreur lors de la modification du lot." });
  }
}

/**
 * 4. SUPPRESSION LOGIQUE (DELETE /api/admin/stock/lots/:id)
 */
async function supprimerLotStock(req, res) {
  try {
    const lotSupprime = await LotStockFifo.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { deletedAt: Date.now() },
      { new: true }
    );
    if (!lotSupprime) {
      return res.status(404).json({ message: "Ce lot n'existe pas." });
    }

    if (lotSupprime.quantiteRestante > 0) {
      await MouvementStock.create({
        product: lotSupprime.product,
        lotId: lotSupprime._id,
        type: 'correction_negative',
        quantite: lotSupprime.quantiteRestante,
        motif: `Lot supprimé de l'inventaire (N° ${lotSupprime.numeroLot})`,
        responsable: await nomResponsable(req)
      });
    }
    await annulerDepenseAchat(req, lotSupprime);
    await journaliser(req, { action: 'Suppression', entite: 'Lot de stock', entiteId: lotSupprime._id, resume: `Lot ${lotSupprime.numeroLot} supprimé (reste ${lotSupprime.quantiteRestante ?? 'non compté'})` });

    return res.status(200).json({ message: "Le lot a été retiré de l'inventaire." });
  } catch (error) {
    console.error("Erreur supprimerLotStock:", error);
    return res.status(500).json({ message: "Erreur lors de la suppression logique du lot." });
  }
}

/**
 * 5. COMPTER UN LOT (POST /api/admin/stock/lots/:id/comptage)
 * Lot à compter : la quantité comptée entre en stock ; le prix unitaire se déduit de la valeur facturée.
 */
async function compterLot(req, res) {
  try {
    const quantite = nombreOuVide(req.body.quantite);
    if (!(quantite > 0)) return res.status(400).json({ message: "Indiquez la quantité comptée." });

    const lot = await LotStockFifo.findOne({ _id: req.params.id, deletedAt: null }).populate('product', 'name unit');
    if (!lot) return res.status(404).json({ message: "Lot introuvable." });
    if (lot.quantiteInitiale !== null) return res.status(400).json({ message: "Ce lot est déjà compté : utilisez « Corriger »." });

    const avant = { aConfirmer: lot.aConfirmer };
    lot.quantiteInitiale = quantite;
    lot.quantiteRestante = quantite;
    if (lot.valeurFcfa !== null) lot.prixAchatUnitaire = Math.round((lot.valeurFcfa / quantite) * 100) / 100;
    lot.aConfirmer = '';
    await lot.save();

    await MouvementStock.create({
      product: lot.product._id, lotId: lot._id, type: 'entree', quantite, raison: 'Comptage',
      motif: `Comptage du lot ${lot.numeroLot}${texte(req.body.commentaire) ? ` : ${texte(req.body.commentaire)}` : ''}`,
      responsable: await nomResponsable(req)
    });
    await journaliser(req, {
      action: 'Validation', entite: 'Lot de stock', entiteId: lot._id,
      resume: `Lot ${lot.numeroLot} compté : ${quantite} ${lot.product.unit}${lot.prixAchatUnitaire !== null ? `, soit ${lot.prixAchatUnitaire} FCFA l'unité` : ''}`,
      avant, apres: { quantiteInitiale: quantite, prixAchatUnitaire: lot.prixAchatUnitaire }
    });
    return res.status(200).json({ message: "Comptage enregistré.", lot });
  } catch (error) {
    console.error("Erreur compterLot:", error);
    return res.status(500).json({ message: "Erreur lors du comptage." });
  }
}

/**
 * 6. CORRIGER UN LOT (POST /api/admin/stock/lots/:id/correction)
 * { sens: 'positive' | 'negative', quantite, raison: Perte | Péremption | Erreur de saisie, commentaire }
 */
async function corrigerLot(req, res) {
  try {
    const { sens } = req.body;
    const quantite = nombreOuVide(req.body.quantite);
    const raison = req.body.raison;
    if (!['positive', 'negative'].includes(sens) || !(quantite > 0)) {
      return res.status(400).json({ message: "Indiquez le sens et la quantité de la correction." });
    }
    if (!RAISONS_SAISIE.includes(raison)) return res.status(400).json({ message: "Motif invalide (perte, péremption ou erreur de saisie)." });
    if (sens === 'positive' && raison !== 'Erreur de saisie') {
      return res.status(400).json({ message: "Une perte ou une péremption retire du stock." });
    }

    const lot = await LotStockFifo.findOne({ _id: req.params.id, deletedAt: null }).populate('product', 'name unit');
    if (!lot) return res.status(404).json({ message: "Lot introuvable." });
    if (lot.quantiteRestante === null) return res.status(400).json({ message: "Lot à compter : enregistrez d'abord le comptage." });
    if (sens === 'negative' && quantite > lot.quantiteRestante) {
      return res.status(400).json({ message: `Il ne reste que ${lot.quantiteRestante} ${lot.product.unit} dans ce lot.` });
    }

    const avant = lot.quantiteRestante;
    lot.quantiteRestante = Math.round((avant + (sens === 'positive' ? quantite : -quantite)) * 1000) / 1000;
    await lot.save();
    const commentaire = texte(req.body.commentaire);
    await MouvementStock.create({
      product: lot.product._id, lotId: lot._id, type: `correction_${sens}`, quantite, raison,
      motif: `${raison}${commentaire ? ` : ${commentaire}` : ''}`,
      responsable: await nomResponsable(req)
    });
    await journaliser(req, {
      action: 'Modification', entite: 'Lot de stock', entiteId: lot._id,
      resume: `Correction du lot ${lot.numeroLot} (${raison}) : ${sens === 'positive' ? '+' : '−'}${quantite} ${lot.product.unit}`,
      avant: { quantiteRestante: avant }, apres: { quantiteRestante: lot.quantiteRestante }
    });
    return res.status(200).json({ message: "Correction enregistrée.", lot });
  } catch (error) {
    console.error("Erreur corrigerLot:", error);
    return res.status(500).json({ message: "Erreur lors de la correction." });
  }
}

/**
 * 7. ESSAI (POST /api/admin/stock/essais) : sortie FIFO pour un test (moulin, recette)
 */
async function enregistrerEssai(req, res) {
  const session = await mongoose.startSession();
  try {
    const quantite = nombreOuVide(req.body.quantite);
    const commentaire = texte(req.body.commentaire);
    if (!mongoose.isValidObjectId(req.body.productId) || !(quantite > 0) || !commentaire) {
      return res.status(400).json({ message: "Indiquez le produit, la quantité et l'objet de l'essai." });
    }
    const produit = await Product.findOne({ _id: req.body.productId, deletedAt: null });
    if (!produit) return res.status(400).json({ message: "Produit introuvable." });

    const responsable = await nomResponsable(req);
    session.startTransaction();
    await consommerStockFIFO(produit._id, quantite, `Essai : ${commentaire}`, session, { type: 'essai', responsable });
    await journaliser(req, { action: 'Modification', entite: 'Lot de stock', entiteId: produit._id, resume: `Essai : ${quantite} ${produit.unit} de ${produit.name} (${commentaire})` }, session);
    await session.commitTransaction();
    return res.status(201).json({ message: "Essai enregistré." });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    if (/Stock insuffisant/.test(error.message)) return res.status(400).json({ message: error.message });
    console.error("Erreur enregistrerEssai:", error);
    return res.status(500).json({ message: "Erreur lors de l'enregistrement de l'essai." });
  } finally {
    session.endSession();
  }
}

/**
 * 8. TRANSFORMATION (POST /api/admin/stock/transformations)
 * { matiereId, quantiteMatiere, produitId, quantiteObtenue, date, numeroLot?, commentaire }
 * La matière sort en FIFO ; le produit obtenu entre dans un lot « Production interne » valorisé au coût
 * de la matière consommée ; le rendement est consigné.
 */
async function enregistrerTransformation(req, res) {
  const session = await mongoose.startSession();
  try {
    const quantiteMatiere = nombreOuVide(req.body.quantiteMatiere);
    const quantiteObtenue = nombreOuVide(req.body.quantiteObtenue);
    const { matiereId, produitId, date } = req.body;
    if (!mongoose.isValidObjectId(matiereId) || !mongoose.isValidObjectId(produitId) || String(matiereId) === String(produitId)) {
      return res.status(400).json({ message: "Choisissez la matière et le produit obtenu." });
    }
    if (!(quantiteMatiere > 0) || !(quantiteObtenue > 0)) return res.status(400).json({ message: "Indiquez les deux quantités." });
    if (!estDate(date)) return res.status(400).json({ message: "Indiquez la date de la transformation." });

    const [matiere, produit] = await Promise.all([
      Product.findOne({ _id: matiereId, deletedAt: null }),
      Product.findOne({ _id: produitId, deletedAt: null })
    ]);
    if (!matiere || !produit) return res.status(400).json({ message: "Produit introuvable." });

    const numeroLot = texte(req.body.numeroLot, 60) || await genererNumeroLot(produit, date);
    if (!numeroLot) return res.status(400).json({ message: "Ce produit n'a pas de référence : saisissez le numéro de lot." });

    const transformationId = new mongoose.Types.ObjectId();
    const responsable = await nomResponsable(req);
    const commentaire = texte(req.body.commentaire, 500);
    session.startTransaction();

    const { cout } = await consommerStockFIFO(matiere._id, quantiteMatiere, `Transformation en ${produit.name}`, session, { type: 'transformation_sortie', transformationId, responsable });
    const rendement = Math.round((quantiteObtenue / quantiteMatiere) * 1000) / 1000;
    const [lot] = await LotStockFifo.create([{
      numeroLot,
      product: produit._id,
      quantiteInitiale: quantiteObtenue,
      quantiteRestante: quantiteObtenue,
      prixAchatUnitaire: cout === null ? null : Math.round((cout / quantiteObtenue) * 100) / 100,
      valeurFcfa: cout === null ? null : Math.round(cout),
      fournisseurId: null,
      fournisseur: FOURNISSEUR_INTERNE,
      dateReception: date,
      aConfirmer: cout === null ? "Coût de la matière à renseigner (lot de matière sans prix)" : '',
      transformationId,
      commentaire
    }], { session });
    await MouvementStock.create([{
      product: produit._id, lotId: lot._id, type: 'transformation_entree', quantite: quantiteObtenue,
      transformationId, rendement, responsable,
      motif: `Transformation de ${quantiteMatiere} ${matiere.unit} de ${matiere.name} (rendement ${Math.round(rendement * 100)} %)`
    }], { session });
    await journaliser(req, {
      action: 'Création', entite: 'Lot de stock', entiteId: lot._id,
      resume: `Transformation : ${quantiteMatiere} ${matiere.unit} de ${matiere.name} → ${quantiteObtenue} ${produit.unit} de ${produit.name} (lot ${lot.numeroLot}, rendement ${Math.round(rendement * 100)} %)`
    }, session);

    await session.commitTransaction();
    return res.status(201).json({ message: "Transformation enregistrée.", lot, rendement });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    if (/Stock insuffisant/.test(error.message)) return res.status(400).json({ message: error.message });
    if (error.code === 11000) return res.status(400).json({ message: "Ce numéro de lot existe déjà." });
    console.error("Erreur enregistrerTransformation:", error);
    return res.status(500).json({ message: "Erreur lors de la transformation." });
  } finally {
    session.endSession();
  }
}

module.exports = {
  obtenirLotsStock,
  enregistrerEntreeStock,
  modifierLotStock,
  supprimerLotStock,
  compterLot,
  corrigerLot,
  enregistrerEssai,
  enregistrerTransformation,
  genererNumeroLot
};
