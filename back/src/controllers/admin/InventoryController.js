const mongoose = require('mongoose');
const { LotStockFifo, MouvementStock } = require('../../models/stock');
const PurchaseOrder = require('../../models/purchaseOrder');
const { TYPES_COMMANDE } = require('../../models/purchaseOrder');
const Product = require('../../models/product');
const { FAMILLES } = require('../../models/product');
const BudgetLine = require('../../models/budgetLine');
const { trouverFournisseur } = require('../../services/fournisseurService');
const { depenseDeLaPiece } = require('../../services/depenseStockService');
const { genererNumeroLot, nomResponsable } = require('../../services/stockService');
const { journaliser } = require('../../services/journalService');
const { echapperRegex } = require('../../utils/texte');
const { lireDate } = require('../../utils/dates');

const texte = (v, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const arrondi2 = (n) => Math.round(n * 100) / 100;
const arrondi3 = (n) => Math.round(n * 1000) / 1000;
const formatFcfa = (n) => `${Number(n ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA`;
// Nombre obligatoire : un nombre ou un texte numérique, fini ; NaN sinon (absent, illisible, tableau, objet,
// Infinity ou 1e999, que JSON lit comme Infinity)
const nombre = (v) => {
  if (typeof v !== 'number' && !(typeof v === 'string' && v.trim() !== '')) return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};
// Lignes d'une facture (bon et réception) : marge pour la limite de 60 s des transactions Atlas
const MAX_LIGNES = 100;
const ORDRE_FAMILLES = ['P', 'V', 'MP', 'EMB'];
const TYPE_PAR_FAMILLE = Object.fromEntries(Object.entries(FAMILLES).map(([type, famille]) => [famille, type]));
const collator = new Intl.Collator('fr', { numeric: true });
// Date et heure du Bénin, « AAAA-MM-JJ HH:mm:ss » (suffixe du numéro d'un bon supprimé)
const horodatage = (date) => new Date(date).toLocaleString('sv-SE', { timeZone: 'Africa/Porto-Novo' });

// Erreur de validation levée dans une transaction : renvoyée telle quelle à l'utilisateur
class ErreurMetier extends Error {
  constructor(statut, message) { super(message); this.statut = statut; }
}

// Deux transactions sur les mêmes documents (réceptions simultanées du même bon ou du même produit) : MongoDB annule
// la seconde avec le label TransientTransactionError ou l'erreur WriteConflict (code 112)
function conflitTransaction(error) {
  if (!error) return false;
  if (typeof error.hasErrorLabel === 'function' && error.hasErrorLabel('TransientTransactionError')) return true;
  return error.code === 112 || error.codeName === 'WriteConflict' || /WriteConflict/.test(String(error.message || ''));
}

/**
 * 1. ÉTAT DE L'INVENTAIRE GLOBAL & ALERTES (GET /api/admin/inventory/global?famille=P|V|MP|EMB)
 * Tous les produits actifs du catalogue, même sans stock (stock 0), avec leur famille ; deux requêtes en tout
 * (les produits, puis une agrégation des lots). Tri : familles P, V, MP, EMB, puis référence.
 */
async function obtenirInventaireGlobal(req, res) {
  try {
    const famille = req.query.famille;
    // Clé propre seulement : « constructor » ou « __proto__ » ne passent pas pour une famille
    if (famille !== undefined && famille !== '' && !(typeof famille === 'string' && Object.hasOwn(TYPE_PAR_FAMILLE, famille))) {
      return res.status(400).json({ message: "Famille invalide : P, V, MP ou EMB." });
    }

    const [produits, etatStock] = await Promise.all([
      Product.find({ deletedAt: null, ...(famille ? { type: TYPE_PAR_FAMILLE[famille] } : {}) })
        .select('reference name unit type seuilAlerte').lean(),
      // Stock restant par produit ; les lots à compter (quantité vide) et à vérifier sont signalés à part
      LotStockFifo.aggregate([
        { $match: { deletedAt: null, $or: [{ quantiteRestante: { $gt: 0 } }, { quantiteRestante: null }, { aConfirmer: { $gt: '' } }] } },
        {
          $group: {
            _id: "$product",
            stockTotal: { $sum: { $ifNull: ["$quantiteRestante", 0] } },
            nbLotsActifs: { $sum: { $cond: [{ $gt: [{ $ifNull: ["$quantiteRestante", 0] }, 0] }, 1, 0] } },
            lotsACompter: { $sum: { $cond: [{ $eq: [{ $ifNull: ["$quantiteRestante", null] }, null] }, 1, 0] } },
            lotsAConfirmer: { $sum: { $cond: [{ $gt: [{ $ifNull: ["$aConfirmer", ''] }, ''] }, 1, 0] } },
            // Valeur au prix d'achat : lot à compter = sa valeur facturée ; lot compté = valeur facturée au prorata du
            // reste (valeur × reste ÷ quantité initiale), sinon reste × prix d'achat unitaire
            valeurFcfa: {
              $sum: {
                $cond: [
                  { $eq: [{ $ifNull: ["$quantiteRestante", null] }, null] },
                  { $ifNull: ["$valeurFcfa", 0] },
                  {
                    $cond: [
                      { $and: [{ $ne: [{ $ifNull: ["$valeurFcfa", null] }, null] }, { $gt: [{ $ifNull: ["$quantiteInitiale", 0] }, 0] }] },
                      { $divide: [{ $multiply: ["$valeurFcfa", "$quantiteRestante"] }, "$quantiteInitiale"] },
                      { $multiply: ["$quantiteRestante", { $ifNull: ["$prixAchatUnitaire", 0] }] }
                    ]
                  }
                ]
              }
            }
          }
        }
      ])
    ]);

    const parProduit = new Map(etatStock.map(e => [String(e._id), e]));
    const rangFamille = (f) => (ORDRE_FAMILLES.includes(f) ? ORDRE_FAMILLES.indexOf(f) : ORDRE_FAMILLES.length);
    const inventaire = produits.map(p => {
      const e = parProduit.get(String(p._id)) || {};
      const seuil = p.seuilAlerte ?? null; // Dans l'unité du produit ; vide = pas d'alerte (seuil à renseigner)
      const stockTotal = arrondi3(e.stockTotal || 0);
      return {
        productId: p._id,
        reference: p.reference || null,
        nom: p.name,
        unite: p.unit,
        type: p.type,
        famille: FAMILLES[p.type] || null,
        stockTotal,
        nbLotsActifs: e.nbLotsActifs || 0,
        lotsACompter: e.lotsACompter || 0,
        lotsAConfirmer: e.lotsAConfirmer || 0,
        valeurFcfa: Math.round(e.valeurFcfa || 0),
        seuilAlerte: seuil,
        enAlerte: seuil !== null && stockTotal <= seuil // Badge rouge ; jamais d'alerte sur un seuil inconnu
      };
    }).sort((a, b) => rangFamille(a.famille) - rangFamille(b.famille)
      || (a.reference === null) - (b.reference === null)
      || collator.compare(a.reference || '', b.reference || '')
      || collator.compare(a.nom, b.nom));

    return res.status(200).json(inventaire);
  } catch (error) {
    console.error("Erreur obtenirInventaireGlobal:", error);
    return res.status(500).json({ message: "Erreur lors du calcul de l'inventaire." });
  }
}

/**
 * 2. HISTORIQUE DES MOUVEMENTS (GET /api/admin/mouvements)
 * Liste chronologique des flux non archivés, avec pagination et filtre par type
 */
async function obtenirHistoriqueMouvements(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 15, 1), 100);
    const { type, productId } = req.query; // Filtres optionnels
    const skip = (page - 1) * limit;

    const filtre = { deletedAt: null };
    if (type === 'correction') filtre.type = { $in: ['correction_positive', 'correction_negative'] };
    else if (type === 'transformation') filtre.type = { $in: ['transformation_sortie', 'transformation_entree'] };
    else if (typeof type === 'string' && type) filtre.type = type;
    if (productId) {
      if (!mongoose.isValidObjectId(productId)) return res.status(400).json({ message: "Produit invalide." });
      filtre.product = productId;
    }

    const mouvements = await MouvementStock.find(filtre)
      .populate('product', 'name unit')
      .populate('lotId', 'numeroLot fournisseur')
      .sort({ createdAt: -1 }) // Du plus récent au plus ancien
      .skip(skip)
      .limit(limit + 1);

    const hasMore = mouvements.length > limit;
    if (hasMore) mouvements.pop();

    return res.status(200).json({ mouvements, hasMore });
  } catch (error) {
    console.error("Erreur obtenirHistoriqueMouvements:", error);
    return res.status(500).json({ message: "Erreur lors du chargement des mouvements." });
  }
}

