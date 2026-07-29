const Order = require('../../models/order');
const Formule = require('../../models/formules');
const OrderProductSnapshot = require('../../models/orderProductSnapshot');
const mongoose = require('mongoose');
const { consommerStockFIFO } = require('../../services/stockService');


async function createAdminOrder(req, res) {
  try {
    // 💡 Récupération de productsSnapshot envoyé par le client Vue
    const { client, formuleSlug, modePaiement, notes, totalPrice, productsSnapshot } = req.body;

    // 1. Validations de base
    if (!client || !formuleSlug || !totalPrice || !productsSnapshot || !Array.isArray(productsSnapshot)) {
      return res.status(400).json({ message: "Données manquantes ou panier invalide (client, formuleSlug, total, productsSnapshot)." });
    }

    // 2. Récupérer le nom de la formule configurée
    const formuleInfo = await Formule.findOne({ slug: formuleSlug });
    if (!formuleInfo) {
      return res.status(404).json({ message: `La formule '${formuleSlug}' n'existe pas en base.` });
    }

    // 3. Générer la référence incrémentale automatique (ex: CMD-001)
    const totalOrdersCount = await Order.countDocuments();
    const nextId = totalOrdersCount + 1;
    const orderReference = `CMD-${String(nextId).padStart(3, '0')}`;

    // 💡 Création anticipée de l'ID de la commande pour lier les snapshots
    const orderId = new mongoose.Types.ObjectId();

    // 4. Préparer et insérer les snapshots de produits en base de données
    const snapshotsToCreate = productsSnapshot.map(item => ({
      orderId: orderId,
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      isExtra: !!item.isExtra
    }));

    // Enregistrement en masse des snapshots
    const savedSnapshots = await OrderProductSnapshot.insertMany(snapshotsToCreate);
    
    // Récupération des IDs générés pour les injecter dans la commande
    const snapshotIds = savedSnapshots.map(snap => snap._id);

    // 5. Instancier et enregistrer la commande avec les références
    const newOrder = new Order({
      _id: orderId, // On force l'ID généré plus haut
      userId: client,
      reference: orderReference,
      formuleSlug: formuleSlug,
      formule: formuleInfo.nom,
      total: totalPrice,
      modePaiement: modePaiement,
      notes: notes,
      productsSnapshot: snapshotIds, // 🔗 Stockage des IDs référencés
      statut: 'En attente'
    });

    await newOrder.save();

    return res.status(201).json({
      message: "Commande enregistrée avec succès !",
      order: newOrder
    });

  } catch (error) {
    console.error("Erreur createAdminOrder:", error);
    return res.status(500).json({ message: "Erreur interne lors de la création de la commande." });
  }
}

async function updateAdminOrder(req, res) {
  try {
    const { id } = req.params; // L'ID de la commande envoyé dans l'URL
    const { client, formuleSlug, modePaiement, notes, totalPrice, productsSnapshot } = req.body;

    // 1. Validation de base
    if (!client || !formuleSlug || !totalPrice || !productsSnapshot || !Array.isArray(productsSnapshot)) {
      return res.status(400).json({ message: "Données manquantes ou panier invalide." });
    }

    // 2. Vérifier si la commande existe
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Commande introuvable." });
    }

    // 3. Récupérer les informations de la formule (au cas où elle a changé)
    const formuleInfo = await Formule.findOne({ slug: formuleSlug });
    if (!formuleInfo) {
      return res.status(404).json({ message: `La formule '${formuleSlug}' n'existe pas en base.` });
    }

    // 3. Générer la référence incrémentale automatique (ex: CMD-001)
    const totalOrdersCount = await Order.countDocuments();
    const nextId = totalOrdersCount + 1;
    const orderReference = `CMD-${String(nextId).padStart(3, '0')}`;

    // 4. Nettoyer les anciens snapshots associés à cette commande
    await OrderProductSnapshot.deleteMany({ orderId: id });

    // 5. Préparer et insérer les nouveaux snapshots du panier mis à jour
    const snapshotsToCreate = productsSnapshot.map(item => ({
      orderId: id,
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      isExtra: !!item.isExtra
    }));

    const savedSnapshots = await OrderProductSnapshot.insertMany(snapshotsToCreate);
    const newSnapshotIds = savedSnapshots.map(snap => snap._id);

    // 6. Mettre à jour la commande principale
    order.userId = client;
    order.reference = order.reference || orderReference; // On garde l'ancienne référence si elle existe
    order.formuleSlug = formuleSlug;
    order.formule = formuleInfo.nom;
    order.total = totalPrice;
    order.modePaiement = modePaiement;
    order.notes = notes;
    order.productsSnapshot = newSnapshotIds;
    order.deletedAt = order.deletedAt ? null : null; // Réactive la commande si elle était supprimée

    await order.save();

    return res.status(200).json({
      message: "Commande mise à jour avec succès !",
      order
    });

  } catch (error) {
    console.error("Erreur updateAdminOrder:", error);
    return res.status(500).json({ message: "Erreur interne lors de la modification de la commande." });
  }
}

