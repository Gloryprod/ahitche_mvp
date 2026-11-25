// Liste des packs : la collection Formules fait foi. Le slug « ahi-<type> » d'une formule donne le type du pack, qui
// est aussi la clé de ses quantités dans le catalogue (Product.quantites.<type>). Un pack créé dans l'admin
// (« Créer un pack », écran Formules) est donc aussitôt reconnu partout : quantités, import du référentiel,
// composition, prévision d'achats, idées de repas.
const Formule = require('../models/formules');

// Type d'un pack : minuscules et chiffres, sans accent ni tiret (« etudiant »), 2 à 20 caractères
const TYPE_PACK = /^[a-z][a-z0-9]{1,19}$/;
const ORDRE_REFERENTIEL = ['essentiel', 'equilibre', 'confort', 'reserve', 'fraicheur'];
const typeDepuisSlug = (slug) => String(slug || '').replace(/^ahi-/, '');

/**
 * Packs dans l'ordre de l'admin : champ « ordre », sinon ordre du référentiel v4, puis date de création.
 * @returns {Promise<{ type, slug, nom, statut, bientotDisponible, ordre }[]>}
 */
async function listerPacks(session = null) {
  const formules = await Formule.find({}).select('slug nom statut bientotDisponible ordre createdAt').session(session).lean();
  const rang = (f) => f.ordre ?? (ORDRE_REFERENTIEL.includes(typeDepuisSlug(f.slug)) ? ORDRE_REFERENTIEL.indexOf(typeDepuisSlug(f.slug)) : 1000);
  return formules
    .filter(f => TYPE_PACK.test(typeDepuisSlug(f.slug)))
    .sort((a, b) => rang(a) - rang(b) || new Date(a.createdAt) - new Date(b.createdAt))
    .map(f => ({ type: typeDepuisSlug(f.slug), slug: f.slug, nom: f.nom, statut: f.statut, bientotDisponible: !!f.bientotDisponible, ordre: f.ordre ?? null }));
}

const typesPacks = async (session = null) => (await listerPacks(session)).map(p => p.type);

module.exports = { TYPE_PACK, typeDepuisSlug, listerPacks, typesPacks };
