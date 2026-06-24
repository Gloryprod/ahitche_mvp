const Order = require('../models/order');

async function index(req, res){

    try {
        const orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });        
        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la récupération des commandes" });
    }
    
}

async function saveOrder(req, res){

    try {
        const { formule, total } = req.body;
        const userId = req.user.id; // Récupéré via le middleware verifyToken

        if (!formule || !total) {
            return res.status(400).json({ message: "La formule et le total sont requis." });
        }

        const nouvelleCommande = new Order({
            userId,
            formule,
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

module.exports = {index, saveOrder};