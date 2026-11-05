const ContenuSite = require('../../models/contenuSite');
const { CONTENUS, CLES } = require('../../services/contenuSiteService');

// Contenus du site publiés depuis l'admin (écran « Site public »), lus par toutes les pages publiques.
// null = jamais publié : le site garde les valeurs du code. Seuls les champs du contrat sortent (ni versions, ni auteur) :
// les valeurs sont repassées par la validation à la lecture. Le bandeau est filtré ici, à l'heure de Cotonou.

// GET /api/public/site -> { infos: <valeurs> | null, bandeau: <valeurs> | null }
async function contenusPublies(req, res) {
  try {
    const docs = await ContenuSite.find({ cle: { $in: CLES } }).select('cle valeurs').lean();
    const maintenant = new Date();
    const reponse = {};
    for (const cle of CLES) {
      const def = CONTENUS[cle];
      const doc = docs.find(d => d.cle === cle);
      reponse[cle] = null;
      if (!doc) continue;
      const { valeurs, erreur } = def.valider(doc.valeurs);
      if (erreur) { console.error(`Contenu du site « ${cle} » illisible, valeurs du code gardées :`, erreur); continue; }
      reponse[cle] = def.publier ? def.publier(valeurs, maintenant) : valeurs;
    }
    // Téléphone : une publication apparaît en 1 minute (6 au plus si la réponse en cache est resservie pendant l'actualisation)
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res.status(200).json(reponse);
  } catch (error) {
    console.error('Erreur contenusPublies:', error);
    res.set('Cache-Control', 'no-store');
    return res.status(500).json({ message: 'Erreur lors du chargement des contenus du site.' });
  }
}

module.exports = { contenusPublies };
