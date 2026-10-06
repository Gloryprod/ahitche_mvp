const Order = require('../models/order');
const Formule = require('../models/formules');
const { genererReferenceCommande } = require('../services/orderReferenceService');
const { ANNULABLES_PAR_CLIENT } = require('../services/commandeService');
const { prixDeVente } = require('../services/formuleService');

const CHAMPS_CLIENT = 'reference formule formuleSlug total modePaiement statut creneau dateLivraison paiement.statut createdAt';

// Même sélection pour une commande déjà chargée (réponse à la création)
function versClient(order) {
    const o = order.toObject();
    return {
        _id: o._id, reference: o.reference, formule: o.formule, formuleSlug: o.formuleSlug, total: o.total,
        modePaiement: o.modePaiement, statut: o.statut, creneau: o.creneau, dateLivraison: o.dateLivraison,
        paiement: { statut: o.paiement?.statut }, createdAt: o.createdAt
    };
}

async function index(req, res){

    try {
        // Seuls les champs utiles au client : jamais le coût interne de la course, le livreur, les notes
        // internes ni l'historique avec les identifiants de l'équipe
        const orders = await Order.find({ userId: req.user.id, deletedAt: null })
            .select(CHAMPS_CLIENT)
            .sort({ createdAt: -1 });
        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la récupération des commandes" });
    }
    
}

async function saveOrder(req, res){

    try {
        // Le client n'envoie que la formule (slug ou nom) : le prix est toujours lu en base
        const { formule } = req.body;
        const userId = req.user.id; // Récupéré via le middleware verifyToken

        if (typeof formule !== 'string' || formule.length === 0) {
            return res.status(400).json({ message: "La formule est requise." });
        }

        const formuleInfo = await Formule.findOne({
            $or: [{ slug: formule }, { nom: formule }],
            statut: 'actif'
        });

        if (!formuleInfo) {
            return res.status(404).json({ message: "Cette formule n'est pas disponible à la commande." });
        }

        if (formuleInfo.bientotDisponible) {
            return res.status(409).json({ message: `${formuleInfo.nom} sera bientôt disponible. Choisissez une autre formule en attendant.` });
        }

        // Prix de vente : prix commercial fixé par l'admin, sinon prix officiel
        const total = prixDeVente(formuleInfo);
        if (total === null) {
            return res.status(400).json({ message: "Le prix de cette formule n'est pas encore fixé." });
        }

        if (!total || total <= 0) {
            return res.status(409).json({ message: "Le prix de cette formule n'est pas encore défini. Contactez-nous sur WhatsApp." });
        }

        const nouvelleCommande = new Order({
            userId,
            reference: await genererReferenceCommande(),
            formule: formuleInfo.nom,
            formuleSlug: formuleInfo.slug,
            total,
            statut: 'En attente',
            historique: [{ statut: 'En attente', date: new Date(), par: userId }]
        });

        await nouvelleCommande.save();

        return res.status(201).json({
            message: "Commande enregistrée avec succès !",
            commande: versClient(nouvelleCommande)
        });
    } catch (error) {
        console.error("Erreur lors de la création de la commande :", error);
        return res.status(500).json({ message: "Erreur interne du serveur." });
    }

}

async function deleteOrder(req, res) {
    try {
        // On ne cible que les commandes actives appartenant à l'utilisateur connecté
        const order = await Order.findOne({ _id: req.params.id, userId: req.user.id, deletedAt: null });

        if (!order) {
            return res.status(404).json({ message: "Commande non trouvée." });
        }

        // Une fois la préparation commencée, l'annulation passe par l'équipe (WhatsApp)
        if (!ANNULABLES_PAR_CLIENT.includes(order.statut)) {
            return res.status(409).json({ message: `Commande ${order.statut.toLowerCase()} : contactez-nous sur WhatsApp pour l'annuler.` });
        }

        order.statut = 'Annulée';
        order.deletedAt = new Date();
        order.historique.push({ statut: 'Annulée', date: new Date(), par: req.user.id });
        await order.save();

        res.status(200).json({ message: 'Commande annulée.' });
    } catch (error) {
        console.error("Erreur deleteOrder:", error);
        res.status(500).json({ message: "Erreur serveur lors de la suppression de la commande." });
    }   
}

module.exports = {index, saveOrder, deleteOrder};