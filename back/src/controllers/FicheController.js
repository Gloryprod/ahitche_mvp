const mongoose = require('mongoose');
const FicheProduit = require('../models/ficheProduit');
const Product = require('../models/product');
const { TYPES_VENDUS, FAMILLES } = require('../models/product');
const { journaliser } = require('../services/journalService');

// Fiches produits (docs-internes/vip/CAHIER-DES-CHARGES.md, partie A) : publicité du bandeau de l'espace client.
// Rattachées à un produit vendu du catalogue (base fixe ou extra), avec un format, un prix publicitaire saisi à la main,
// une mention et une photo facultatives. Affichage seulement : aucun lien avec les commandes, le stock, les finances
// ni les prix VIP. Back-office : section « fiches » (lecture admin, gestionnaire, coordinateur ; écriture admin et
// gestionnaire), chaque écriture journalisée.

const PRIX_MAX = 10000000; // Garde-fou de saisie (FCFA)
const ORDRE_MAX = 9999;
const PHOTO_URL = /^https:\/\/res\.cloudinary\.com\/[^\s"'<>]+$/;
const PHOTO_ID = /^fiches\/[\w-]{1,200}$/;
const PHOTO_VIDE = { url: '', publicId: '' };

// Texte d'une saisie : espaces et retours à la ligne ramenés à un seul espace
const nettoyer = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const nomProduit = (p) => [p?.reference, p?.name].filter(Boolean).join(' · ') || 'produit supprimé';
const fcfa = (n) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;

// Nombre saisi : un nombre ou un texte numérique (« 1 500 », « 85 ») ; NaN sinon
function nombre(v) {
  if (typeof v !== 'number' && !(typeof v === 'string' && v.trim() !== '')) return NaN;
  const n = Number(typeof v === 'string' ? v.replace(/\s/g, '').replace(',', '.') : v);
  return Number.isFinite(n) ? n : NaN;
}

// Photo : vide, ou l'adresse et l'identifiant renvoyés par POST /api/admin/fiches/photo (dossier « fiches »)
function lirePhoto(v) {
  if (v === null || v === undefined || v === '') return { photo: PHOTO_VIDE };
  if (typeof v !== 'object' || Array.isArray(v)) return { erreur: true };
  const url = typeof v.url === 'string' ? v.url.trim() : '';
  const publicId = typeof v.publicId === 'string' ? v.publicId.trim() : '';
  if (!url && !publicId) return { photo: PHOTO_VIDE };
  if (url.length > 500 || !PHOTO_URL.test(url) || !PHOTO_ID.test(publicId) || !url.includes(`/${publicId}.`)) return { erreur: true };
  return { photo: { url, publicId } };
}

/**
 * Valide la saisie d'une fiche, sans toucher à la base. `partiel` (PATCH) : seuls les champs présents sont lus.
 * @returns {{ erreur } | { champs }}
 */
function lireFiche(body, partiel = false) {
  const champs = {};
  const present = (cle) => !partiel || body[cle] !== undefined;

  if (present('productId')) {
    if (!mongoose.isValidObjectId(body.productId)) return { erreur: 'Choisissez le produit de la fiche.' };
    champs.productId = String(body.productId);
  }
  if (present('format')) {
    if (body.format !== undefined && typeof body.format !== 'string') return { erreur: 'Format invalide.' };
    champs.format = nettoyer(body.format);
    if (!champs.format) return { erreur: 'Indiquez le format (ex. « Boîte de 70 g »).' };
    if (champs.format.length > 60) return { erreur: 'Format : 60 caractères au plus.' };
  }
  if (present('prix')) {
    const prix = nombre(body.prix);
    if (!(prix >= 0 && prix <= PRIX_MAX)) return { erreur: 'Indiquez le prix affiché en FCFA (0 ou plus).' };
    champs.prix = Math.round(prix);
  }
  if (present('mention')) {
    if (body.mention !== undefined && body.mention !== null && typeof body.mention !== 'string') return { erreur: 'Mention invalide.' };
    champs.mention = nettoyer(body.mention);
    if (champs.mention.length > 120) return { erreur: 'Mention : 120 caractères au plus.' };
  }
  if (present('photo')) {
    const { photo, erreur } = lirePhoto(body.photo);
    if (erreur) return { erreur: 'La photo doit être téléversée depuis ce formulaire.' };
    champs.photo = photo;
  }
  if (present('publiee')) {
    if (body.publiee !== undefined && typeof body.publiee !== 'boolean') return { erreur: 'Publiée : oui ou non.' };
    champs.publiee = body.publiee !== false;
  }
  if (present('ordre')) {
    if (body.ordre === null || body.ordre === undefined || body.ordre === '') champs.ordre = null;
    else {
      const ordre = nombre(body.ordre);
      if (!Number.isInteger(ordre) || Math.abs(ordre) > ORDRE_MAX) return { erreur: `Ordre d'affichage : nombre entier de -${ORDRE_MAX} à ${ORDRE_MAX}, ou vide.` };
      champs.ordre = ordre;
    }
  }
  return { champs };
}

// Produit d'une fiche : actif et vendu (jamais une matière première ni une fourniture)
const produitVendu = (id) => Product.findOne({ _id: id, deletedAt: null, type: { $in: TYPES_VENDUS } }).select('reference name unit type statut').lean();

// Tri d'affichage : ordre (les fiches sans ordre ensuite), puis nom du produit et format
const collator = new Intl.Collator('fr', { numeric: true });
const trier = (a, b) => (a.ordre ?? Infinity) - (b.ordre ?? Infinity) || collator.compare(a.nom, b.nom) || collator.compare(a.format, b.format);

// Ce qui change, pour le journal
function differences(avant, apres, produitAvant, produitApres) {
  const lignes = [];
  if (String(avant.productId) !== String(apres.productId)) lignes.push(`produit : ${nomProduit(produitAvant)} → ${nomProduit(produitApres)}`);
  if (avant.format !== apres.format) lignes.push(`format : ${avant.format} → ${apres.format}`);
  if (avant.prix !== apres.prix) lignes.push(`prix : ${fcfa(avant.prix)} → ${fcfa(apres.prix)}`);
  if ((avant.mention || '') !== (apres.mention || '')) lignes.push('mention modifiée');
  if ((avant.photo?.url || '') !== (apres.photo?.url || '')) lignes.push(apres.photo?.url ? 'photo changée' : 'photo retirée');
  if (!!avant.publiee !== !!apres.publiee) lignes.push(apres.publiee ? 'publiée' : 'retirée de l\'espace client');
  if ((avant.ordre ?? null) !== (apres.ordre ?? null)) lignes.push(`ordre : ${avant.ordre ?? 'vide'} → ${apres.ordre ?? 'vide'}`);
  return lignes;
}

const versAdmin = (f, produit) => ({
  _id: f._id, productId: f.productId,
  produit: produit
    ? { reference: produit.reference, nom: produit.name, unite: produit.unit, famille: FAMILLES[produit.type] ?? '', indisponible: produit.statut === 'indisponible', supprime: !!produit.deletedAt }
    : { reference: '', nom: 'Produit introuvable', unite: '', famille: '', indisponible: false, supprime: true },
  format: f.format, prix: f.prix, mention: f.mention, photo: f.photo?.url ? f.photo : PHOTO_VIDE,
  publiee: f.publiee, ordre: f.ordre ?? null, creeLe: f.createdAt, modifieLe: f.updatedAt
});

// ------------------------------------------------------------------
// Back-office (section « fiches »)
// ------------------------------------------------------------------

// GET /api/admin/fiches : toutes les fiches non supprimées, avec le nom et la référence du produit
async function listerFiches(req, res) {
  try {
    const fiches = await FicheProduit.find({ deletedAt: null }).lean();
    const produits = new Map((await Product.find({ _id: { $in: fiches.map(f => f.productId) } })
      .select('reference name unit type statut deletedAt').lean()).map(p => [String(p._id), p]));
    const liste = fiches.map(f => versAdmin(f, produits.get(String(f.productId))));
    liste.sort((a, b) => trier({ ...a, nom: a.produit.nom }, { ...b, nom: b.produit.nom }));
    return res.status(200).json({ fiches: liste });
  } catch (error) {
    console.error("Erreur listerFiches:", error);
    return res.status(500).json({ message: "Erreur lors du chargement des fiches produits." });
  }
}

// GET /api/admin/fiches/produits : produits proposés dans le formulaire (vendus et actifs), sans aucun prix
async function produitsPourFiches(req, res) {
  try {
    const produits = await Product.find({ deletedAt: null, type: { $in: TYPES_VENDUS } })
      .select('reference name unit type statut').sort({ reference: 1, name: 1 }).lean();
    return res.status(200).json({
      produits: produits.map(p => ({ _id: p._id, reference: p.reference, nom: p.name, unite: p.unit, famille: FAMILLES[p.type], indisponible: p.statut === 'indisponible' }))
    });
  } catch (error) {
    console.error("Erreur produitsPourFiches:", error);
    return res.status(500).json({ message: "Erreur lors du chargement des produits." });
  }
}

// POST /api/admin/fiches  { productId, format, prix, mention, photo: { url, publicId } | null, publiee, ordre }
async function creerFiche(req, res) {
  try {
    const { champs, erreur } = lireFiche(req.body || {});
    if (erreur) return res.status(400).json({ message: erreur });
    const produit = await produitVendu(champs.productId);
    if (!produit) return res.status(400).json({ message: "Produit introuvable ou non vendu (base fixe ou extra seulement)." });

    const fiche = await FicheProduit.create(champs);
    await journaliser(req, {
      action: 'Création', entite: 'Fiche produit', entiteId: fiche._id,
      resume: `Fiche produit ${nomProduit(produit)} « ${fiche.format} » créée (${fcfa(fiche.prix)}${fiche.publiee ? ', publiée' : ', non publiée'})`,
      apres: { productId: String(fiche.productId), format: fiche.format, prix: fiche.prix, publiee: fiche.publiee }
    });
    return res.status(201).json({ message: "Fiche produit créée.", fiche: versAdmin(fiche.toObject(), produit) });
  } catch (error) {
    console.error("Erreur creerFiche:", error);
    return res.status(500).json({ message: "Erreur lors de la création de la fiche produit." });
  }
}

// PUT /api/admin/fiches/:id (fiche complète) et PATCH /api/admin/fiches/:id (champs envoyés seulement,
// ex. { publiee: false } pour la retirer de l'espace client)
async function modifierFiche(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Fiche produit introuvable." });
    const { champs, erreur } = lireFiche(req.body || {}, req.method === 'PATCH');
    if (erreur) return res.status(400).json({ message: erreur });
    if (!Object.keys(champs).length) return res.status(400).json({ message: "Aucune modification." });

    const avant = await FicheProduit.findOne({ _id: req.params.id, deletedAt: null }).lean();
    if (!avant) return res.status(404).json({ message: "Fiche produit introuvable." });
    const produitAvant = await Product.findById(avant.productId).select('reference name unit type statut deletedAt').lean();
    let produitApres = produitAvant;
    if (champs.productId && champs.productId !== String(avant.productId)) {
      produitApres = await produitVendu(champs.productId);
      if (!produitApres) return res.status(400).json({ message: "Produit introuvable ou non vendu (base fixe ou extra seulement)." });
    }

    const apres = await FicheProduit.findByIdAndUpdate(avant._id, { $set: champs }, { returnDocument: 'after', runValidators: true }).lean();
    const changements = differences(avant, apres, produitAvant, produitApres);
    if (changements.length) {
      await journaliser(req, {
        action: 'Modification', entite: 'Fiche produit', entiteId: avant._id,
        resume: `Fiche produit ${nomProduit(produitApres)} « ${apres.format} » : ${changements.join(' ; ')}`,
        avant: { productId: String(avant.productId), format: avant.format, prix: avant.prix, publiee: avant.publiee },
        apres: { productId: String(apres.productId), format: apres.format, prix: apres.prix, publiee: apres.publiee }
      });
    }
    return res.status(200).json({ message: "Fiche produit enregistrée.", fiche: versAdmin(apres, produitApres) });
  } catch (error) {
    console.error("Erreur modifierFiche:", error);
    return res.status(500).json({ message: "Erreur lors de la modification de la fiche produit." });
  }
}

