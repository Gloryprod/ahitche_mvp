const { TYPES_PACK, calculerCompositionPack } = require('../../services/compositionService');
const Parametres = require('../../models/parametres');

// Valeur estimée de chaque pack, affichée en prix barré sur l'accueil (D-03) :
// matières aux prix du catalogue × coefficient opérationnel (1,23 dans le référentiel v4).
// Aucune valeur de repli : sans coefficient ou avec un prix manquant, la valeur reste vide (rien n'est barré).

// GET /api/public/formules/valeurs -> { "ahi-essentiel": 17786, ... }
async function valeursEstimees(req, res) {
  try {
    const coefficient = (await Parametres.obtenir()).coefficient();
    const valeurs = {};
    for (const type of TYPES_PACK) {
      const composition = await calculerCompositionPack(type);
      if (!composition) continue;
      const complete = composition.itemCount > 0 && composition.prixManquants === 0;
      valeurs[composition.formule.slug] = coefficient !== null && complete ? Math.round(composition.prixCalcule * coefficient) : null;
    }
    res.set('Cache-Control', 'public, max-age=300'); // Mobile : une petite réponse, gardée 5 minutes
    return res.status(200).json(valeurs);
  } catch (error) {
    console.error("Erreur valeursEstimees:", error);
    return res.status(500).json({ message: "Erreur lors du calcul des valeurs estimées." });
  }
}

module.exports = { valeursEstimees };
