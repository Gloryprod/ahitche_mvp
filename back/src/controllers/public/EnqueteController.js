const Product = require('../../models/product');
const { ReponseEnquete, FORMULES_ENQUETE, AVIS_PRODUIT, PRODUITS_ENQUETE } = require('../../models/reponseEnquete');
const { normaliserTelephone } = require('../../utils/texte');

// Enquête de satisfaction, page publique /enquete (sans compte). Contrat : docs-internes/enquete/CONTRAT.md.
// Chaque champ est relu un à un : un champ inconnu n'est jamais enregistré.

const MAX_PRODUITS = 3;
const MAX_DETAIL = 50; // Garde-fou : un avis par produit, 17 produits de base aujourd'hui
const OBJECT_ID = /^[0-9a-f]{24}$/i;

class ErreurSaisie extends Error {}
const refuser = (message) => { throw new ErreurSaisie(message); };
const absent = (v) => v === undefined || v === null || v === '';

// Texte facultatif : espaces retirés aux extrémités, vide = absent
function texte(v, max, libelle) {
  if (absent(v)) return undefined;
  if (typeof v !== 'string') refuser(`${libelle} : texte attendu.`);
  const t = v.trim();
  if (t.length > max) refuser(`${libelle} : ${max} caractères au plus.`);
  return t || undefined;
}

function note(v, obligatoire) {
  if (absent(v) && !obligatoire) return undefined;
  if (!Number.isInteger(v) || v < 1 || v > 5) refuser('Merci de donner une note de 1 à 5.');
  return v;
}

const idProduit = (v) => (typeof v === 'string' && OBJECT_ID.test(v) ? v.toLowerCase() : refuser('Produit inconnu.'));

function listeProduits(v) {
  if (absent(v)) return [];
  if (!Array.isArray(v)) refuser('Liste de produits invalide.');
  if (v.length > MAX_PRODUITS) refuser('3 produits au plus.');
  const ids = v.map(idProduit);
  if (new Set(ids).size !== ids.length) refuser('Un produit est cité deux fois.');
  return ids;
}

function detail(v) {
  if (absent(v)) return [];
  if (!Array.isArray(v) || v.length > MAX_DETAIL) refuser('Détail produit par produit invalide.');
  const vus = new Set();
  return v.map((ligne) => {
    if (!ligne || typeof ligne !== 'object') refuser('Détail produit par produit invalide.');
    const produit = idProduit(ligne.produit);
    if (vus.has(produit)) refuser('Un seul avis par produit.');
    vus.add(produit);
    if (!AVIS_PRODUIT.includes(ligne.avis)) refuser('Avis sur un produit invalide.');
    const remplacement = ligne.avis === 'autre' ? texte(ligne.remplacement, 80, 'À la place de quoi') : undefined;
    return { produit, avis: ligne.avis, remplacement };
  });
}

function contact(v) {
  if (absent(v)) return undefined;
  if (typeof v !== 'object' || Array.isArray(v)) refuser('Coordonnées invalides.');
  const prenom = texte(v.prenom, 50, 'Prénom');
  if (!absent(v.telephone) && typeof v.telephone !== 'string') refuser('Numéro invalide.');
  const saisi = (v.telephone ?? '').trim();
  let telephone;
  if (saisi) {
    if (v.accordRecontact !== true) refuser("Pour être recontacté, coche la case d'accord.");
    telephone = normaliserTelephone(saisi) || refuser('Numéro invalide.');
  }
  if (!prenom && !telephone) return undefined;
  return { prenom, telephone, accordRecontact: v.accordRecontact === true };
}

// GET /api/public/enquete -> { produits: [{ id, nom }] } : nom seulement, jamais de prix, de stock ni de fournisseur
async function produitsEnquete(req, res) {
  try {
    const produits = await Product.find(PRODUITS_ENQUETE).select('name').sort({ reference: 1, name: 1 }).lean();
    res.set('Cache-Control', 'public, max-age=300');
    return res.status(200).json({ produits: produits.map(p => ({ id: p._id, nom: p.name })) });
  } catch (error) {
    console.error('Erreur produitsEnquete:', error);
    return res.status(500).json({ message: "Erreur lors du chargement de l'enquête." });
  }
}

// POST /api/public/enquete -> 201 { ok: true } ; 400 { message } si une réponse est invalide
async function enregistrerReponse(req, res) {
  try {
    const corps = req.body;
    if (!corps || typeof corps !== 'object' || Array.isArray(corps)) return res.status(400).json({ message: 'Requête invalide.' });
    // Champ piège, invisible pour une personne : rempli par un robot, la réponse est la même mais rien n'est gardé
    if (!absent(corps.site)) return res.status(201).json({ ok: true });

    const reponse = {
      noteGlobale: note(corps.noteGlobale, true),
      noteLivraison: note(corps.noteLivraison, false),
      noteQualite: note(corps.noteQualite, false),
      formule: absent(corps.formule) ? undefined : (FORMULES_ENQUETE.includes(corps.formule) ? corps.formule : refuser('Pack inconnu.')),
      produitsPlus: listeProduits(corps.produitsPlus),
      produitsMoins: listeProduits(corps.produitsMoins),
      produitSouhaite: texte(corps.produitSouhaite, 200, 'Produit souhaité'),
      detail: detail(corps.detail),
      suggestion: texte(corps.suggestion, 1000, 'Suggestion'),
      contact: contact(corps.contact),
    };
    if (reponse.produitsPlus.some(id => reponse.produitsMoins.includes(id))) {
      refuser('Un produit ne peut pas être à la fois en plus et en moins.');
    }
    const ids = [...new Set([...reponse.produitsPlus, ...reponse.produitsMoins, ...reponse.detail.map(d => d.produit)])];
    if (ids.length && await Product.countDocuments({ ...PRODUITS_ENQUETE, _id: { $in: ids } }) !== ids.length) {
      refuser('Produit inconnu.');
    }

    await ReponseEnquete.create(reponse);
    return res.status(201).json({ ok: true });
  } catch (error) {
    if (error instanceof ErreurSaisie) return res.status(400).json({ message: error.message });
    console.error('Erreur enregistrerReponse (enquête):', error);
    return res.status(500).json({ message: "Erreur lors de l'envoi de tes réponses. Réessaie dans un instant." });
  }
}

module.exports = { produitsEnquete, enregistrerReponse };
