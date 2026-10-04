const Formule = require('../models/formules');

async function index(req, res){

    try {
        const formules = await Formule.find({ statut: 'actif' }).sort({ bientotDisponible: 1, prixActuel: 1 }); // Formules ouvertes d'abord
        res.status(200).json(formules);
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la récupération des formules" });
    }
    
}

module.exports = { index };