// ------------------------------------------------------------------
// Bons de commande fournisseurs
// Ancien format (écran Stock actuel) : `items`, inchangé. Nouveau format (facture d'achat) : `lignes`.
// ------------------------------------------------------------------

// Bon peuplé pour l'affichage : produits des deux formats, numéro des lots créés à la réception
function peuplerBon(requete) {
  return requete
    .populate('items.productId', 'name unit')
    .populate('lignes.productId', 'name unit reference type')
    .populate('lignes.lotId', 'numeroLot');
}

const estAncienFormat = (body) => body.items !== undefined && body.lignes === undefined;
const ligneRecue = (l) => !!l.lotId || (l.quantiteRecue !== null && l.quantiteRecue !== undefined);

/**
 * Lit et valide un bon au nouveau format (création ou modification).
 * Renvoie { bon } (champs à enregistrer) ou { statut, message }.
 */
async function lireBonFacture(body) {
  const refus = (message) => ({ statut: 400, message });

  const typeCommande = body.typeCommande === undefined || body.typeCommande === null || body.typeCommande === '' ? 'Bon de commande' : body.typeCommande;
  if (!TYPES_COMMANDE.includes(typeCommande)) return refus("Type de commande invalide : « Bon de commande » ou « Achat direct ».");
  const achatDirect = typeCommande === 'Achat direct';

  const numeroFacture = texte(body.numeroFacture, 60);
  if (achatDirect && !numeroFacture) return refus("Achat direct : indiquez le numéro de la facture.");
  // Bon de commande : référence du bon signé ; achat direct : numéro imposé par la facture
  const numeroBon = achatDirect ? `Achat direct – facture n° ${numeroFacture}` : texte(body.numeroBon, 60);
  if (!numeroBon) return refus("Indiquez la référence du bon de commande signé.");

  const vide = (v) => v === undefined || v === null || v === '';
  const dateFacture = lireDate(body.dateFacture);
  if (!vide(body.dateFacture) && !dateFacture) return refus("Date de la facture invalide (AAAA-MM-JJ).");
  // Date d'émission : celle du bon signé ; pour un achat direct, celle de la facture (à défaut, dateFacture)
  const dateEmissionSaisie = vide(body.dateEmission) && achatDirect ? body.dateFacture : body.dateEmission;
  const dateEmission = lireDate(dateEmissionSaisie);
  if (!dateEmission) {
    return refus(achatDirect ? "Indiquez la date de la facture (AAAA-MM-JJ)." : "Indiquez la date du bon de commande (AAAA-MM-JJ).");
  }

  const fournisseurFiche = await trouverFournisseur(body.fournisseurId);
  if (!fournisseurFiche) return refus("Fournisseur introuvable ou inactif (voir Prestataires).");

  if (!Array.isArray(body.lignes) || !body.lignes.length) return refus("Ajoutez au moins une ligne de facture.");
  if (body.lignes.length > MAX_LIGNES) return refus(`${MAX_LIGNES} lignes au plus par bon.`);
  const ids = body.lignes.map(l => l?.productId).filter(id => mongoose.isValidObjectId(id));
  const produits = new Map((await Product.find({ _id: { $in: ids }, deletedAt: null }).select('name unit')).map(p => [String(p._id), p]));

  const lignes = [];
  for (const [i, l] of body.lignes.entries()) {
    if (!l || typeof l !== 'object') return refus(`Ligne ${i + 1} invalide.`);
    const designation = texte(l.designation, 300);
    if (!designation) return refus(`Ligne ${i + 1} : désignation obligatoire (telle qu'écrite sur la facture).`);
    const nom = `Ligne ${i + 1} (« ${designation} »)`;
    const montant = nombre(l.montantFcfa);
    if (!(montant >= 0)) return refus(`${nom} : montant invalide.`);
    const produit = mongoose.isValidObjectId(l.productId) ? produits.get(String(l.productId)) : null;
    if (!produit) return refus(`${nom} : produit introuvable dans le catalogue.`);
    const quantite = nombre(l.quantite);
    if (!(quantite > 0)) return refus(`${nom} : quantité invalide (supérieure à 0, en ${produit.unit}).`);
    lignes.push({
      designation, quantiteFacture: texte(l.quantiteFacture, 100), montantFcfa: arrondi2(montant),
      productId: produit._id, quantite, detailQuantite: texte(l.detailQuantite, 200)
    });
  }

  const somme = arrondi2(lignes.reduce((s, l) => s + l.montantFcfa, 0));
  if (!vide(body.totalFacture)) {
    const total = nombre(body.totalFacture);
    if (!(total >= 0)) return refus("Total de la facture invalide.");
    if (arrondi2(total) !== somme) {
      return refus(`Le total de la facture (${formatFcfa(total)}) ne correspond pas à la somme des lignes (${formatFcfa(somme)}).`);
    }
  }

  const ligneBudgetaire = texte(body.ligneBudgetaire, 20);
  if (ligneBudgetaire && !await BudgetLine.exists({ code: ligneBudgetaire, deletedAt: null })) {
    return refus(`La ligne budgétaire ${ligneBudgetaire} n'existe pas.`);
  }

  return {
    bon: {
      typeCommande, numeroBon, numeroFacture,
      dateFacture: dateFacture || (achatDirect ? dateEmission : null),
      dateEmission,
      fournisseurId: fournisseurFiche._id, fournisseur: fournisseurFiche.nom,
      lignes, montantTotalFcfa: somme,
      ligneBudgetaire, sousLigne: texte(body.sousLigne, 20), commentaire: texte(body.commentaire, 1000)
    }
  };
}

