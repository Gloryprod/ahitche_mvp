const Order = require('../../models/order');
const Formule = require('../../models/formules');
const OrderProductSnapshot = require('../../models/orderProductSnapshot');
const mongoose = require('mongoose');
const { consommerStockFIFO } = require('../../services/stockService');
const { genererReferenceCommande } = require('../../services/orderReferenceService');
const { STATUTS } = require('../../models/order');
const User = require('../../models/user');
const Zone = require('../../models/zone');
const { TRANSITIONS, genererCompositionSiAbsente } = require('../../services/commandeService');
const { MODES_PAIEMENT_ACCEPTES, calculerPrixCommande } = require('../../services/prixCommandeService');
const { journaliser } = require('../../services/journalService');

const formaterFcfa = (n) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;


async function createAdminOrder(req, res) {
  try {
    // Le prix envoyé par le formulaire est ignoré : le serveur impose le prix de la formule (D-10)
    const { client, formuleSlug, modePaiement, notes, productsSnapshot, remise } = req.body;

    if (!client || !mongoose.isValidObjectId(client) || typeof formuleSlug !== 'string' || !Array.isArray(productsSnapshot) || !productsSnapshot.length) {
      return res.status(400).json({ message: "Données manquantes ou panier invalide (client, formule, produits)." });
    }
    if (!MODES_PAIEMENT_ACCEPTES.includes(modePaiement)) {
      return res.status(400).json({ message: "Mode de paiement invalide (Mobile Money ou Espèces)." });
    }

    const formuleInfo = await Formule.findOne({ slug: formuleSlug, statut: 'actif' });
    if (!formuleInfo) {
      return res.status(404).json({ message: `La formule '${formuleSlug}' n'existe pas en base.` });
    }

    const prix = await calculerPrixCommande({ formule: formuleInfo, lignes: productsSnapshot, remise, utilisateur: { id: req.user.id, role: req.user.role } });
    if (prix.erreur) return res.status(400).json({ message: prix.erreur });

    // 3. Générer la référence incrémentale automatique (ex: CMD-001)
    const orderReference = await genererReferenceCommande();

    // 💡 Création anticipée de l'ID de la commande pour lier les snapshots
    const orderId = new mongoose.Types.ObjectId();

    // 4. Composition de la commande, avec les prix du catalogue (jamais ceux du formulaire)
    const snapshotsToCreate = prix.snapshots.map(item => ({ ...item, orderId }));

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
      total: prix.total,
      prixFormule: prix.prixFormule,
      montantExtras: prix.montantExtras,
      remise: prix.remise,
      modePaiement: modePaiement,
      notes: typeof notes === 'string' ? notes : '',
      productsSnapshot: snapshotIds, // 🔗 Stockage des IDs référencés
      statut: 'En attente',
      historique: [{ statut: 'En attente', date: new Date(), par: req.user.id }]
    });

    await newOrder.save();
    await journaliser(req, {
      action: 'Création', entite: 'Commande', entiteId: newOrder._id,
      resume: `Commande ${newOrder.reference} saisie dans l'admin : ${formaterFcfa(newOrder.total)}${prix.remise.montant ? ` (remise de ${formaterFcfa(prix.remise.montant)} ${prix.remise.statut === 'Validée' ? 'validée' : 'à valider'} : ${prix.remise.motif})` : ''}`
    });

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
    const { client, formuleSlug, modePaiement, notes, productsSnapshot, remise } = req.body;

    if (!client || !mongoose.isValidObjectId(client) || typeof formuleSlug !== 'string' || !Array.isArray(productsSnapshot) || !productsSnapshot.length) {
      return res.status(400).json({ message: "Données manquantes ou panier invalide." });
    }
    if (!MODES_PAIEMENT_ACCEPTES.includes(modePaiement)) {
      return res.status(400).json({ message: "Mode de paiement invalide (Mobile Money ou Espèces)." });
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

    if (['Livrée', 'Annulée'].includes(order.statut) || order.paiement?.statut === 'Payé') {
      return res.status(400).json({ message: "Une commande livrée, payée ou annulée ne se modifie plus." });
    }

    const prix = await calculerPrixCommande({
      formule: formuleInfo, lignes: productsSnapshot, remise,
      utilisateur: { id: req.user.id, role: req.user.role },
      remiseExistante: order.remise?.toObject ? order.remise.toObject() : order.remise
    });
    if (prix.erreur) return res.status(400).json({ message: prix.erreur });

    // 4. Remplacer la composition par celle du panier mis à jour (prix du catalogue)
    await OrderProductSnapshot.deleteMany({ orderId: id });
    const snapshotsToCreate = prix.snapshots.map(item => ({ ...item, orderId: id }));

    const savedSnapshots = await OrderProductSnapshot.insertMany(snapshotsToCreate);
    const newSnapshotIds = savedSnapshots.map(snap => snap._id);

    // 6. Mettre à jour la commande principale
    order.userId = client;
    order.reference = order.reference || await genererReferenceCommande();
    order.formuleSlug = formuleSlug;
    order.formule = formuleInfo.nom;
    order.total = prix.total;
    order.prixFormule = prix.prixFormule;
    order.montantExtras = prix.montantExtras;
    order.remise = prix.remise;
    order.modePaiement = modePaiement;
    order.notes = typeof notes === 'string' ? notes : '';
    order.productsSnapshot = newSnapshotIds;

    await order.save();
    await journaliser(req, { action: 'Modification', entite: 'Commande', entiteId: order._id, resume: `Commande ${order.reference} modifiée : ${formaterFcfa(order.total)}` });

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

  // Transaction : changement de statut et sortie de stock FIFO réussissent ou échouent ensemble
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await Order.findById(req.params.id).session(session);
    if (!order) throw Object.assign(new ErreurStatut("Commande introuvable."), { code: 404 });

    if (!(TRANSITIONS[order.statut] || []).includes(statut)) {
      throw new ErreurStatut(`Passage de « ${order.statut} » à « ${statut} » impossible.`);
    }

    if (statut === 'Confirmée') {
      // Après un échec de livraison, la commande repart en planification (nouveau créneau, nouveau livreur)
      if (order.statut === 'Échec') {
        order.creneau = { date: null, periode: null };
        order.livreurId = null;
      }
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

    await deletedOrder.save();

    return res.status(200).json({
      message: "Commande supprimée avec succès (archivée) !"
    });

  } catch (error) {
    console.error("Erreur deleteAdminOrder:", error);
    return res.status(500).json({ message: "Erreur interne lors de la suppression de la commande." });
  }
}

