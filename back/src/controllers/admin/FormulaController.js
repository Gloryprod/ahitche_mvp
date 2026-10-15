const Formule = require('../../models/formules');
const { TYPES_PACK, calculerCompositionPack } = require('../../services/compositionService');
const { journaliser } = require('../../services/journalService');
const { lienWhatsAppFormule } = require('../../services/formuleService');

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

    if (typeof prixFixe !== 'number' || !Number.isFinite(prixFixe) || prixFixe < 0) {
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

    const ancienPrix = updatedFormula.prixCommercial ?? updatedFormula.prixActuel ?? 'à définir';
    updatedFormula.prixCommercial = prixFixe;
    updatedFormula.lienWhatsApp = lienWhatsAppFormule(updatedFormula);
    await updatedFormula.save();

    // Journal des modifications : qui a changé le prix de vente, et quand
    await journaliser(req, {
      action: 'Modification', entite: 'Prix formule', entiteId: updatedFormula._id,
      resume: `Prix de ${updatedFormula.nom} : ${ancienPrix} -> ${prixFixe} FCFA`,
      avant: { prix: ancienPrix }, apres: { prix: prixFixe }
    });

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

// Cycle de relance : jours entre la livraison et la relance du client (alerte à J-5 au tableau de bord).
// Réglé par l'admin ; il ne change pas les textes du site (« par mois »), qui restent dans front/src/config/formules.ts.
const CYCLE_MIN = 1;
const CYCLE_MAX = 365;

async function updateFormulaCycle(req, res) {
  try {
    const type = String(req.params.packType).toLowerCase();
    if (!TYPES_PACK.includes(type)) {
      return res.status(400).json({ success: false, message: 'Type de pack invalide.' });
    }

    const { cycleJours } = req.body;
    if (!Number.isInteger(cycleJours) || cycleJours < CYCLE_MIN || cycleJours > CYCLE_MAX) {
      return res.status(400).json({
        success: false,
        message: `Le cycle doit être un nombre entier de jours, entre ${CYCLE_MIN} et ${CYCLE_MAX}.`
      });
    }

    const formule = await Formule.findOne({ slug: `ahi-${type}`, statut: 'actif' });
    if (!formule) {
      return res.status(404).json({ success: false, message: 'Formule introuvable' });
    }

    const avant = formule.cycleJours;
    if (avant === cycleJours) {
      return res.status(200).json({ success: true, message: 'Cycle de relance inchangé', data: formule });
    }
    formule.cycleJours = cycleJours;
    await formule.save();

    // Journal des modifications : qui a changé le cycle, et quand
    await journaliser(req, {
      action: 'Modification', entite: 'Formule', entiteId: formule._id,
      resume: `Cycle de relance de ${formule.nom} : ${avant} -> ${cycleJours} jours`,
      avant: { cycleJours: avant }, apres: { cycleJours }
    });

    return res.status(200).json({ success: true, message: 'Cycle de relance mis à jour', data: formule });
  } catch (error) {
    console.error('Erreur updateFormulaCycle:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur lors de la mise à jour du cycle.' });
  }
}

module.exports = {
  getPackDetails,
  updateFormulaPrice,
  updateFormulaCycle
};