// Numéro de bon déjà pris ou facture déjà saisie dans un bon actif. L'index de numeroBon est global (bons supprimés
// compris) : la suppression libère le numéro en renommant le bon (« … (supprimé le …) »), si bien qu'un conflit vient
// d'un bon actif, ou d'un bon supprimé avant cette règle, qui garde son numéro.
async function conflitBon(bon, idExclu = null) {
  const sauf = (filtre) => (idExclu ? { ...filtre, _id: { $ne: idExclu } } : filtre);
  const memeNumero = await PurchaseOrder.findOne(sauf({ numeroBon: bon.numeroBon })).select('numeroBon numeroFacture statut deletedAt').lean();
  if (memeNumero) {
    if (memeNumero.deletedAt) {
      return `Le numéro ${bon.numeroBon} reste porté par un bon supprimé le ${horodatage(memeNumero.deletedAt)}, avant que la suppression ne libère les numéros.`;
    }
    return `Le bon ${bon.numeroBon} existe déjà (${memeNumero.statut}${memeNumero.numeroFacture ? `, facture ${memeNumero.numeroFacture}` : ''}).`;
  }
  if (bon.numeroFacture) {
    const memeFacture = await PurchaseOrder.findOne(sauf({ numeroFacture: bon.numeroFacture, deletedAt: null })).select('numeroBon statut').lean();
    if (memeFacture) return `La facture ${bon.numeroFacture} est déjà saisie dans le bon ${memeFacture.numeroBon} (${memeFacture.statut}).`;
  }
  return null;
}

