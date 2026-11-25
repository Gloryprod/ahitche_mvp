const mongoose = require('mongoose');
const ContenuSite = require('../../models/contenuSite');
const { CONTENUS, CLES, cartesAffichees } = require('../../services/contenuSiteService');
const { prixVitrine } = require('../../services/formuleService');
const { listerPacks } = require('../../services/packService');
const { texteLlms } = require('../../services/llmsService');

// Contenus du site publiés depuis l'admin (écran « Site public »), lus par toutes les pages publiques.
// null = jamais publié : le site garde les valeurs du code. Seuls les champs du contrat sortent (ni versions, ni auteur) :
// les valeurs sont repassées par la validation à la lecture. Le bandeau est filtré ici, à l'heure de Cotonou, la FAQ
// ne garde que les questions affichées (sans le champ « visible ») et les témoignages que ceux affichés (prénom, quartier,
// note, texte : ni date de l'accord, ni « visible »).
// Les prix et les noms des cartes viennent de la base (« Formules et prix »), jamais de ces contenus.

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

// Prix de vente des cartes affichées sur l'accueil (règle unique : contenuSiteService.cartesAffichees), dans leur ordre
async function prixDesCartes(formules, packs) {
  const cartes = cartesAffichees(formules, packs);
  return { cartes, prix: await prixVitrine(cartes.map((c) => c.slug)) };
}

// GET /api/public/site -> { infos, bandeau, formules: <valeurs> | null, faq: [...] | null, actualites: [...] | null,
//   photos: { [emplacement]: { url, publicId, alt, droits } } | null, temoignages: [{ prenom, quartier, note, texte }] | null,
//   prix: { [slug]: number | null }, noms: { [slug]: nom } } (prix et noms : une entrée par carte affichée, dans l'ordre
//   d'affichage ; jamais un pack inactif)
async function contenusPublies(req, res) {
  try {
    const [publies, packs] = await Promise.all([lirePublies(CLES), listerPacks()]);
    const { cartes, prix } = await prixDesCartes(publies.formules, packs);
    res.set('Cache-Control', CACHE_SITE);
    return res.status(200).json({ ...publies, prix, noms: Object.fromEntries(cartes.map((c) => [c.slug, c.nom])) });
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
    const [{ infos, formules }, packs] = await Promise.all([lirePublies(['infos', 'formules']), listerPacks()]);
    const { cartes, prix } = await prixDesCartes(formules, packs);
    res.set('Cache-Control', CACHE_SITE);
    return res.status(200).send(texteLlms({ infos, formules, prix, cartes }));
  } catch (error) {
    console.error('Erreur llmsTxt:', error);
    return secours();
  }
}

module.exports = { contenusPublies, llmsTxt };
