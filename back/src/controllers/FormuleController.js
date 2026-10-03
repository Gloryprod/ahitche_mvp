const Formule = require('../models/formules');

async function index(req, res){

    try {
        const formules = await Formule.find({ statut: 'actif' }).sort({ prixActuel: 1 });
        res.status(200).json(formules);
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la récupération des formules" });
    }
    
}

module.exports = { index };
