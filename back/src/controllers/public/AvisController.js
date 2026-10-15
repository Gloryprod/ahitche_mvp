const { Avis } = require('../../models/avis');

// Avis clients publiés par l'admin, affichés sur l'accueil à côté des témoignages (section « Ce que disent nos clients »).
// Seuls le prénom, le quartier, la note et le texte choisis par le client sont exposés.

// GET /api/public/avis -> [{ prenom, quartier, note, texte }]
async function avisPublies(req, res) {
  try {
    const avis = await Avis.find({ statut: 'Publié' })
      .select('prenom quartier note texte')
      .sort({ decideLe: -1 })
      .limit(12)
      .lean();
    res.set('Cache-Control', 'public, max-age=300'); // Mobile : petite réponse ; une publication apparaît en 5 minutes au plus
    return res.status(200).json(avis.map(a => ({ prenom: a.prenom, quartier: a.quartier, note: a.note, texte: a.texte })));
  } catch (error) {
    console.error('Erreur avisPublies:', error);
    return res.status(500).json({ message: 'Erreur lors du chargement des avis.' });
  }
}

module.exports = { avisPublies };
