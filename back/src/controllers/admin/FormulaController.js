const Formule = require('../../models/formules');
const { TYPES_PACK, calculerCompositionPack } = require('../../services/compositionService');

// Composition et valeur catalogue d'un pack (lecture seule, voir services/compositionService.js)
async function getPackDetails(req, res) {
  try {
    const type = String(req.params.packType).toLowerCase(); // 'essentiel', 'equilibre', 'confort', 'reserve' ou 'fraicheur'

    if (!TYPES_PACK.includes(type)) {
      return res.status(400).json({ message: "Type de pack invalide. Choisissez entre : essentiel, equilibre, confort, reserve ou fraicheur." });
    }

    const composition = await calculerCompositionPack(type);
    if (!composition) {
      return res.status(404).json({ message: `Configuration de la formule pour ${type} introuvable.` });
    }

    // Le prix de vente (prixActuel / prixCommercial) n'est jamais modifié ici :
    // la valeur issue du catalogue est renvoyée à part, dans prixCalcule.
    return res.status(200).json(composition);
  } catch (error) {
    console.error("Erreur getPackDetails:", error);
    return res.status(500).json({ message: "Erreur lors de la génération du pack." });
  }
}

async function updateFormulaPrice(req, res) {
  try {
    const { packType } = req.params;
    const { prixFixe } = req.body;

    const type = packType.toLowerCase();

    if (prixFixe === undefined || prixFixe < 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Le prix proposé est invalide' 
      });
    }

    // Mise à jour de la formule en BDD MongoDB
    const updatedFormula = await Formule.findOne(
      { slug: `ahi-${type}`, statut: 'actif' },
    );

    if (!updatedFormula) {
      return res.status(404).json({ success: false, message: 'Formule introuvable' });
    }

    updatedFormula.prixCommercial = prixFixe;
    await updatedFormula.save();

    res.status(200).json({
      success: true,
      message: 'Prix commercial mis à jour avec succès',
      data: updatedFormula
    });
  } catch (error) {
    console.error('Erreur updateFormulaPrice:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur lors de la mise à jour du prix.' });
  }
}

module.exports = {
  getPackDetails,
  updateFormulaPrice
};