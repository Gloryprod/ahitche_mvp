const mongoose = require('mongoose');
const Product = require('../../models/product');
const { journaliser } = require('../../services/journalService');

// Compléments de la semaine : les produits « extra » du catalogue, avec photo, description et affichage sur le site.
// Un seul prix : celui du catalogue, que le serveur applique aussi aux extras des commandes.
// Admin et gestionnaires (section « complements ») ; la suppression du catalogue reste à l'admin (/products/:id).

const CHAMPS = 'reference name unit priceUnit statut description photo cetteSemaine updatedAt';
const PHOTO_AUTORISEE = /^https:\/\/res\.cloudinary\.com\/[^\s"'<>]+$/;

const texte = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Valide la saisie ; `partiel` : seuls les champs présents sont lus (affichage cette semaine, par exemple)
function lireComplement(body, partiel = false) {
  const champs = {};
  const present = (cle) => !partiel || body[cle] !== undefined;

  if (present('name')) {
    champs.name = texte(body.name, 80);
    if (!champs.name) return { erreur: 'Le nom du produit est obligatoire.' };
  }
  if (present('priceUnit')) {
    const prix = Number(String(body.priceUnit ?? '').replace(/\s/g, '').replace(',', '.'));
    if (!(Number.isFinite(prix) && prix > 0)) return { erreur: 'Indiquez un prix de vente en FCFA (supérieur à 0).' };
    champs.priceUnit = Math.round(prix);
  }
  if (present('unit')) {
    champs.unit = texte(body.unit, 30);
    if (!champs.unit) return { erreur: "L'unité est obligatoire (ex. kg, lot, pack, unité)." };
  }
  if (present('description')) champs.description = texte(body.description, 200);
  if (present('photo')) {
    const photo = texte(body.photo, 500);
    if (photo && !PHOTO_AUTORISEE.test(photo)) return { erreur: 'La photo doit être téléversée depuis ce formulaire.' };
    champs.photo = photo;
  }
  if (present('cetteSemaine')) champs.cetteSemaine = body.cetteSemaine === true;
  if (present('disponible')) champs.statut = body.disponible === false ? 'indisponible' : 'disponible';
  return { champs };
}

// Ce qui change, pour le journal (le prix d'abord)
function differences(avant, apres) {
  const lignes = [];
  if ((avant.priceUnit ?? null) !== (apres.priceUnit ?? null)) lignes.push(`prix : ${avant.priceUnit ?? 'vide'} → ${apres.priceUnit} FCFA`);
  if (avant.name !== apres.name) lignes.push(`nom : ${avant.name} → ${apres.name}`);
  if (avant.unit !== apres.unit) lignes.push(`unité : ${avant.unit} → ${apres.unit}`);
  if (avant.statut !== apres.statut) lignes.push(`statut : ${avant.statut} → ${apres.statut}`);
  if (!!avant.cetteSemaine !== !!apres.cetteSemaine) lignes.push(apres.cetteSemaine ? 'affiché cette semaine' : 'retiré de la semaine');
  if ((avant.photo || '') !== (apres.photo || '')) lignes.push(apres.photo ? 'photo changée' : 'photo retirée');
  if ((avant.description || '') !== (apres.description || '')) lignes.push('description modifiée');
  return lignes;
}

const nomProduit = (p) => [p.reference, p.name].filter(Boolean).join(' · ');

// Référence suivante des produits variables : V20, V21… (les numéros archivés ne sont pas réutilisés)
async function referenceSuivante() {
  const [r] = await Product.aggregate([
    { $match: { reference: { $regex: /^V\d+$/ } } },
    { $group: { _id: null, max: { $max: { $toInt: { $substrCP: ['$reference', 1, 6] } } } } }
  ]);
  return `V${String((r?.max ?? 0) + 1).padStart(2, '0')}`;
}

// GET /api/admin/complements : tous les extras actifs, ceux de la semaine d'abord
async function listerComplements(req, res) {
  try {
    const complements = await Product.find({ type: 'extra', deletedAt: null }).select(CHAMPS).sort({ cetteSemaine: -1, name: 1 }).lean();
    return res.status(200).json({ complements });
  } catch (error) {
    console.error('Erreur listerComplements:', error);
    return res.status(500).json({ message: 'Erreur lors du chargement des compléments.' });
  }
}

// POST /api/admin/complements : nouveau produit « extra » au catalogue
async function creerComplement(req, res) {
  try {
    const { champs, erreur } = lireComplement({ unit: 'unité', cetteSemaine: true, ...req.body });
    if (erreur) return res.status(400).json({ message: erreur });
    const produit = await Product.create({
      ...champs, reference: await referenceSuivante(), type: 'extra',
      quantites: { essentiel: null, equilibre: null, confort: null, reserve: null, fraicheur: null }
    });
    await journaliser(req, { action: 'Création', entite: 'Produit', entiteId: produit._id, resume: `Complément ${nomProduit(produit)} créé (${produit.priceUnit} FCFA / ${produit.unit}${produit.cetteSemaine ? ', affiché cette semaine' : ''})` });
    return res.status(201).json(await Product.findById(produit._id).select(CHAMPS).lean());
  } catch (error) {
    console.error('Erreur creerComplement:', error);
    return res.status(500).json({ message: "Erreur lors de l'ajout du produit." });
  }
}

// PUT /api/admin/complements/:id (fiche complète) et PATCH /api/admin/complements/:id (champs envoyés seulement,
// ex. { cetteSemaine: false } pour retirer de la semaine)
async function modifierComplement(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Produit introuvable.' });
    const { champs, erreur } = lireComplement(req.body, req.method === 'PATCH');
    if (erreur) return res.status(400).json({ message: erreur });
    const avant = await Product.findOne({ _id: req.params.id, type: 'extra', deletedAt: null }).lean();
    if (!avant) return res.status(404).json({ message: 'Produit introuvable.' });
    const apres = await Product.findByIdAndUpdate(avant._id, { $set: champs }, { new: true, runValidators: true }).select(CHAMPS).lean();
    const changements = differences(avant, { ...avant, ...apres });
    if (changements.length) {
      await journaliser(req, {
        action: 'Modification', entite: 'Produit', entiteId: avant._id,
        resume: `Complément ${nomProduit(apres)} : ${changements.join(' ; ')}`,
        avant: { priceUnit: avant.priceUnit, cetteSemaine: !!avant.cetteSemaine, statut: avant.statut },
        apres: { priceUnit: apres.priceUnit, cetteSemaine: !!apres.cetteSemaine, statut: apres.statut }
      });
    }
    return res.status(200).json(apres);
  } catch (error) {
    console.error('Erreur modifierComplement:', error);
    return res.status(500).json({ message: 'Erreur lors de la modification du produit.' });
  }
}

// POST /api/admin/complements/photo : champ « photo » ; renvoie l'adresse à enregistrer avec le produit
async function televerserPhoto(req, res) {
  if (!req.file) return res.status(400).json({ message: 'Photo manquante ou format non accepté (JPEG, PNG ou WebP).' });
  return res.status(200).json({ url: req.file.path });
}

module.exports = { listerComplements, creerComplement, modifierComplement, televerserPhoto };
