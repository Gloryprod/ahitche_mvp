const mongoose = require('mongoose');
const ContenuSite = require('../../models/contenuSite');
const { CONTENUS, CLES, SLUGS_VITRINE } = require('../../services/contenuSiteService');
const { prixVitrine } = require('../../services/formuleService');
const { texteLlms } = require('../../services/llmsService');

// Contenus du site publiés depuis l'admin (écran « Site public »), lus par toutes les pages publiques.
// null = jamais publié : le site garde les valeurs du code. Seuls les champs du contrat sortent (ni versions, ni auteur) :
// les valeurs sont repassées par la validation à la lecture. Le bandeau est filtré ici, à l'heure de Cotonou.
// Les prix de la vitrine viennent de la base (prix de vente de « Formules et prix »), jamais de ces contenus.

// Téléphone : une publication apparaît en 1 minute (6 au plus si la réponse en cache est resservie pendant l'actualisation)
const CACHE_SITE = 'public, max-age=60, stale-while-revalidate=300';

// Valeurs publiées des clés demandées, en une requête : { cle: valeurs | null } (null : jamais publié ou illisible)
async function lirePublies(cles, maintenant = new Date()) {
  const docs = await ContenuSite.find({ cle: { $in: cles } }).select('cle valeurs').lean();
  const publies = {};
  for (const cle of cles) {
    const def = CONTENUS[cle];
    const doc = docs.find(d => d.cle === cle);
    publies[cle] = null;
    if (!doc) continue;
    const { valeurs, erreur } = def.valider(doc.valeurs);
    if (erreur) { console.error(`Contenu du site « ${cle} » illisible, valeurs du code gardées :`, erreur); continue; }
    publies[cle] = def.publier ? def.publier(valeurs, maintenant) : valeurs;
  }
  return publies;
}

// GET /api/public/site -> { infos, bandeau, formules: <valeurs> | null, prix: { [slug]: number | null } }
async function contenusPublies(req, res) {
  try {
    const [publies, prix] = await Promise.all([lirePublies(CLES), prixVitrine(SLUGS_VITRINE)]);
    res.set('Cache-Control', CACHE_SITE);
    return res.status(200).json({ ...publies, prix });
  } catch (error) {
    console.error('Erreur contenusPublies:', error);
    res.set('Cache-Control', 'no-store');
    return res.status(500).json({ message: 'Erreur lors du chargement des contenus du site.' });
  }
}

// GET /api/public/llms.txt -> texte (servi sur ahitchebj.com/llms.txt, voir front/vercel.json).
// Base injoignable : 503 avec le texte des valeurs du code, pour que les assistants gardent une réponse juste.
async function llmsTxt(req, res) {
  res.set('Content-Type', 'text/plain; charset=utf-8');
  const secours = () => res.set('Cache-Control', 'no-store').status(503).send(texteLlms());
  // Sans connexion, Mongoose met les requêtes en attente (jusqu'à 10 s) : réponse de secours immédiate
  if (mongoose.connection.readyState !== 1) return secours();
  try {
    const [{ infos, formules }, prix] = await Promise.all([lirePublies(['infos', 'formules']), prixVitrine(SLUGS_VITRINE)]);
    res.set('Cache-Control', CACHE_SITE);
    return res.status(200).send(texteLlms({ infos, formules, prix }));
  } catch (error) {
    console.error('Erreur llmsTxt:', error);
    return secours();
  }
}

module.exports = { contenusPublies, llmsTxt };
