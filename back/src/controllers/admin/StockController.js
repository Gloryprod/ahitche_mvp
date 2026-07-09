const { LotStockFifo, MouvementStock } = require('../../models/stock');

/**
 * 1. LIRE LES LOTS (GET /api/stock/lots) - Avec Pagination & Recherche
 * Exclut les lots supprimés logiquement (deletedAt: null)
 */
async function obtenirLotsStock(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const skip = (page - 1) * limit;

    // Filtre de base : On ne prend que les lots NON supprimés
    let filtre = { deletedAt: null };

    // Si une recherche est tapée (recherche par numéro de lot ou par fournisseur)
    if (search) {
      filtre.$or = [
        { numeroLot: { $regex: search, $options: 'i' } },
        { fournisseur: { $regex: search, $options: 'i' } }
      ];
    }

    // Récupération des lots avec jointure sur le produit
    const lots = await LotStockFifo.find(filtre)
      .populate('product', 'name unit') // Peuple le nom et l'unité du produit
      .sort({ dateReception: -1 }) // Les plus récents d'abord dans le tableau
      .skip(skip)
      .limit(limit + 1); // +1 pour savoir s'il y a une page suivante (hasMore)

    const hasMore = lots.length > limit;
    if (hasMore) {
      lots.pop(); // On retire le lot en trop utilisé pour le test hasMore
    }

    return res.status(200).json({
      lots,
      hasMore
    });
  } catch (error) {
    console.error("Erreur obtenirLotsStock:", error);
    return res.status(500).json({ message: "Erreur lors de la récupération des lots." });
  }
}

/**
 * 2. ENREGISTRER UNE ENTRÉE (POST /api/admin/stock/lots)
 * (Code déjà validé ensemble, conservé pour le fichier unique)
 */
async function enregistrerEntreeStock(req, res) {
  try {
    const { numeroLot, productId, quantiteRecue, prixAchatUnitaire, fournisseur, dateReception } = req.body;

    if (!numeroLot || !productId || !quantiteRecue || !prixAchatUnitaire || !fournisseur) {
      return res.status(400).json({ message: "Veuillez remplir tous les champs obligatoires." });
    }

    const nouveauLot = await LotStockFifo.create({
      numeroLot,
      product: productId,
      quantiteInitiale: quantiteRecue,
      quantiteRestante: quantiteRecue,
      prixAchatUnitaire,
      fournisseur,
      dateReception: dateReception || Date.now()
    });

    await MouvementStock.create({
      product: productId,
      lotId: nouveauLot._id,
      type: 'entree',
      quantite: quantiteRecue,
      motif: `Réception de marchandise auprès de ${fournisseur}`
    });

    return res.status(201).json({ message: "✅ Entrée enregistrée avec succès !", lot: nouveauLot });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: "Ce numéro de lot existe déjà." });
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

/**
 * 3. MODIFIER UN LOT (PUT /api/stock/lots/:id)
 * Permet d'ajuster le prix, fournisseur, date ou quantités
 */
async function modifierLotStock(req, res) {
  try {
    const { id } = req.params;
    const { numeroLot, productId, quantiteRecue, prixAchatUnitaire, fournisseur, dateReception } = req.body;

    const lot = await LotStockFifo.findOne({ _id: id, deletedAt: null });
    if (!lot) {
      return res.status(404).json({ message: "Lot introuvable ou archivé." });
    }

    // Si le gestionnaire modifie la quantité initiale reçue, on ajuste la quantité restante en conséquence
    if (quantiteRecue !== undefined && quantiteRecue !== lot.quantiteInitiale) {
      const difference = quantiteRecue - lot.quantiteInitiale;
      lot.quantiteRestante = Math.max(0, lot.quantiteRestante + difference);
      lot.quantiteInitiale = quantiteRecue;
    }

    if (prixAchatUnitaire !== undefined) lot.prixAchatUnitaire = prixAchatUnitaire;
    if (fournisseur) lot.fournisseur = fournisseur;
    if (dateReception) lot.dateReception = dateReception;
    if (numeroLot) lot.numeroLot = numeroLot;
    if (productId) lot.product = productId;

    await lot.save();

    return res.status(200).json({ message: "Lot mis à jour avec succès !", lot });
  } catch (error) {
    console.error("Erreur modifierLotStock:", error);
    return res.status(500).json({ message: "Erreur lors de la modification du lot." });
  }
}

/**
 * 4. SUPPRESSION LOGIQUE (DELETE /api/stock/lots/:id)
 * Utilise deletedAt au lieu d'un .remove() physique
 */
async function supprimerLotStock(req, res) {
  try {
    const { id } = req.params;

    // On applique le soft delete en mettant la date du jour dans 'deletedAt'
    const lotSupprime = await LotStockFifo.findByIdAndUpdate(
      id,
      { deletedAt: Date.now() },
      { new: true }
    );

    if (!lotSupprime) {
      return res.status(404).json({ message: "Ce lot n'existe pas." });
    }

    // Facultatif : On peut loguer cette suppression dans l'historique des mouvements
    await MouvementStock.create({
      product: lotSupprime.product,
      lotId: lotSupprime._id,
      type: 'correction_negative',
      quantite: lotSupprime.quantiteRestante,
      motif: `Lot supprimé logiquement de l'inventaire (N° ${lotSupprime.numeroLot})`
    });

    return res.status(200).json({ message: "Le lot a été retiré de l'affichage avec succès (Soft Delete)." });
  } catch (error) {
    console.error("Erreur supprimerLotStock:", error);
    return res.status(500).json({ message: "Erreur lors de la suppression logique du lot." });
  }
}

module.exports = {
  obtenirLotsStock,
  enregistrerEntreeStock,
  modifierLotStock,
  supprimerLotStock
};