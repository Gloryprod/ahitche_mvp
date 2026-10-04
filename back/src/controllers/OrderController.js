const Order = require('../models/order');
const Formule = require('../models/formules');
const { genererReferenceCommande } = require('../services/orderReferenceService');

async function index(req, res){

    try {
        const orders = await Order.find({ userId: req.user.id, deletedAt: null }).sort({ createdAt: -1 });        
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
        const total = formuleInfo.prixCommercial ?? formuleInfo.prixActuel;

        if (!total || total <= 0) {
            return res.status(409).json({ message: "Le prix de cette formule n'est pas encore défini. Contactez-nous sur WhatsApp." });
        }

        const nouvelleCommande = new Order({
            userId,
            reference: await genererReferenceCommande(),
            formule: formuleInfo.nom,
            formuleSlug: formuleInfo.slug,
            total,
            statut: 'En attente'
        });

        await nouvelleCommande.save();

        return res.status(201).json({
            message: "Commande enregistrée avec succès !",
            commande: nouvelleCommande
        });
    } catch (error) {
        console.error("Erreur lors de la création de la commande :", error);
        return res.status(500).json({ message: "Erreur interne du serveur." });
    }

}

async function deleteOrder(req, res) {
    try {
        // On ne cible que les commandes actives appartenant à l'utilisateur connecté
        const order = await Order.findOneAndUpdate(
            { _id: req.params.id, userId: req.user.id, deletedAt: null },
            {
                $set: { deletedAt: new Date() } 
            },
            { new: true } 
        );
        
        if (!order) {
            return res.status(404).json({ message: "Commande non trouvée." });
        }
        
        res.status(200).json({ message: 'Commande supprimée avec succès !' });
    } catch (error) {
        console.error("Erreur deleteOrder:", error);
        res.status(500).json({ message: "Erreur serveur lors de la suppression de la commande." });
    }   
}

module.exports = {index, saveOrder, deleteOrder};