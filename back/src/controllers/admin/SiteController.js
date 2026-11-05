const mongoose = require('mongoose');
const ContenuSite = require('../../models/contenuSite');
const { NB_VERSIONS } = require('../../models/contenuSite');
const User = require('../../models/user');
const { CLES, contenu, egal } = require('../../services/contenuSiteService');
const { journaliser } = require('../../services/journalService');

// Écran « Site public » (docs-internes/admin/CONTRAT-site-public-A.md), section « site » : lecture admin et
// coordinateur, écriture (publication, retour à une version) admin seulement, contrôlée par acces() dans routes/admin.js.
// Chaque publication remplace les valeurs, s'ajoute en tête des versions (10 au plus) et est journalisée
// (entité « Site public »). Validation propre à chaque contenu : services/contenuSiteService.js.

// Contenu tel que renvoyé à l'écran : valeurs publiées et liste des versions, sans leurs valeurs
const versEcran = (doc) => (doc ? {
  valeurs: doc.valeurs,
  updatedAt: doc.updatedAt,
  versions: (doc.versions || []).map(v => ({ _id: v._id, publieLe: v.publieLe, publiePar: { nom: v.publiePar?.nom || '' } }))
} : null);
const SANS_VALEURS_DES_VERSIONS = { 'versions.valeurs': 0, 'versions.publiePar.id': 0 };

// Date d'une version pour le journal, à l'heure de Cotonou : « 02/11/2026 14:05 »
const dateVersion = (d) => new Date(d).toLocaleString('fr-FR', { timeZone: 'Africa/Porto-Novo', dateStyle: 'short', timeStyle: 'short' });

// Clé de l'adresse ; envoie le 404 et renvoie null si elle est inconnue
function definition(req, res) {
  const def = contenu(req.params.cle);
  if (!def) res.status(404).json({ message: 'Contenu du site inconnu.' });
  return def;
}

/**
 * Publie des valeurs déjà validées : remplace les valeurs, ajoute la version en tête (10 au plus), journalise.
 * @returns {Promise<{ inchange: true, doc } | { doc }>}
 */
async function publier(req, cle, def, valeurs, versionRestauree = null) {
  const avant = await ContenuSite.findOne({ cle }).select('valeurs').lean();
  if (avant && egal(avant.valeurs, valeurs)) {
    return { inchange: true, doc: await ContenuSite.findOne({ cle }).select(SANS_VALEURS_DES_VERSIONS).lean() };
  }

  const auteur = await User.findById(req.user.id).select('username').lean();
  const version = {
    _id: new mongoose.Types.ObjectId(), valeurs, publieLe: new Date(),
    publiePar: { id: req.user.id, nom: auteur?.username || '' }
  };
  const ecrire = () => ContenuSite.findOneAndUpdate(
    { cle },
    { $set: { valeurs }, $push: { versions: { $each: [version], $position: 0, $slice: NB_VERSIONS } } },
    { upsert: true, returnDocument: 'after', runValidators: true, projection: SANS_VALEURS_DES_VERSIONS }
  ).lean();
  let doc;
  try {
    doc = await ecrire();
  } catch (error) {
    if (error?.code !== 11000) throw error;
    doc = await ecrire(); // Deux premières publications simultanées : la seconde met à jour le document créé par la première
  }

  const resume = def.resumer(avant?.valeurs ?? null, valeurs)
    + (versionRestauree ? ` (retour à la version du ${dateVersion(versionRestauree.publieLe)})` : '');
  await journaliser(req, {
    action: avant ? 'Modification' : 'Création', entite: 'Site public', entiteId: cle, resume,
    avant: avant?.valeurs ?? null, apres: valeurs
  });
  return { doc };
}

// GET /api/admin/site -> { contenus: { infos: { valeurs, updatedAt, versions: [{ _id, publieLe, publiePar: { nom } }] } | null, bandeau: … } }
async function listerContenus(req, res) {
  try {
    const docs = await ContenuSite.find({ cle: { $in: CLES } }).select(SANS_VALEURS_DES_VERSIONS).lean();
    const contenus = Object.fromEntries(CLES.map(cle => [cle, versEcran(docs.find(d => d.cle === cle))]));
    return res.status(200).json({ contenus });
  } catch (error) {
    console.error("Erreur listerContenus:", error);
    return res.status(500).json({ message: "Erreur lors du chargement des contenus du site." });
  }
}

// GET /api/admin/site/:cle/versions/:id -> { valeurs, publieLe, publiePar: { nom } }
async function voirVersion(req, res) {
  try {
    if (!definition(req, res)) return;
    const version = mongoose.isValidObjectId(req.params.id)
      ? (await ContenuSite.findOne({ cle: req.params.cle }, { versions: { $elemMatch: { _id: req.params.id } } }).lean())?.versions?.[0]
      : null;
    if (!version) return res.status(404).json({ message: 'Version introuvable.' });
    return res.status(200).json({ valeurs: version.valeurs, publieLe: version.publieLe, publiePar: { nom: version.publiePar?.nom || '' } });
  } catch (error) {
    console.error("Erreur voirVersion:", error);
    return res.status(500).json({ message: "Erreur lors du chargement de la version." });
  }
}

// PUT /api/admin/site/:cle  { valeurs } -> { message, contenu }
async function publierContenu(req, res) {
  try {
    const def = definition(req, res);
    if (!def) return;
    const { valeurs, erreur } = def.valider(req.body?.valeurs);
    if (erreur) return res.status(400).json({ message: erreur });

    const { inchange, doc } = await publier(req, req.params.cle, def, valeurs);
    return res.status(200).json({
      message: inchange ? "Aucun changement : rien n'a été publié." : 'Publication enregistrée : le site est à jour.',
      contenu: versEcran(doc)
    });
  } catch (error) {
    console.error("Erreur publierContenu:", error);
    return res.status(500).json({ message: "Erreur lors de la publication." });
  }
}

// POST /api/admin/site/:cle/versions/:id/restaurer -> { message, contenu } : republie les valeurs de cette version
// comme une nouvelle publication (les règles actuelles s'appliquent)
async function restaurerVersion(req, res) {
  try {
    const def = definition(req, res);
    if (!def) return;
    const version = mongoose.isValidObjectId(req.params.id)
      ? (await ContenuSite.findOne({ cle: req.params.cle }, { versions: { $elemMatch: { _id: req.params.id } } }).lean())?.versions?.[0]
      : null;
    if (!version) return res.status(404).json({ message: 'Version introuvable.' });
    const { valeurs, erreur } = def.valider(version.valeurs);
    if (erreur) return res.status(400).json({ message: `Cette version ne respecte plus les règles actuelles : ${erreur}` });

    const { inchange, doc } = await publier(req, req.params.cle, def, valeurs, version);
    return res.status(200).json({
      message: inchange ? "Cette version est déjà celle du site : rien n'a été publié." : 'Version rétablie : le site est à jour.',
      contenu: versEcran(doc)
    });
  } catch (error) {
    console.error("Erreur restaurerVersion:", error);
    return res.status(500).json({ message: "Erreur lors du retour à cette version." });
  }
}

module.exports = { listerContenus, voirVersion, publierContenu, restaurerVersion };
