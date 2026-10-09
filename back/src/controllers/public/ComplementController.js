const Product = require('../../models/product');

// Compléments affichés sur l'accueil, section « Disponible cette semaine » : seulement les extras cochés
// « cette semaine », disponibles et avec un prix. Rien d'autre du catalogue n'est exposé (pas de coût, pas de stock).

// GET /api/public/complements -> [{ id, nom, prix, unite, description, photo }]
async function complementsDeLaSemaine(req, res) {
  try {
    const produits = await Product.find({ type: 'extra', cetteSemaine: true, statut: 'disponible', deletedAt: null, priceUnit: { $gt: 0 } })
      .select('name priceUnit unit description photo')
      .sort({ name: 1 })
      .lean();
    res.set('Cache-Control', 'public, max-age=120'); // Mobile : petite réponse ; un changement de l'admin apparaît en 2 minutes au plus
    return res.status(200).json(produits.map(p => ({
      id: p._id, nom: p.name, prix: p.priceUnit, unite: p.unit, description: p.description || '', photo: p.photo || ''
    })));
  } catch (error) {
    console.error('Erreur complementsDeLaSemaine:', error);
    return res.status(500).json({ message: 'Erreur lors du chargement des compléments.' });
  }
}

module.exports = { complementsDeLaSemaine };