// DELETE /api/admin/fiches/:id : suppression logique (la fiche disparaît de l'espace client et de la liste)
async function supprimerFiche(req, res) {
  try {
    const fiche = mongoose.isValidObjectId(req.params.id)
      ? await FicheProduit.findOneAndUpdate({ _id: req.params.id, deletedAt: null }, { $set: { deletedAt: new Date() } }, { returnDocument: 'after' }).lean()
      : null;
    if (!fiche) return res.status(404).json({ message: "Fiche produit introuvable." });
    const produit = await Product.findById(fiche.productId).select('reference name').lean();
    await journaliser(req, { action: 'Suppression', entite: 'Fiche produit', entiteId: fiche._id, resume: `Fiche produit ${nomProduit(produit)} « ${fiche.format} » supprimée` });
    return res.status(200).json({ message: "Fiche produit supprimée." });
  } catch (error) {
    console.error("Erreur supprimerFiche:", error);
    return res.status(500).json({ message: "Erreur lors de la suppression de la fiche produit." });
  }
}

// POST /api/admin/fiches/photo : champ « photo » (JPEG, PNG ou WebP, 5 Mo au plus, réduite dans le navigateur avant
// l'envoi) ; renvoie { url, publicId } à enregistrer avec la fiche
async function televerserPhoto(req, res) {
  if (!req.file) return res.status(400).json({ message: 'Photo manquante ou format non accepté (JPEG, PNG ou WebP).' });
  return res.status(200).json({ url: req.file.path, publicId: req.file.filename });
}