// Optionnel : Récupérer la liste de toutes les commandes actives
async function getAllOrders(req, res) {
  try {
    const orders = await Order.find({ deletedAt: null })
      .populate('userId', 'username telephone email') // Récupérer les profils clients liés
      .sort({ createdAt: -1 }); // De la plus récente à la plus ancienne

    return res.status(200).json(orders);
  } catch (error) {
    console.error("Erreur getAllOrders:", error);
    return res.status(500).json({ message: "Erreur lors du chargement des commandes." });
  }
}

async function updateOrderStatus(req, res) {
  // Initialisation de la session pour la transaction ACID
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { statut } = req.body; // Récupère 'Livré', 'Annulé', etc.

    if (!statut) {
      return res.status(400).json({ message: "Le statut est requis." });
    }

    // 1. Récupérer la commande avant modification pour vérifier son état actuel
    const order = await Order.findById(id).session(session);
    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Commande introuvable." });
    }

    // Sécurité : Éviter de déduire le stock plusieurs fois si la commande est déjà 'Livré'
    const etaitDejaLivre = order.statut === 'Livré';

    // 2. Mettre à jour le statut de la commande
    order.statut = statut;
    order.dateLivraison = new Date();
    const updatedOrder = await order.save({ session });

    // 3. Déclencher l'algorithme FIFO si le nouveau statut est 'Livré' et qu'elle ne l'était pas avant
    if (statut === 'Livré' && !etaitDejaLivre) {
      // Récupérer tous les produits (fixes et extras) liés à cette commande via le Snapshot
      const orderProducts = await OrderProductSnapshot.find({ orderId: id }).session(session);

      if (!orderProducts || orderProducts.length === 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: "Impossible de valider une commande sans produits associés." });
      }

      // Appliquer le FIFO produit par produit
      for (const item of orderProducts) {
        await consommerStockFIFO(
          item.productId,
          item.quantity,
          `Déduction automatique - Livraison de la commande #${id}`,
          session
        );
      }
    }

    // Si tout s'est bien passé (y compris le FIFO), on valide la transaction
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: `Commande marquée comme '${statut}' avec succès !`,
      order: updatedOrder
    });

  } catch (error) {
    // En cas d'erreur ou de stock insuffisant, on annule tous les changements (Rollback)
    await session.abortTransaction();
    session.endSession();

    console.error("Erreur updateOrderStatus avec FIFO:", error);
    
    // Si l'erreur provient de notre service FIFO (Rupture de stock)
    if (error.message.includes("Stock insuffisant")) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(500).json({ message: "Erreur interne lors de la mise à jour du statut." });
  }
}

async function deleteAdminOrder(req, res) {
  try {
    const { id } = req.params;

    // Marquer la commande comme supprimée à la date actuelle
    const deletedOrder = await Order.findByIdAndUpdate(
      id,
      { deletedAt: new Date() },
      { new: true }
    );
    
    if (!deletedOrder) {
      return res.status(404).json({ message: "Commande introuvable." });
    }

    return res.status(200).json({
      message: "Commande supprimée avec succès (archivée) !"
    });

  } catch (error) {
    console.error("Erreur deleteAdminOrder:", error);
    return res.status(500).json({ message: "Erreur interne lors de la suppression de la commande." });
  }
}

module.exports = {
  createAdminOrder,
  getAllOrders,
  updateAdminOrder,
  updateOrderStatus,
  deleteAdminOrder
};