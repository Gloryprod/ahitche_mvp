const Order = require('../../models/order');
const Formule = require('../../models/formules');
const OrderProductSnapshot = require('../../models/orderProductSnapshot');
const mongoose = require('mongoose');
const { consommerStockFIFO } = require('../../services/stockService');
const { genererReferenceCommande } = require('../../services/orderReferenceService');
const { STATUTS } = require('../../models/order');
const User = require('../../models/user');
const Zone = require('../../models/zone');
const { TRANSITIONS, estEnRetard, appliquerCompensationEnAttente, libererCompensation, genererCompositionSiAbsente } = require('../../services/commandeService');


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
    const orderReference = await genererReferenceCommande();

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
      statut: 'En attente',
      historique: [{ statut: 'En attente', date: new Date(), par: req.user.id }]
    });

    // Compensation d'une livraison en retard : remise avec cette commande
    await appliquerCompensationEnAttente(newOrder);
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
    const orderReference = await genererReferenceCommande();

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

// Erreur métier : message affiché tel quel à l'équipe (400)
class ErreurStatut extends Error {}

async function updateOrderStatus(req, res) {
  const { statut, referencePaiement, notePaiement } = req.body;

  if (!STATUTS.includes(statut)) {
    return res.status(400).json({ message: "Statut inconnu." });
  }

  // Transaction : changement de statut, sortie de stock FIFO et compensation réussissent ou échouent ensemble
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await Order.findById(req.params.id).session(session);
    if (!order) throw Object.assign(new ErreurStatut("Commande introuvable."), { code: 404 });

    if (!(TRANSITIONS[order.statut] || []).includes(statut)) {
      throw new ErreurStatut(`Passage de « ${order.statut} » à « ${statut} » impossible.`);
    }

    if (statut === 'Confirmée') {
      // Zone de livraison du client, et composition du pack pour les commandes passées par le client
      if (!order.zone) {
        const client = await User.findById(order.userId).select('zone').session(session);
        order.zone = client?.zone || null;
      }
      await genererCompositionSiAbsente(order, session);
    }

    if (statut === 'En livraison' && (!order.creneau?.date || !order.livreurId)) {
      throw new ErreurStatut("Planifiez d'abord le créneau et le livreur (section Logistique).");
    }

    if (statut === 'Livrée') {
      // Paiement à la livraison : référence Mobile Money, ou note pour les cas particuliers
      const reference = typeof referencePaiement === 'string' ? referencePaiement.trim() : '';
      const note = typeof notePaiement === 'string' ? notePaiement.trim() : '';
      if (order.modePaiement === 'Mobile Money' && !reference) {
        throw new ErreurStatut("La référence de la transaction Mobile Money est obligatoire.");
      }
      if (order.modePaiement !== 'Mobile Money' && !note) {
        throw new ErreurStatut(`Paiement « ${order.modePaiement} » : une note expliquant le cas est obligatoire.`);
      }

      const maintenant = new Date();
      order.paiement = { statut: 'Payé', reference, note, date: maintenant };
      order.dateLivraison = maintenant;

      const zone = order.zone ? await Zone.findOne({ code: order.zone }).session(session) : null;
      order.coutLivraison = zone?.tarifCourse || 0;

      // Garantie : plus de 24 h de retard sur le créneau confirmé -> compensation à la commande suivante
      if (estEnRetard(order.creneau, maintenant)) {
        order.enRetard = true;
        order.compensation = {
          statut: 'À appliquer',
          motif: `Livrée le ${maintenant.toLocaleDateString('fr-FR', { timeZone: 'Africa/Porto-Novo' })}, plus de 24 h après le créneau prévu.`,
          appliqueeSurCommande: null
        };
      }

      // Sortie de stock FIFO de tous les produits (fixes et extras) de la commande
      const orderProducts = await OrderProductSnapshot.find({ orderId: order._id }).session(session);
      if (!orderProducts.length) {
        throw new ErreurStatut("Impossible de valider une commande sans produits associés.");
      }
      for (const item of orderProducts) {
        await consommerStockFIFO(item.productId, item.quantity, `Livraison de la commande ${order.reference}`, session);
      }
    }

    if (statut === 'Annulée') {
      order.deletedAt = new Date();
      await libererCompensation(order, session);
    }

    order.statut = statut;
    order.historique.push({ statut, date: new Date(), par: req.user.id });
    const updatedOrder = await order.save({ session });

    await session.commitTransaction();
    return res.status(200).json({
      message: `Commande ${order.reference} : ${statut}.`,
      order: updatedOrder
    });

  } catch (error) {
    // En cas d'erreur ou de stock insuffisant, on annule tous les changements (Rollback)
    await session.abortTransaction();

    if (error instanceof ErreurStatut) {
      return res.status(error.code || 400).json({ message: error.message });
    }
    // Rupture de stock signalée par le service FIFO
    if (error.message?.includes("Stock insuffisant")) {
      return res.status(400).json({ message: error.message });
    }

    console.error("Erreur updateOrderStatus:", error);
    return res.status(500).json({ message: "Erreur interne lors de la mise à jour du statut." });
  } finally {
    session.endSession();
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

    // Une compensation portée par cette commande revient au client pour sa prochaine commande
    await libererCompensation(deletedOrder);
    await deletedOrder.save();

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