// ------------------------------------------------------------------
// Espace client
// ------------------------------------------------------------------

// GET /api/auth/fiches (compte connecté) -> { fiches: [{ id, nom, format, prix, mention, photo }] }
// Fiches publiées, non supprimées, dont le produit est actif, vendu et disponible : un produit « indisponible » sort du
// bandeau et y revient seul quand il redevient disponible (choix du porteur du 25/10/2026). Jamais le prix du catalogue
// ni aucune donnée interne.
async function fichesPubliees(req, res) {
  try {
    const fiches = await FicheProduit.find({ publiee: true, deletedAt: null }).select('productId format prix mention photo.url ordre').lean();
    const produits = new Map((await Product.find({
      _id: { $in: fiches.map(f => f.productId) }, deletedAt: null, type: { $in: TYPES_VENDUS }, statut: { $ne: 'indisponible' }
    }).select('name').lean()).map(p => [String(p._id), p]));
    const liste = fiches
      .filter(f => produits.has(String(f.productId)))
      .map(f => ({ id: f._id, nom: produits.get(String(f.productId)).name, format: f.format, prix: f.prix, mention: f.mention || '', photo: f.photo?.url || '', ordre: f.ordre ?? null }))
      .sort(trier)
      .map(({ ordre, ...fiche }) => fiche);
    res.set('Cache-Control', 'private, max-age=120'); // Téléphone : un changement de l'équipe apparaît en 2 minutes au plus
    return res.status(200).json({ fiches: liste });
  } catch (error) {
    console.error("Erreur fichesPubliees:", error);
    return res.status(500).json({ message: "Erreur lors du chargement des produits." });
  }
}

module.exports = { listerFiches, produitsPourFiches, creerFiche, modifierFiche, supprimerFiche, televerserPhoto, fichesPubliees };
