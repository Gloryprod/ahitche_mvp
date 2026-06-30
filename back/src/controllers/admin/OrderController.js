const Order = require('../../models/order');
const Formule = require('../../models/formules');

// Créer une commande via l'espace d'administration
async function createAdminOrder(req, res) {
  try {
    const { client, formuleSlug, modePaiement, notes, totalPrice } = req.body;

    // 1. Validations de base
    if (!client || !formuleSlug || !totalPrice) {
      return res.status(400).json({ message: "Données manquantes (client, formuleSlug, ou total)." });
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

    // 4. Instancier et enregistrer la commande
    const newOrder = new Order({
      userId: client, // Correspond au clientId passé par le front
      reference: orderReference,
      formuleSlug: formuleSlug,
      formule: formuleInfo.nom,
      total: totalPrice,
      modePaiement: modePaiement,
      notes: notes,
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

module.exports = {
  createAdminOrder,
  getAllOrders
};