// PATCH /api/admin/orders/:id/remise  { decision: "valider" | "refuser" } : réservé à l'admin (D-10)
async function deciderRemise(req, res) {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: "Seul l'admin valide ou refuse une remise." });
    const decision = req.body?.decision;
    if (!['valider', 'refuser'].includes(decision)) return res.status(400).json({ message: "Décision invalide (valider ou refuser)." });

    const order = await Order.findOne({ _id: req.params.id, deletedAt: null });
    if (!order) return res.status(404).json({ message: "Commande introuvable." });
    if (order.remise?.statut !== 'À valider') return res.status(400).json({ message: "Aucune remise en attente sur cette commande." });
    if (order.paiement?.statut === 'Payé') return res.status(400).json({ message: "La commande est déjà payée." });

    const brut = (order.prixFormule ?? order.total) + (order.montantExtras || 0);
    order.remise.statut = decision === 'valider' ? 'Validée' : 'Refusée';
    order.remise.valideePar = req.user.id;
    order.remise.valideeLe = new Date();
    order.total = brut - (decision === 'valider' ? order.remise.montant : 0);
    await order.save();
    await journaliser(req, {
      action: 'Validation', entite: 'Commande', entiteId: order._id,
      resume: `Remise de ${formaterFcfa(order.remise.montant)} ${decision === 'valider' ? 'validée' : 'refusée'} sur ${order.reference} (${order.remise.motif}) : total ${formaterFcfa(order.total)}`
    });
    return res.status(200).json({ message: decision === 'valider' ? 'Remise validée.' : 'Remise refusée.', order });
  } catch (error) {
    console.error("Erreur deciderRemise:", error);
    return res.status(500).json({ message: "Erreur lors de la décision sur la remise." });
  }
}

module.exports = {
  deciderRemise,
  createAdminOrder,
  getAllOrders,
  updateAdminOrder,
  updateOrderStatus,
  deleteAdminOrder
};