const resumeBon = (b) => `${b.typeCommande} ${b.numeroBon}${b.numeroFacture && b.typeCommande !== 'Achat direct' ? `, facture ${b.numeroFacture}` : ''} : ${b.lignes.length} ligne(s), ${formatFcfa(b.montantTotalFcfa)}, fournisseur ${b.fournisseur}`;

/**
 * 3. CRÉER UN BON DE COMMANDE FOURNISSEUR (POST /api/admin/bons-commande)
 * Ancien format : { fournisseurId, items } ; nouveau format : voir lireBonFacture
 */
async function creerBonCommande(req, res) {
  const body = req.body || {};
  if (estAncienFormat(body)) return creerBonAncienFormat(req, res);
  try {
    const lu = await lireBonFacture(body);
    if (lu.message) return res.status(lu.statut).json({ message: lu.message });
    const conflit = await conflitBon(lu.bon);
    if (conflit) return res.status(409).json({ message: conflit });

    const bon = await PurchaseOrder.create(lu.bon);
    await journaliser(req, { action: 'Création', entite: 'Bon de commande', entiteId: bon._id, resume: `${resumeBon(bon)} créé` });
    return res.status(201).json({ message: `${bon.typeCommande} ${bon.numeroBon} enregistré.`, bon: await peuplerBon(PurchaseOrder.findById(bon._id)) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "Ce numéro de bon ou cette facture est déjà enregistré." });
    console.error("Erreur creerBonCommande:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

// Ancien format (écran Stock actuel), comportement inchangé
async function creerBonAncienFormat(req, res) {
  try {
    const { fournisseurId, items } = req.body;

    if (!fournisseurId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Données du bon de commande incomplètes." });
    }

    const fournisseurFiche = await trouverFournisseur(fournisseurId);
    if (!fournisseurFiche) {
      return res.status(400).json({ message: "Fournisseur introuvable ou inactif (voir Prestataires)." });
    }

    const numeroBon = `BC-${Date.now().toString().slice(-6)}`; // Identifiant court unique

    const nouveauBon = await PurchaseOrder.create({
      numeroBon,
      fournisseurId: fournisseurFiche._id,
      fournisseur: fournisseurFiche.nom,
      items
    });

    return res.status(201).json({ message: "Bon de commande généré !", bon: nouveauBon });
  } catch (error) {
    console.error("Erreur creerBonCommande:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

/**
 * MODIFIER UN BON (PUT /api/admin/bons-commande/:id)
 * Ancien format inchangé ; nouveau format seulement tant qu'aucune ligne n'est réceptionnée, mêmes contrôles qu'à la création
 */
async function modifierBonCommande(req, res) {
  const body = req.body || {};
  // Ancien formulaire : accepté sur tout bon, y compris un bon au format facture déjà réceptionné
  // (choix du porteur du 18/10/2026 : l'écran actuel garde ce comportement)
  if (estAncienFormat(body)) return modifierBonAncienFormat(req, res);
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Bon introuvable." });
    const existant = await PurchaseOrder.findOne({ _id: req.params.id, deletedAt: null });
    if (!existant) return res.status(404).json({ message: "Bon introuvable." });
    if (existant.lignes.some(ligneRecue) || ['Reçu', 'Reçu partiellement'].includes(existant.statut)) {
      return res.status(400).json({ message: "Ce bon est déjà réceptionné (en tout ou en partie) : il ne se modifie plus." });
    }
    if (existant.statut === 'Annulé') return res.status(400).json({ message: "Ce bon est annulé : il ne se modifie plus." });

    const lu = await lireBonFacture(body);
    if (lu.message) return res.status(lu.statut).json({ message: lu.message });
    const conflit = await conflitBon(lu.bon, existant._id);
    if (conflit) return res.status(409).json({ message: conflit });

    const etat = (b) => ({ numeroBon: b.numeroBon, numeroFacture: b.numeroFacture, fournisseur: b.fournisseur, montantTotalFcfa: b.montantTotalFcfa, lignes: b.lignes.length });
    const avant = etat(existant);
    Object.assign(existant, lu.bon);
    await existant.save();
    await journaliser(req, {
      action: 'Modification', entite: 'Bon de commande', entiteId: existant._id, resume: `${resumeBon(existant)} (modifié)`,
      avant, apres: etat(existant)
    });
    return res.status(200).json({ message: "Bon mis à jour avec succès", bon: await peuplerBon(PurchaseOrder.findById(existant._id)) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "Ce numéro de bon ou cette facture est déjà enregistré." });
    console.error("Erreur modifierBonCommande:", error);
    return res.status(500).json({ message: "Erreur lors de la mise à jour." });
  }
}

// Ancien format (écran Stock actuel), comportement inchangé
async function modifierBonAncienFormat(req, res) {
  try {
    const { fournisseurId, items } = req.body;
    const fournisseurFiche = await trouverFournisseur(fournisseurId);
    if (!fournisseurFiche || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Fournisseur introuvable ou articles manquants." });
    }

    const bon = await PurchaseOrder.findByIdAndUpdate(
      req.params.id,
      { fournisseurId: fournisseurFiche._id, fournisseur: fournisseurFiche.nom, items },
      { new: true }
    ).populate('items.productId', 'name unit');

    if (!bon) return res.status(404).json({ message: "Bon introuvable." });

    return res.status(200).json({ message: "Bon mis à jour avec succès", bon });
  } catch (error) {
    return res.status(500).json({ message: "Erreur lors de la mise à jour." });
  }
}

// SUPPRESSION D'UN BON (logique) : refusée dès qu'une ligne est réceptionnée (ses lots existent)
async function supprimerBonCommande(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Bon de commande introuvable." });
    const bon = await PurchaseOrder.findOne({ _id: req.params.id, deletedAt: null }).select('numeroBon numeroFacture lignes').lean();
    if (!bon) {
      return res.status(404).json({ message: "Bon de commande introuvable." });
    }
    const recues = (bon.lignes || []).filter(ligneRecue);
    if (recues.length) {
      return res.status(400).json({ message: `Ce bon a ${recues.length} ligne(s) déjà réceptionnée(s) en stock : il ne se supprime plus.` });
    }

    // Mise à jour ciblée : un ancien bon incomplet ne bloque pas sa suppression. Le numéro est libéré (index global) :
    // le bon supprimé prend « <numéro> (supprimé le AAAA-MM-JJ HH:mm:ss) », la facture peut être ressaisie.
    // Le filtre refuse aussi un bon réceptionné entre-temps (réception simultanée).
    const maintenant = new Date();
    const numeroLibere = `${bon.numeroBon} (supprimé le ${horodatage(maintenant)})`;
    const resultat = await PurchaseOrder.updateOne(
      { _id: bon._id, deletedAt: null, lignes: { $not: { $elemMatch: { $or: [{ lotId: { $ne: null } }, { quantiteRecue: { $ne: null } }] } } } },
      { $set: { deletedAt: maintenant, numeroBon: numeroLibere } }
    );
    if (!resultat.modifiedCount) return res.status(409).json({ message: "Ce bon vient d'être modifié ou réceptionné : rechargez la liste." });
    await journaliser(req, {
      action: 'Suppression', entite: 'Bon de commande', entiteId: bon._id,
      resume: `Bon ${bon.numeroBon}${bon.numeroFacture ? ` (facture ${bon.numeroFacture})` : ''} supprimé ; numéro libéré, le bon supprimé devient « ${numeroLibere} »`
    });
    return res.status(200).json({ message: "Bon de commande supprimé." });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "Suppression simultanée du même numéro : réessayez dans une seconde." });
    console.error("Erreur supprimerBonCommande:", error);
    return res.status(500).json({ message: "Erreur lors de la suppression." });
  }
}

/**
 * 4. OBTENIR LES BONS DE COMMANDE (GET /api/admin/bons-commande?page&limit&search)
 * Bons actifs seulement ; recherche sur le numéro du bon, le fournisseur et le numéro de facture
 */
async function obtenirBonsCommande(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    // deletedAt: null couvre aussi les anciens bons sans ce champ ; la recherche s'y ajoute (insensible à la casse)
    const query = { deletedAt: null };
    if (search) {
      const motif = { $regex: echapperRegex(search), $options: 'i' };
      query.$or = [{ numeroBon: motif }, { fournisseur: motif }, { numeroFacture: motif }];
    }

    // Calcul du total des documents correspondants
    const total = await PurchaseOrder.countDocuments(query);

    // Récupération des données paginées
    const bonsCommande = await peuplerBon(PurchaseOrder.find(query))
      .sort({ dateEmission: -1, createdAt: -1 }) // Tri par date récente
      .skip((page - 1) * limit)
      .limit(limit);

    return res.status(200).json({
      bonsCommande,
      total,
      hasMore: page * limit < total
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des bons de commande :", error);
    return res.status(500).json({ message: "Erreur lors de la récupération des bons de commande." });
  }
}

/**
 * 5. RÉCEPTIONNER UN BON (POST /api/admin/bons-commande/:id/reception), section Stock
 * { dateReception, lignes: [{ ligneId, quantiteRecue, lotFournisseur?, numeroLot? }] }
 * Tout ou rien (transaction) : un lot et un mouvement d'entrée par ligne reçue. Le lot se rattache à la dépense
 * de la pièce (numéro de facture) si elle existe ; la réception ne crée jamais de dépense.
 */
async function receptionnerBon(req, res) {
  const body = req.body || {};
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Bon de commande introuvable." });
  const dateReception = lireDate(body.dateReception);
  if (!dateReception) return res.status(400).json({ message: "Indiquez la date de réception (AAAA-MM-JJ)." });
  if (!Array.isArray(body.lignes) || !body.lignes.length) return res.status(400).json({ message: "Indiquez les lignes reçues." });
  if (body.lignes.length > MAX_LIGNES) return res.status(400).json({ message: `${MAX_LIGNES} lignes au plus par réception.` });

  const demandes = [];
  const vues = new Set();
  for (const [i, l] of body.lignes.entries()) {
    if (!l || typeof l !== 'object' || !mongoose.isValidObjectId(l.ligneId)) {
      return res.status(400).json({ message: `Ligne ${i + 1} : identifiant de ligne invalide.` });
    }
    if (vues.has(String(l.ligneId))) return res.status(400).json({ message: `Ligne ${i + 1} : cette ligne du bon est demandée deux fois.` });
    vues.add(String(l.ligneId));
    const quantiteRecue = nombre(l.quantiteRecue);
    if (!(quantiteRecue > 0)) return res.status(400).json({ message: `Ligne ${i + 1} : quantité reçue invalide (supérieure à 0).` });
    demandes.push({ ligneId: String(l.ligneId), quantiteRecue, lotFournisseur: texte(l.lotFournisseur, 60), numeroLot: texte(l.numeroLot, 60) });
  }

  const session = await mongoose.startSession();
  try {
    const responsable = await nomResponsable(req);
    session.startTransaction();
    const bon = await PurchaseOrder.findOne({ _id: req.params.id, deletedAt: null }).session(session);
    if (!bon) throw new ErreurMetier(404, "Bon de commande introuvable.");
    if (!bon.lignes.length) throw new ErreurMetier(400, "Ce bon est à l'ancien format (sans lignes de facture) : enregistrez ses entrées depuis le stock.");
    if (bon.statut === 'Reçu') throw new ErreurMetier(400, `Le bon ${bon.numeroBon} est déjà entièrement réceptionné.`);
    if (bon.statut === 'Annulé') throw new ErreurMetier(400, `Le bon ${bon.numeroBon} est annulé.`);

    // Produits du catalogue actif seulement ; les fiches archivées sont lues pour nommer le produit dans le refus
    const produits = new Map((await Product.find({ _id: { $in: bon.lignes.map(l => l.productId) } }).select('name unit reference deletedAt').session(session)).map(p => [String(p._id), p]));
    const depense = await depenseDeLaPiece(bon.numeroFacture, session); // Jamais créée ici
    const motif = `Réception du bon ${bon.numeroBon}${bon.numeroFacture ? ` (facture ${bon.numeroFacture})` : ''}`;

    const lots = [];
    for (const d of demandes) {
      const ligne = bon.lignes.id(d.ligneId);
      if (!ligne) throw new ErreurMetier(400, `La ligne ${d.ligneId} n'appartient pas au bon ${bon.numeroBon}.`);
      if (ligneRecue(ligne)) throw new ErreurMetier(400, `La ligne « ${ligne.designation} » est déjà réceptionnée (lot ${ligne.numeroLot || 'sans numéro'}).`);
      const produit = produits.get(String(ligne.productId));
      if (!produit) throw new ErreurMetier(400, `Ligne « ${ligne.designation} » : produit introuvable.`);
      if (produit.deletedAt) {
        throw new ErreurMetier(400, `Ligne « ${ligne.designation} » : le produit ${[produit.reference, produit.name].filter(Boolean).join(' · ')} a été retiré du catalogue.`);
      }
      // Le lot ne peut pas valoir plus que la ligne payée : une quantité reçue au-delà de la facture est refusée
      if (d.quantiteRecue > ligne.quantite) {
        throw new ErreurMetier(400, `Ligne « ${ligne.designation} » : la quantité reçue (${d.quantiteRecue}) dépasse la quantité facturée (${ligne.quantite} ${produit.unit}).`);
      }

      // Numéro fourni, sinon généré (les lots créés plus haut dans la même transaction sont vus)
      const numeroLot = d.numeroLot || await genererNumeroLot(produit, dateReception, session);
      if (!numeroLot) throw new ErreurMetier(400, `Ligne « ${ligne.designation} » : ${produit.name} n'a pas de référence, indiquez le numéro de lot.`);
      if (await LotStockFifo.exists({ numeroLot, deletedAt: null }).session(session)) {
        throw new ErreurMetier(409, `Le numéro de lot ${numeroLot} existe déjà.`);
      }

      const [lot] = await LotStockFifo.create([{
        numeroLot,
        product: produit._id,
        quantiteInitiale: d.quantiteRecue,
        quantiteRestante: d.quantiteRecue,
        prixAchatUnitaire: arrondi2(ligne.montantFcfa / ligne.quantite),
        // Montant de la ligne si tout est reçu, sinon au prorata de la quantité reçue
        valeurFcfa: d.quantiteRecue === ligne.quantite ? ligne.montantFcfa : Math.round((ligne.montantFcfa * d.quantiteRecue) / ligne.quantite),
        dateReception,
        fournisseurId: bon.fournisseurId,
        fournisseur: bon.fournisseur,
        lotFournisseur: d.lotFournisseur,
        conditionnement: ligne.detailQuantite || ligne.quantiteFacture,
        numeroPiece: bon.numeroFacture,
        depenseId: depense?._id || null,
        bonCommandeId: bon._id,
        commentaire: `Bon ${bon.numeroBon}, ligne « ${ligne.designation} »`
      }], { session });
      await MouvementStock.create([{ product: produit._id, lotId: lot._id, type: 'entree', quantite: d.quantiteRecue, motif, responsable }], { session });
      await journaliser(req, {
        action: 'Création', entite: 'Lot de stock', entiteId: lot._id,
        resume: `Entrée ${lot.numeroLot} : ${produit.name}, ${d.quantiteRecue} ${produit.unit} (${motif})${depense ? `, rattachée à la dépense de la pièce ${bon.numeroFacture}` : ''}`
      }, session);

      Object.assign(ligne, { quantiteRecue: d.quantiteRecue, lotFournisseur: d.lotFournisseur, numeroLot, lotId: lot._id });
      lots.push(lot);
    }

    bon.dateReception = dateReception;
    if (depense) bon.depenseId = depense._id;
    bon.statut = bon.lignes.every(l => l.lotId) ? 'Reçu' : 'Reçu partiellement';
    await bon.save({ session });
    const sansDepense = !depense && bon.numeroFacture;
    await journaliser(req, {
      action: 'Validation', entite: 'Bon de commande', entiteId: bon._id,
      resume: `${motif} : ${lots.length} lot(s) créé(s) (${lots.map(l => l.numeroLot).join(', ')}), statut « ${bon.statut} »${sansDepense ? ', aucune dépense ne porte encore cette pièce' : ''}`
    }, session);

    await session.commitTransaction();
    const message = `${lots.length} lot(s) entré(s) en stock, bon « ${bon.statut} ».${sansDepense ? ` Aucune dépense ne porte la pièce ${bon.numeroFacture} : les lots restent sans dépense rattachée.` : ''}`;
    return res.status(201).json({ message, bon: await peuplerBon(PurchaseOrder.findById(bon._id)), lots });
  } catch (error) {
    if (session.inTransaction()) {
      try { await session.abortTransaction(); } catch { /* transaction déjà annulée par le serveur */ }
    }
    if (error instanceof ErreurMetier) return res.status(error.statut).json({ message: error.message });
    if (conflitTransaction(error)) {
      return res.status(409).json({ message: "Une autre réception est en cours sur ce bon ou sur ce produit : réessayez." });
    }
    if (error.code === 11000) return res.status(409).json({ message: "Ce numéro de lot existe déjà." });
    console.error("Erreur receptionnerBon:", error);
    return res.status(500).json({ message: "Erreur lors de la réception du bon." });
  } finally {
    session.endSession();
  }
}

module.exports = {
  obtenirInventaireGlobal,
  obtenirHistoriqueMouvements,
  creerBonCommande,
  obtenirBonsCommande,
  modifierBonCommande,
  supprimerBonCommande,
  receptionnerBon
};
