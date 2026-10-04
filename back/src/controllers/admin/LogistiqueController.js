const mongoose = require('mongoose');
const Order = require('../../models/order');
const { PERIODES } = require('../../models/order');
const Partner = require('../../models/partner');
const User = require('../../models/user');
const Zone = require('../../models/zone');
const { dateDuCreneau } = require('../../services/commandeService');

// Statuts qui se planifient (créneau + livreur) : avant le départ en livraison.
// Une commande en échec repasse d'abord en « Confirmée », ce qui libère son ancien créneau.
const PLANIFIABLES = ['Confirmée', 'En préparation'];

// Date du jour à Cotonou (UTC+1), au format AAAA-MM-JJ
const aujourdhuiCotonou = () => new Date(Date.now() + 3600 * 1000).toISOString().slice(0, 10);

// Vue « terrain » d'une commande : tout ce qu'il faut pour préparer et livrer
function formaterCommande(order, zonesParCode) {
  const client = order.userId || {};
  const zone = zonesParCode.get(order.zone || client.zone) || null;
  return {
    id: order._id,
    reference: order.reference,
    statut: order.statut,
    formule: order.formule,
    total: order.total,
    modePaiement: order.modePaiement,
    client: {
      nom: client.username || 'Client supprimé',
      telephone: client.telephone || '',
      quartier: client.quartier || '',
      adresse: client.adresse || '',
      lienLocalisation: client.lienLocalisation || ''
    },
    zone: zone ? { code: zone.code, nom: zone.nom, commune: zone.commune, prioritaire: zone.prioritaire } : null,
    creneau: order.creneau,
    livreur: order.livreurId ? { _id: order.livreurId._id, nom: order.livreurId.nom, telephone: order.livreurId.telephone } : null,
    produits: (order.productsSnapshot || []).map(p => ({ nom: p.name, quantite: p.quantity, unite: p.unit })),
    compensationRecue: order.compensationRecue?.reference ? order.compensationRecue : null,
    enRetard: order.enRetard,
    paiement: order.paiement
  };
}

const POPULATE = [
  { path: 'userId', select: 'username telephone quartier adresse zone lienLocalisation' },
  { path: 'livreurId', select: 'nom telephone' },
  { path: 'productsSnapshot', select: 'name quantity unit' }
];

// GET /api/admin/logistique?date=AAAA-MM-JJ : tournées du jour, commandes à planifier, compensations à remettre
async function obtenirPlanning(req, res) {
  try {
    const jourTexte = req.query.date || aujourdhuiCotonou();
    const jour = dateDuCreneau(jourTexte);
    if (!jour) return res.status(400).json({ message: "Date invalide (format AAAA-MM-JJ)." });

    const zones = await Zone.find().lean();
    const zonesParCode = new Map(zones.map(z => [z.code, z]));

    const [duJour, aPlanifier, aConfirmer, compensations] = await Promise.all([
      Order.find({ deletedAt: null, 'creneau.date': jour, statut: { $ne: 'Annulée' } }).populate(POPULATE).sort({ 'creneau.periode': 1 }),
      Order.find({
        deletedAt: null,
        $or: [{ statut: { $in: ['Confirmée', 'En préparation'] }, 'creneau.date': null }, { statut: 'Échec' }]
      }).populate(POPULATE).sort({ createdAt: 1 }),
      Order.countDocuments({ deletedAt: null, statut: 'En attente' }),
      Order.find({ 'compensation.statut': 'À appliquer' }).populate({ path: 'userId', select: 'username telephone' }).select('reference userId compensation dateLivraison').lean()
    ]);

    return res.status(200).json({
      date: jourTexte,
      duJour: duJour.map(o => formaterCommande(o, zonesParCode)),
      aPlanifier: aPlanifier.map(o => formaterCommande(o, zonesParCode)),
      aConfirmer,
      compensations: compensations.map(c => ({
        reference: c.reference,
        client: c.userId?.username || 'Client supprimé',
        telephone: c.userId?.telephone || '',
        motif: c.compensation.motif
      }))
    });
  } catch (error) {
    console.error("Erreur obtenirPlanning:", error);
    return res.status(500).json({ message: "Erreur lors du chargement du planning de livraison." });
  }
}

// PATCH /api/admin/logistique/commandes/:id/planification  { date, periode, livreurId }
async function planifierCommande(req, res) {
  try {
    const { date, periode, livreurId } = req.body;
    const jour = dateDuCreneau(date);
    if (!jour) return res.status(400).json({ message: "Date de livraison invalide." });
    if (!PERIODES.includes(periode)) return res.status(400).json({ message: "Créneau invalide (Matin ou Après-midi)." });
    if (!mongoose.isValidObjectId(livreurId)) return res.status(400).json({ message: "Choisissez un livreur." });

    const livreur = await Partner.findOne({ _id: livreurId, type: 'Livreur', actif: true, deletedAt: null });
    if (!livreur) return res.status(400).json({ message: "Livreur introuvable ou inactif (voir Prestataires)." });

    const order = await Order.findOne({ _id: req.params.id, deletedAt: null });
    if (!order) return res.status(404).json({ message: "Commande introuvable." });
    if (!PLANIFIABLES.includes(order.statut)) {
      return res.status(400).json({ message: `Une commande « ${order.statut} » ne se planifie pas.` });
    }

    if (!order.zone) {
      const client = await User.findById(order.userId).select('zone');
      order.zone = client?.zone || null;
    }
    order.creneau = { date: jour, periode };
    order.livreurId = livreur._id;
    await order.save();

    return res.status(200).json({ message: `${order.reference} planifiée : ${date}, ${periode.toLowerCase()}, avec ${livreur.nom}.` });
  } catch (error) {
    console.error("Erreur planifierCommande:", error);
    return res.status(500).json({ message: "Erreur lors de la planification." });
  }
}

module.exports = { obtenirPlanning, planifierCommande };
