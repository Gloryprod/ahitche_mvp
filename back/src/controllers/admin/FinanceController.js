const mongoose = require('mongoose');
const Expense = require('../../models/expense');
const { CATEGORIES_DEPENSE, TYPES_EXPLOITATION } = require('../../models/expense');
const BudgetLine = require('../../models/budgetLine');
const ExchangeRate = require('../../models/exchangeRate');
const AuditLog = require('../../models/auditLog');
const Order = require('../../models/order');
const Partner = require('../../models/partner');
const ClotureMois = require('../../models/clotureMois');
const { LotStockFifo, FOURNISSEUR_INTERNE } = require('../../models/stock');
const { journaliser, masquerPrixVip, tauxCourant, TAUX_CONVENTION } = require('../../services/journalService');
const { ACCES } = require('../../config/roles');
const { lireCsv, lireNombre, ecrireCsv } = require('../../utils/csv');
const { ficheJustificatif, lienSigne, supprimerFichier, DUREE_LIEN_SECONDES } = require('../../services/justificatifService');
const { moisProjet, bornesMois, MOIS_CONVENTION, etatPieces, appliquerValiditeAudit, estMoisClos } = require('../../services/financeService');
const { SOURCES_FINANCEMENT, MODES_PAIEMENT_DEPENSE } = require('../../config/convention');
const { lireDate } = require('../../utils/dates');

const arrondir = (n, decimales = 0) => Math.round(n * 10 ** decimales) / 10 ** decimales;
const formatFcfa = (n) => `${Math.round(n ?? 0).toLocaleString('fr-FR').replace(/\s/g, ' ')} FCFA`;
const montantValide = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const texte = (v, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const dateFr = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { timeZone: 'Africa/Porto-Novo' }) : '');
const MESSAGE_MOIS_CLOS = (mois) => `Le mois ${mois} est clos : rouvrez-le (motif tracé) avant toute modification.`;

// Période [du, au] en dates (AAAA-MM-JJ, heure de Cotonou) ; par défaut le mois en cours
function lirePeriode(query) {
  const maintenant = new Date(Date.now() + 3600 * 1000);
  const du = /^\d{4}-\d{2}-\d{2}$/.test(query.du) ? query.du : `${maintenant.toISOString().slice(0, 7)}-01`;
  const au = /^\d{4}-\d{2}-\d{2}$/.test(query.au) ? query.au : maintenant.toISOString().slice(0, 10);
  return { du, au, debut: new Date(`${du}T00:00:00+01:00`), fin: new Date(`${au}T23:59:59.999+01:00`) };
}

function envoyerCsv(res, nom, lignes) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nom}-${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.status(200).send(ecrireCsv(lignes));
}

// ------------------------------------------------------------------
// Taux USD/FCFA
// ------------------------------------------------------------------

// GET /api/admin/finances/taux
async function obtenirTaux(req, res) {
  try {
    const historique = await ExchangeRate.find().sort({ createdAt: -1 }).limit(50).populate('creePar', 'username').lean();
    // convention : taux sur lequel la subvention Next Impact a été accordée (571), proposé comme valeur de retour
    return res.status(200).json({ courant: historique[0]?.tauxUsdFcfa ?? TAUX_CONVENTION, convention: TAUX_CONVENTION, historique });
  } catch (error) {
    console.error("Erreur obtenirTaux:", error);
    return res.status(500).json({ message: "Erreur lors du chargement du taux." });
  }
}

// POST /api/admin/finances/taux  { tauxUsdFcfa }
async function enregistrerTaux(req, res) {
  try {
    const taux = Number(req.body.tauxUsdFcfa);
    if (!Number.isFinite(taux) || taux <= 0 || taux > 10000) return res.status(400).json({ message: "Taux USD/FCFA invalide." });

    const ancien = await tauxCourant();
    const nouveau = await ExchangeRate.create({ tauxUsdFcfa: taux, creePar: req.user.id });
    await journaliser(req, {
      action: 'Modification', entite: 'Taux USD/FCFA', entiteId: nouveau._id,
      resume: `Taux USD/FCFA : ${ancien} -> ${taux}`, avant: { taux: ancien }, apres: { taux }
    });
    return res.status(201).json({ message: `Nouveau taux : 1 USD = ${taux} FCFA. Les dépenses déjà saisies gardent leur taux.`, taux: nouveau });
  } catch (error) {
    console.error("Erreur enregistrerTaux:", error);
    return res.status(500).json({ message: "Erreur lors de l'enregistrement du taux." });
  }
}

// ------------------------------------------------------------------
// Lignes budgétaires (convention Next Impact)
// ------------------------------------------------------------------

/**
 * Exécution par ligne :
 *  - engagé : dépenses payées (montant réel) + dépenses prévues non payées (montant prévu)
 *  - justifié : dépenses payées, retenues pour l'audit (toutes les pièces exigées présentes)
 *  - reste = prévu − engagé ; dépassement signalé sans blocage (D-20)
 */
async function executionLignes() {
  const [lignes, montants] = await Promise.all([
    BudgetLine.find({ deletedAt: null }).lean(),
    Expense.aggregate([
      { $match: { categorie: 'Budget', deletedAt: null } },
      {
        $group: {
          _id: '$referenceLigne',
          engageFcfa: { $sum: { $cond: ['$estEffectue', '$montantReelFcfa', { $ifNull: ['$montantPrevuFcfa', 0] }] } },
          payeFcfa: { $sum: { $cond: ['$estEffectue', '$montantReelFcfa', 0] } },
          justifieFcfa: { $sum: { $cond: [{ $and: ['$estEffectue', '$estValidePourAudit'] }, '$montantReelFcfa', 0] } },
          justifieUsd: { $sum: { $cond: [{ $and: ['$estEffectue', '$estValidePourAudit'] }, '$montantReelUsd', 0] } },
          nbDepenses: { $sum: 1 }
        }
      }
    ])
  ]);
  const parCode = new Map(montants.map(r => [r._id, r]));
  const collator = new Intl.Collator('fr', { numeric: true });
  return lignes
    .sort((a, b) => collator.compare(a.code, b.code))
    .map(l => {
      const r = parCode.get(l.code) || {};
      const engage = r.engageFcfa || 0;
      return {
        ...l,
        engageFcfa: engage,
        payeFcfa: r.payeFcfa || 0,
        justifieFcfa: r.justifieFcfa || 0,
        justifieUsd: arrondir(r.justifieUsd || 0, 2),
        resteFcfa: l.montantPrevuFcfa - engage,
        depassementFcfa: Math.max(0, engage - l.montantPrevuFcfa),
        nbDepenses: r.nbDepenses || 0,
        tauxExecution: l.montantPrevuFcfa > 0 ? arrondir((engage / l.montantPrevuFcfa) * 100, 1) : 0,
        tauxJustifie: l.montantPrevuFcfa > 0 ? arrondir(((r.justifieFcfa || 0) / l.montantPrevuFcfa) * 100, 1) : 0
      };
    });
}

// GET /api/admin/finances/lignes
async function listerLignes(req, res) {
  try {
    return res.status(200).json(await executionLignes());
  } catch (error) {
    console.error("Erreur listerLignes:", error);
    return res.status(500).json({ message: "Erreur lors du chargement du budget." });
  }
}

function lireLigne(body) {
  const categorie = body.categorieAd === '' || body.categorieAd === null || body.categorieAd === undefined ? null : Number(body.categorieAd);
  const ligne = {
    code: texte(body.code, 20),
    libelle: texte(body.libelle),
    montantPrevuUsd: Number(body.montantPrevuUsd ?? 0),
    montantPrevuFcfa: Number(body.montantPrevuFcfa ?? 0),
    categorieAd: categorie,
    passation: texte(body.passation, 120)
  };
  if (!ligne.code || !ligne.libelle) return { erreur: "Le code et le libellé de la ligne sont obligatoires." };
  if (!montantValide(ligne.montantPrevuUsd) || !montantValide(ligne.montantPrevuFcfa)) return { erreur: "Montants prévus invalides." };
  if (![1, 2, null].includes(ligne.categorieAd)) return { erreur: "Catégorie de la ligne : 1, 2 ou vide." };
  return { ligne };
}

// POST /api/admin/finances/lignes
async function creerLigne(req, res) {
  try {
    const { ligne, erreur } = lireLigne(req.body);
    if (erreur) return res.status(400).json({ message: erreur });
    if (await BudgetLine.exists({ code: ligne.code, deletedAt: null })) return res.status(400).json({ message: `La ligne ${ligne.code} existe déjà.` });

    const creee = await BudgetLine.create(ligne);
    await journaliser(req, { action: 'Création', entite: 'Ligne budgétaire', entiteId: creee._id, resume: `Ligne ${ligne.code} « ${ligne.libelle} » créée (${formatFcfa(ligne.montantPrevuFcfa)})`, apres: ligne });
    return res.status(201).json(creee);
  } catch (error) {
    console.error("Erreur creerLigne:", error);
    return res.status(500).json({ message: "Erreur lors de la création de la ligne." });
  }
}

// PUT /api/admin/finances/lignes/:id
async function modifierLigne(req, res) {
  try {
    const { ligne, erreur } = lireLigne(req.body);
    if (erreur) return res.status(400).json({ message: erreur });

    const existante = await BudgetLine.findOne({ _id: req.params.id, deletedAt: null });
    if (!existante) return res.status(404).json({ message: "Ligne introuvable." });
    if (ligne.code !== existante.code && await BudgetLine.exists({ code: ligne.code, deletedAt: null })) {
      return res.status(400).json({ message: `La ligne ${ligne.code} existe déjà.` });
    }

    const avant = existante.toObject();
    // Les dépenses rattachées suivent le changement de code et de catégorie
    if (ligne.code !== existante.code || ligne.categorieAd !== existante.categorieAd) {
      await Expense.updateMany({ categorie: 'Budget', referenceLigne: existante.code }, { $set: { referenceLigne: ligne.code, categorieAd: ligne.categorieAd } });
    }
    Object.assign(existante, ligne);
    await existante.save();
    await journaliser(req, { action: 'Modification', entite: 'Ligne budgétaire', entiteId: existante._id, resume: `Ligne ${ligne.code} modifiée`, avant, apres: ligne });
    return res.status(200).json(existante);
  } catch (error) {
    console.error("Erreur modifierLigne:", error);
    return res.status(500).json({ message: "Erreur lors de la modification de la ligne." });
  }
}

// DELETE /api/admin/finances/lignes/:id (impossible si des dépenses y sont rattachées)
async function supprimerLigne(req, res) {
  try {
    const ligne = await BudgetLine.findOne({ _id: req.params.id, deletedAt: null });
    if (!ligne) return res.status(404).json({ message: "Ligne introuvable." });
    if (await Expense.exists({ categorie: 'Budget', referenceLigne: ligne.code, deletedAt: null })) {
      return res.status(400).json({ message: "Des dépenses sont rattachées à cette ligne : supprimez-les ou déplacez-les d'abord." });
    }
    ligne.deletedAt = new Date();
    await ligne.save();
    await journaliser(req, { action: 'Suppression', entite: 'Ligne budgétaire', entiteId: ligne._id, resume: `Ligne ${ligne.code} « ${ligne.libelle} » supprimée`, avant: ligne.toObject() });
    return res.status(200).json({ message: "Ligne supprimée." });
  } catch (error) {
    console.error("Erreur supprimerLigne:", error);
    return res.status(500).json({ message: "Erreur lors de la suppression de la ligne." });
  }
}

// POST /api/admin/finances/lignes/import  { csv } : code ; libellé ; prévu USD ; prévu FCFA [; catégorie ; passation]
// Les lignes existantes (même code) sont mises à jour, les nouvelles créées.
async function importerLignes(req, res) {
  try {
    if (typeof req.body.csv !== 'string' || !req.body.csv.trim()) return res.status(400).json({ message: "Fichier CSV vide." });
    if (req.body.csv.length > 500000) return res.status(400).json({ message: "Fichier trop volumineux (500 Ko maximum)." });

    const lignesCsv = lireCsv(req.body.csv);
    // Ligne d'en-tête facultative : on la saute si sa 3e ou 4e colonne n'est pas un nombre
    const debut = lignesCsv.length && Number.isNaN(lireNombre(lignesCsv[0][2])) && Number.isNaN(lireNombre(lignesCsv[0][3])) ? 1 : 0;

    let crees = 0, misesAJour = 0;
    const erreurs = [];
    for (let i = debut; i < lignesCsv.length; i++) {
      const [code, libelle, usd, fcfa, categorieAd, passation] = lignesCsv[i];
      const { ligne, erreur } = lireLigne({ code, libelle, montantPrevuUsd: lireNombre(usd), montantPrevuFcfa: lireNombre(fcfa), categorieAd: categorieAd ?? null, passation });
      if (erreur) { erreurs.push(`Ligne ${i + 1} : ${erreur}`); continue; }
      // Colonnes facultatives absentes du fichier : la valeur en base est conservée
      if (categorieAd === undefined) delete ligne.categorieAd;
      if (passation === undefined) delete ligne.passation;
      const res = await BudgetLine.updateOne({ code: ligne.code, deletedAt: null }, { $set: ligne }, { upsert: true });
      res.upsertedCount ? crees++ : misesAJour++;
    }

    await journaliser(req, { action: 'Import', entite: 'Ligne budgétaire', resume: `Import CSV du budget : ${crees} ligne(s) créée(s), ${misesAJour} mise(s) à jour, ${erreurs.length} rejetée(s)` });
    return res.status(200).json({ message: `${crees} ligne(s) créée(s), ${misesAJour} mise(s) à jour.`, erreurs });
  } catch (error) {
    console.error("Erreur importerLignes:", error);
    return res.status(500).json({ message: "Erreur lors de l'import du budget." });
  }
}

// ------------------------------------------------------------------
// Dépenses
// ------------------------------------------------------------------

function filtreDepenses(query) {
  const filtre = { deletedAt: null };
  if (CATEGORIES_DEPENSE.includes(query.categorie)) filtre.categorie = query.categorie;
  if (typeof query.ligne === 'string' && query.ligne) filtre.referenceLigne = query.ligne;
  if (query.effectue === 'true') filtre.estEffectue = true;
  if (query.effectue === 'false') filtre.estEffectue = false;
  if (typeof query.mois === 'string' && /^M\d{1,2}$/.test(query.mois)) filtre.moisProjet = query.mois;
  // Numéro de pièce exact (facture ou reçu) : retrouve la dépense d'une facture d'achat
  if (typeof query.piece === 'string' && query.piece.trim()) filtre.numeroPiece = query.piece.trim();
  return filtre;
}

// Dépense enrichie pour l'affichage : pièces attendues et manquantes, période
function avecControles(d) {
  const periode = d.datePaiement ? moisProjet(d.datePaiement) : { mois: null, horsPeriode: false };
  return { ...d, pieces: etatPieces(d), horsPeriode: !!d.estEffectue && d.categorie === 'Budget' && periode.horsPeriode };
}

// GET /api/admin/finances/depenses?categorie&ligne&effectue&mois&piece&page&limit
async function listerDepenses(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const filtre = filtreDepenses(req.query);
    const [depenses, total, clos] = await Promise.all([
      Expense.find(filtre).populate('partenaireId', 'nom type').populate('creePar', 'username')
        .sort({ estEffectue: 1, datePaiement: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Expense.countDocuments(filtre),
      ClotureMois.find({ close: true }).distinct('mois')
    ]);
    return res.status(200).json({ depenses: depenses.map(avecControles), total, hasMore: page * limit < total, moisClos: clos });
  } catch (error) {
    console.error("Erreur listerDepenses:", error);
    return res.status(500).json({ message: "Erreur lors du chargement des dépenses." });
  }
}

// Valide et normalise une dépense saisie ; le montant USD se déduit du FCFA (ou l'inverse) avec le taux
async function lireDepense(body, taux) {
  const categorie = CATEGORIES_DEPENSE.includes(body.categorie) ? body.categorie : null;
  const libelle = texte(body.libelle);
  if (!categorie || !libelle) return { erreur: "La catégorie et le libellé sont obligatoires." };

  const depense = { categorie, libelle, tauxApplique: taux };

  if (categorie === 'Budget') {
    const code = texte(body.referenceLigne, 20);
    const ligne = code ? await BudgetLine.findOne({ code, deletedAt: null }).lean() : null;
    if (!ligne) return { erreur: "Choisissez une ligne budgétaire existante." };
    depense.referenceLigne = code;
    depense.typeExploitation = null;
    // Une dépense du budget est financée par la subvention ; sa catégorie (pièces exigées) est celle de la ligne
    depense.sourceFinancement = 'Subvention N°171';
    depense.categorieAd = ligne.categorieAd ?? null;
  } else {
    if (!TYPES_EXPLOITATION.includes(body.typeExploitation)) return { erreur: "Type de dépense d'exploitation invalide." };
    depense.typeExploitation = body.typeExploitation;
    depense.referenceLigne = '';
    depense.categorieAd = null;
    depense.sourceFinancement = SOURCES_FINANCEMENT.includes(body.sourceFinancement) ? body.sourceFinancement : '';
  }

  if (body.partenaireId) {
    if (!mongoose.isValidObjectId(body.partenaireId) || !(await Partner.exists({ _id: body.partenaireId, deletedAt: null }))) {
      return { erreur: "Prestataire introuvable." };
    }
    depense.partenaireId = body.partenaireId;
  } else depense.partenaireId = null;

  const fcfa = Number(body.montantPrevuFcfa ?? 0);
  const usd = Number(body.montantPrevuUsd ?? 0);
  if (!montantValide(fcfa) || !montantValide(usd) || (fcfa === 0 && usd === 0)) return { erreur: "Indiquez un montant prévu (FCFA ou USD)." };
  depense.montantPrevuFcfa = Math.round(fcfa || usd * taux);
  depense.montantPrevuUsd = arrondir(usd || fcfa / taux, 2);

  if (body.modePaiement !== undefined && body.modePaiement !== '' && !MODES_PAIEMENT_DEPENSE.includes(body.modePaiement)) {
    return { erreur: "Mode de paiement invalide." };
  }
  depense.modePaiement = body.modePaiement || '';
  depense.numeroPiece = texte(body.numeroPiece, 120);
  depense.numeroAutorisation = texte(body.numeroAutorisation, 60);
  depense.sousLigne = texte(body.sousLigne, 20);
  depense.detailPaiement = texte(body.detailPaiement, 60);
  depense.referencePaiement = texte(body.referencePaiement, 200);
  depense.commentaire = texte(body.commentaire, 1000);
  return { depense };
}

// POST /api/admin/finances/depenses (avec dejaPayee: true : voir creerDepensePayee)
async function creerDepense(req, res) {
  if (req.body?.dejaPayee === true) return creerDepensePayee(req, res);
  try {
    const { depense, erreur } = await lireDepense(req.body, await tauxCourant());
    if (erreur) return res.status(400).json({ message: erreur });
    if (typeof req.body.estValidePourAudit === 'boolean' && !depense.categorieAd) depense.estValidePourAudit = req.body.estValidePourAudit;
    if (depense.categorieAd) depense.estValidePourAudit = false; // Validée d'office une fois payée et ses pièces complètes

    const creee = await Expense.create({ ...depense, creePar: req.user.id });
    await journaliser(req, { action: 'Création', entite: 'Dépense', entiteId: creee._id, resume: `Dépense « ${creee.libelle} » prévue : ${formatFcfa(creee.montantPrevuFcfa)}`, apres: depense });
    return res.status(201).json(creee);
  } catch (error) {
    console.error("Erreur creerDepense:", error);
    return res.status(500).json({ message: "Erreur lors de la création de la dépense." });
  }
}

// POST /api/admin/finances/depenses { …dépense, dejaPayee: true, datePaiement, montantReelFcfa, modePaiement, fichiersAttendus }
// Admin seulement : facture déjà payée, saisie depuis une fiche facture. Comme pour l'import de 08_depenses, la dépense
// est effectuée sans justificatif joint : hors audit tant que les pièces attendues (fichiersAttendus) manquent.
// Montant prévu : celui fourni, sinon le montant payé.
async function creerDepensePayee(req, res) {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: "Seul l'admin saisit une dépense déjà payée." });
    const body = req.body;

    const datePaiement = lireDate(body.datePaiement);
    if (!datePaiement) return res.status(400).json({ message: "Indiquez la date de paiement (AAAA-MM-JJ)." });
    // Montant payé : nombre (ou texte numérique) fini, contrôlé APRÈS l'arrondi au franc (0,4 FCFA donnerait 0)
    const saisi = typeof body.montantReelFcfa === 'number' || (typeof body.montantReelFcfa === 'string' && body.montantReelFcfa.trim() !== '')
      ? Number(body.montantReelFcfa) : NaN;
    const reel = Number.isFinite(saisi) ? Math.round(saisi) : NaN;
    if (!(reel > 0)) return res.status(400).json({ message: "Indiquez le montant payé en FCFA (1 FCFA au moins, arrondi au franc)." });
    if (!MODES_PAIEMENT_DEPENSE.includes(body.modePaiement)) return res.status(400).json({ message: "Mode de paiement invalide." });
    const fichiers = (Array.isArray(body.fichiersAttendus) ? body.fichiersAttendus : [body.fichiersAttendus])
      .map(f => texte(f, 200)).filter(Boolean).slice(0, 20);
    if (!fichiers.length) return res.status(400).json({ message: "Indiquez au moins un nom de fichier justificatif attendu (fichiersAttendus)." });

    const taux = await tauxCourant();
    const prevuFourni = [body.montantPrevuFcfa, body.montantPrevuUsd].some(v => v !== undefined && v !== null && v !== '' && v !== 0);
    const { depense, erreur } = await lireDepense(prevuFourni ? body : { ...body, montantPrevuFcfa: reel, montantPrevuUsd: 0 }, taux);
    if (erreur) return res.status(400).json({ message: erreur });
    if (!(depense.montantPrevuFcfa > 0)) return res.status(400).json({ message: "Montant prévu invalide (1 FCFA au moins, arrondi au franc)." });

    const periode = moisProjet(datePaiement);
    if (await estMoisClos(periode.mois)) return res.status(400).json({ message: MESSAGE_MOIS_CLOS(periode.mois) });
    // Une seule dépense par pièce (Q 6.3)
    if (depense.numeroPiece) {
      const existante = await Expense.findOne({ numeroPiece: depense.numeroPiece, deletedAt: null }).select('libelle').lean();
      if (existante) return res.status(409).json({ message: `La pièce ${depense.numeroPiece} est déjà saisie (dépense « ${existante.libelle} »).` });
    }

    Object.assign(depense, {
      estEffectue: true,
      datePaiement,
      moisProjet: periode.mois || '',
      montantReelFcfa: reel,
      montantReelUsd: arrondir(reel / taux, 2),
      estValidePourAudit: false, // Aucun justificatif joint : se coche quand les pièces exigées sont complètes
      fichiersAttendus: fichiers
    });
    const creee = await Expense.create({ ...depense, creePar: req.user.id });
    await journaliser(req, {
      action: 'Création', entite: 'Dépense', entiteId: creee._id,
      resume: `Dépense « ${creee.libelle} » saisie payée depuis une fiche facture (pièce attendue : ${fichiers.join(', ')}) : ${formatFcfa(creee.montantReelFcfa)}${creee.moisProjet ? `, ${creee.moisProjet}` : ''}${creee.numeroPiece ? `, pièce ${creee.numeroPiece}` : ''}`,
      apres: depense
    });
    const alerte = creee.categorie === 'Budget' && periode.horsPeriode ? ' Attention : paiement daté hors de la période de la convention.' : '';
    return res.status(201).json({ ...creee.toObject(), message: `Dépense enregistrée comme payée, hors audit jusqu'au dépôt des justificatifs.${alerte}` });
  } catch (error) {
    console.error("Erreur creerDepensePayee:", error);
    return res.status(500).json({ message: "Erreur lors de la création de la dépense." });
  }
}

// PUT /api/admin/finances/depenses/:id (une dépense effectuée n'est plus modifiable : traçabilité de l'audit)
async function modifierDepense(req, res) {
  try {
    const existante = await Expense.findOne({ _id: req.params.id, deletedAt: null });
    if (!existante) return res.status(404).json({ message: "Dépense introuvable." });
    if (existante.estEffectue) return res.status(400).json({ message: "Une dépense effectuée ne se modifie plus. Seule sa validité pour l'audit peut changer." });
    if (await estMoisClos(existante.moisProjet)) return res.status(400).json({ message: MESSAGE_MOIS_CLOS(existante.moisProjet) });

    // Le taux reste celui de la création de la dépense
    const { depense, erreur } = await lireDepense({ ...req.body, categorie: req.body.categorie ?? existante.categorie }, existante.tauxApplique);
    if (erreur) return res.status(400).json({ message: erreur });

    const avant = existante.toObject();
    Object.assign(existante, depense);
    appliquerValiditeAudit(existante);
    await existante.save();
    await journaliser(req, { action: 'Modification', entite: 'Dépense', entiteId: existante._id, resume: `Dépense « ${existante.libelle} » modifiée`, avant, apres: depense });
    return res.status(200).json(existante);
  } catch (error) {
    console.error("Erreur modifierDepense:", error);
    return res.status(500).json({ message: "Erreur lors de la modification de la dépense." });
  }
}

// PATCH /api/admin/finances/depenses/:id/audit  { estValidePourAudit }
// Dépense de la convention : retenue seulement quand toutes les pièces exigées sont présentes ; on peut toujours l'exclure.
async function changerValiditeAudit(req, res) {
  try {
    if (typeof req.body.estValidePourAudit !== 'boolean') return res.status(400).json({ message: "Valeur invalide." });
    const depense = await Expense.findOne({ _id: req.params.id, deletedAt: null });
    if (!depense) return res.status(404).json({ message: "Dépense introuvable." });
    if (await estMoisClos(depense.moisProjet)) return res.status(400).json({ message: MESSAGE_MOIS_CLOS(depense.moisProjet) });

    if (req.body.estValidePourAudit && depense.categorieAd) {
      const { manquantes } = etatPieces(depense);
      if (!depense.estEffectue) return res.status(400).json({ message: "Une dépense non payée n'entre pas dans l'audit." });
      if (manquantes.length) return res.status(400).json({ message: `Pièces manquantes : ${manquantes.join(', ')}.` });
    }
    depense.estValidePourAudit = req.body.estValidePourAudit;
    await depense.save();
    await journaliser(req, { action: 'Modification', entite: 'Dépense', entiteId: depense._id, resume: `Dépense « ${depense.libelle} » ${depense.estValidePourAudit ? 'incluse dans' : 'exclue de'} l'audit` });
    return res.status(200).json(depense);
  } catch (error) {
    console.error("Erreur changerValiditeAudit:", error);
    return res.status(500).json({ message: "Erreur lors de la mise à jour." });
  }
}

// PATCH /api/admin/finances/depenses/:id/effectuer  { montantReelFcfa | montantReelUsd, datePaiement, modePaiement, referencePaiement }
// (au moins un justificatif joint)
async function effectuerDepense(req, res) {
  try {
    const depense = await Expense.findOne({ _id: req.params.id, deletedAt: null });
    if (!depense) return res.status(404).json({ message: "Dépense introuvable." });
    if (depense.estEffectue) return res.status(400).json({ message: "Cette dépense est déjà effectuée." });

    // Au moins un justificatif, joint à la dépense en stockage privé
    if (!depense.justificatifs?.length) {
      return res.status(400).json({ message: "Joignez au moins un justificatif (PDF ou image) avant de marquer la dépense effectuée." });
    }

    const fcfa = Number(req.body.montantReelFcfa ?? 0);
    const usd = Number(req.body.montantReelUsd ?? 0);
    if (!montantValide(fcfa) || !montantValide(usd) || (fcfa === 0 && usd === 0)) return res.status(400).json({ message: "Indiquez le montant réellement payé." });

    const datePaiement = req.body.datePaiement ? new Date(req.body.datePaiement) : new Date();
    if (Number.isNaN(datePaiement.getTime())) return res.status(400).json({ message: "Date de paiement invalide." });
    if (req.body.modePaiement && !MODES_PAIEMENT_DEPENSE.includes(req.body.modePaiement)) return res.status(400).json({ message: "Mode de paiement invalide." });

    const periode = moisProjet(datePaiement);
    if (await estMoisClos(periode.mois)) return res.status(400).json({ message: MESSAGE_MOIS_CLOS(periode.mois) });

    depense.montantReelFcfa = Math.round(fcfa || usd * depense.tauxApplique);
    depense.montantReelUsd = arrondir(usd || fcfa / depense.tauxApplique, 2);
    depense.datePaiement = datePaiement;
    depense.moisProjet = periode.mois || '';
    if (req.body.modePaiement) depense.modePaiement = req.body.modePaiement;
    if (req.body.referencePaiement !== undefined) depense.referencePaiement = texte(req.body.referencePaiement, 200);
    depense.estEffectue = true;
    appliquerValiditeAudit(depense);
    await depense.save();

    await journaliser(req, {
      action: 'Validation', entite: 'Dépense', entiteId: depense._id,
      resume: `Dépense « ${depense.libelle} » effectuée : ${formatFcfa(depense.montantReelFcfa)} (prévu ${formatFcfa(depense.montantPrevuFcfa)})${depense.moisProjet ? `, ${depense.moisProjet}` : ''}`,
      apres: { montantReelFcfa: depense.montantReelFcfa, montantReelUsd: depense.montantReelUsd, datePaiement, justificatifs: depense.justificatifs.length }
    });
    const alerte = depense.categorie === 'Budget' && periode.horsPeriode ? ' Attention : paiement daté hors de la période de la convention.' : '';
    return res.status(200).json({ ...depense.toObject(), message: `Dépense marquée effectuée.${alerte}` });
  } catch (error) {
    console.error("Erreur effectuerDepense:", error);
    return res.status(500).json({ message: "Erreur lors de la validation de la dépense." });
  }
}

// DELETE /api/admin/finances/depenses/:id (une dépense effectuée reste : on l'exclut de l'audit si besoin)
async function supprimerDepense(req, res) {
  try {
    const depense = await Expense.findOne({ _id: req.params.id, deletedAt: null });
    if (!depense) return res.status(404).json({ message: "Dépense introuvable." });
    if (depense.estEffectue) return res.status(400).json({ message: "Une dépense effectuée ne se supprime pas : excluez-la de l'audit si nécessaire." });

    depense.deletedAt = new Date();
    await depense.save();
    await journaliser(req, { action: 'Suppression', entite: 'Dépense', entiteId: depense._id, resume: `Dépense prévue « ${depense.libelle} » supprimée (${formatFcfa(depense.montantPrevuFcfa)})`, avant: depense.toObject() });
    return res.status(200).json({ message: "Dépense supprimée." });
  } catch (error) {
    console.error("Erreur supprimerDepense:", error);
    return res.status(500).json({ message: "Erreur lors de la suppression de la dépense." });
  }
}

// POST /api/admin/finances/depenses/:id/justificatifs (multipart : « fichier », « typePiece ») : stockage privé
async function ajouterJustificatif(req, res) {
  try {
    if (!req.file) return res.status(400).json({ message: "Aucun fichier reçu (PDF, JPG ou PNG, 10 Mo maximum)." });
    const depense = await Expense.findOne({ _id: req.params.id, deletedAt: null });
    const refus = !depense ? [404, "Dépense introuvable."]
      : await estMoisClos(depense.moisProjet) ? [400, MESSAGE_MOIS_CLOS(depense.moisProjet)] : null;
    if (refus) {
      await supprimerFichier({ publicId: req.file.filename }).catch(() => {});
      return res.status(refus[0]).json({ message: refus[1] });
    }
    const fiche = ficheJustificatif(req.file, req.body?.typePiece, req.user.id);
    depense.justificatifs.push(fiche);
    const avant = depense.estValidePourAudit;
    appliquerValiditeAudit(depense);
    await depense.save();
    await journaliser(req, { action: 'Modification', entite: 'Dépense', entiteId: depense._id, resume: `Justificatif ajouté à « ${depense.libelle} »${fiche.typePiece ? ` (${fiche.typePiece})` : ''}${!avant && depense.estValidePourAudit ? ' : pièces complètes, dépense retenue pour l\'audit' : ''}` });
    return res.status(201).json(depense.justificatifs[depense.justificatifs.length - 1]);
  } catch (error) {
    console.error("Erreur ajouterJustificatif:", error);
    return res.status(500).json({ message: "Erreur lors de l'ajout du justificatif." });
  }
}

// GET /api/admin/finances/depenses/:id/justificatifs/:jid/lien : lien signé, valable 5 minutes
async function lienJustificatif(req, res) {
  try {
    const depense = await Expense.findOne({ _id: req.params.id, deletedAt: null }).select('justificatifs');
    const justificatif = depense?.justificatifs.id(req.params.jid);
    if (!justificatif) return res.status(404).json({ message: "Justificatif introuvable." });
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({ url: lienSigne(justificatif), expireDans: DUREE_LIEN_SECONDES });
  } catch (error) {
    console.error("Erreur lienJustificatif:", error);
    return res.status(500).json({ message: "Erreur lors de la création du lien." });
  }
}

// DELETE /api/admin/finances/depenses/:id/justificatifs/:jid (une dépense effectuée garde au moins une pièce)
async function supprimerJustificatif(req, res) {
  try {
    const depense = await Expense.findOne({ _id: req.params.id, deletedAt: null });
    const justificatif = depense?.justificatifs.id(req.params.jid);
    if (!justificatif) return res.status(404).json({ message: "Justificatif introuvable." });
    if (await estMoisClos(depense.moisProjet)) return res.status(400).json({ message: MESSAGE_MOIS_CLOS(depense.moisProjet) });
    if (depense.estEffectue && depense.justificatifs.length === 1) {
      return res.status(400).json({ message: "Une dépense effectuée garde au moins un justificatif." });
    }
    await supprimerFichier(justificatif);
    justificatif.deleteOne();
    appliquerValiditeAudit(depense);
    await depense.save();
    await journaliser(req, { action: 'Suppression', entite: 'Dépense', entiteId: depense._id, resume: `Justificatif retiré de « ${depense.libelle} »` });
    return res.status(200).json({ message: "Justificatif supprimé." });
  } catch (error) {
    console.error("Erreur supprimerJustificatif:", error);
    return res.status(500).json({ message: "Erreur lors de la suppression du justificatif." });
  }
}

// ------------------------------------------------------------------
// Exports CSV (Excel, séparateur « ; ») : dépenses (par mois du projet) et registres obligatoires
// ------------------------------------------------------------------

const nombreCsv = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','));
const libelleCategorie = (d) => (d.categorie === 'Budget' ? `${d.referenceLigne}${d.sousLigne && d.sousLigne !== d.referenceLigne ? ` (${d.sousLigne})` : ''}` : d.typeExploitation || '');

// GET /api/admin/finances/depenses/export?mois=M4
async function exporterDepenses(req, res) {
  try {
    const depenses = await Expense.find(filtreDepenses(req.query)).populate('partenaireId', 'nom').sort({ referenceLigne: 1, datePaiement: 1, createdAt: 1 }).lean();
    const lignes = [[
      'Catégorie', 'Ligne', 'Sous-ligne', 'Type', 'Libellé', 'Prestataire', 'Prévu FCFA', 'Prévu USD', 'Réel FCFA', 'Réel USD',
      'Taux', 'Effectuée', 'Date de paiement', 'Mois', 'Mode de paiement', 'Référence de paiement', 'N° de pièce', 'N° d\'autorisation',
      'Source', 'Catégorie AD', 'Valide audit', 'Justificatifs', 'Pièces manquantes', 'Commentaire'
    ]];
    for (const d of depenses) {
      const { manquantes } = etatPieces(d);
      lignes.push([
        d.categorie, d.referenceLigne, d.sousLigne || '', d.typeExploitation || '', d.libelle, d.partenaireId?.nom || '',
        nombreCsv(d.montantPrevuFcfa), nombreCsv(d.montantPrevuUsd), d.estEffectue ? nombreCsv(d.montantReelFcfa) : '', d.estEffectue ? nombreCsv(d.montantReelUsd) : '',
        d.tauxApplique, d.estEffectue ? 'Oui' : 'Non', dateFr(d.datePaiement), d.moisProjet || '',
        [d.modePaiement, d.detailPaiement].filter(Boolean).join(' '), d.referencePaiement || '', d.numeroPiece || '', d.numeroAutorisation || '',
        d.sourceFinancement || '', d.categorieAd || '', d.estValidePourAudit ? 'Oui' : 'Non', `${d.justificatifs?.length || 0} pièce(s)`,
        [manquantes.join(', '), d.piecesManquantes].filter(Boolean).join(' ; '), d.commentaire || ''
      ]);
    }
    return envoyerCsv(res, `depenses-ahitche${req.query.mois ? `-${req.query.mois}` : ''}`, lignes);
  } catch (error) {
    console.error("Erreur exporterDepenses:", error);
    return res.status(500).json({ message: "Erreur lors de l'export des dépenses." });
  }
}

// Période d'un registre : un mois du projet (?mois=M4), sinon tout
function periodeRegistre(query) {
  return /^M\d{1,2}$/.test(query.mois || '') ? bornesMois(query.mois) : null;
}

// GET /api/admin/finances/registres/caisse?mois= : opérations en espèces, dans l'ordre, numérotées, reliées aux pièces
// Sorties : dépenses payées en espèces ; entrées : commandes livrées payées en espèces (D-06)
async function exporterLivreCaisse(req, res) {
  try {
    const periode = periodeRegistre(req.query);
    const dates = periode ? { $gte: periode.debut, $lte: periode.fin } : { $ne: null };
    const [depenses, commandes] = await Promise.all([
      Expense.find({ deletedAt: null, estEffectue: true, modePaiement: 'Espèces', datePaiement: dates }).populate('partenaireId', 'nom').lean(),
      Order.find({ statut: 'Livrée', modePaiement: 'Espèces', 'paiement.statut': 'Payé', $or: [{ 'paiement.date': dates }, { 'paiement.date': null, dateLivraison: dates }] }).lean()
    ]);
    const operations = [
      ...depenses.map(d => ({ date: d.datePaiement, libelle: `${d.libelle}${d.partenaireId ? ` (${d.partenaireId.nom})` : ''}`, piece: d.numeroPiece || '', imputation: libelleCategorie(d), entree: '', sortie: d.montantReelFcfa })),
      ...commandes.map(o => ({ date: o.paiement?.date || o.dateLivraison, libelle: `Encaissement de la commande ${o.reference}${o.paiement?.note ? ` : ${o.paiement.note}` : ''}`, piece: o.reference, imputation: 'Ventes', entree: o.total, sortie: '' }))
    ].sort((a, b) => new Date(a.date) - new Date(b.date));

    const lignes = [['N°', 'Date', 'Libellé', 'Pièce', 'Imputation', 'Entrée FCFA', 'Sortie FCFA']];
    operations.forEach((o, i) => lignes.push([i + 1, dateFr(o.date), o.libelle, o.piece, o.imputation, o.entree, o.sortie]));
    lignes.push(['', '', 'Total de la période', '', '', operations.reduce((s, o) => s + (o.entree || 0), 0), operations.reduce((s, o) => s + (o.sortie || 0), 0)]);
    return envoyerCsv(res, `livre-de-caisse${req.query.mois ? `-${req.query.mois}` : ''}`, lignes);
  } catch (error) {
    console.error("Erreur exporterLivreCaisse:", error);
    return res.status(500).json({ message: "Erreur lors de l'export du livre de caisse." });
  }
}

// GET /api/admin/finances/registres/factures?mois= : date, fournisseur, nature, catégorie, montant, références de paiement
async function exporterRegistreFactures(req, res) {
  try {
    const periode = periodeRegistre(req.query);
    const filtre = { deletedAt: null, estEffectue: true, ...(periode ? { datePaiement: { $gte: periode.debut, $lte: periode.fin } } : {}) };
    const depenses = await Expense.find(filtre).populate('partenaireId', 'nom').sort({ datePaiement: 1 }).lean();
    const lignes = [['Date', 'N° de pièce', 'Fournisseur', 'Nature', 'Ligne ou type', 'Catégorie AD', 'Montant FCFA', 'Mode de paiement', 'Référence de paiement', 'Mois', 'Source']];
    for (const d of depenses) {
      lignes.push([dateFr(d.datePaiement), d.numeroPiece || '', d.partenaireId?.nom || '', d.libelle, libelleCategorie(d), d.categorieAd || '',
        d.montantReelFcfa, [d.modePaiement, d.detailPaiement].filter(Boolean).join(' '), d.referencePaiement || '', d.moisProjet || '', d.sourceFinancement || '']);
    }
    return envoyerCsv(res, `registre-des-factures${req.query.mois ? `-${req.query.mois}` : ''}`, lignes);
  } catch (error) {
    console.error("Erreur exporterRegistreFactures:", error);
    return res.status(500).json({ message: "Erreur lors de l'export du registre des factures." });
  }
}

// GET /api/admin/finances/registres/achats?mois= : livraisons de stock, avec colonnes de signature
async function exporterRegistreAchats(req, res) {
  try {
    const periode = periodeRegistre(req.query);
    const filtre = { deletedAt: null, fournisseur: { $ne: FOURNISSEUR_INTERNE }, ...(periode ? { dateReception: { $gte: periode.debut, $lte: periode.fin } } : {}) };
    const lots = await LotStockFifo.find(filtre).populate('product', 'name unit reference').sort({ dateReception: 1, numeroLot: 1 }).lean();
    const lignes = [['Date de livraison', 'Désignation', 'Quantité', 'Unité', 'Conditionnement', 'Fournisseur', 'Référence de la facture', 'N° de lot', 'Signature du fournisseur', 'Signature du réceptionnaire']];
    for (const l of lots) {
      lignes.push([dateFr(l.dateReception), [l.product?.reference, l.product?.name].filter(Boolean).join(' · '),
        l.quantiteInitiale === null ? 'à compter' : nombreCsv(l.quantiteInitiale), l.product?.unit || '', l.conditionnement || '',
        l.fournisseur, l.numeroPiece || '', l.numeroLot, '', '']);
    }
    return envoyerCsv(res, `registre-des-achats${req.query.mois ? `-${req.query.mois}` : ''}`, lignes);
  } catch (error) {
    console.error("Erreur exporterRegistreAchats:", error);
    return res.status(500).json({ message: "Erreur lors de l'export du registre des achats." });
  }
}

// ------------------------------------------------------------------
// Clôture mensuelle (mois du projet, du 26 au 25)
// ------------------------------------------------------------------

// GET /api/admin/finances/clotures
async function listerClotures(req, res) {
  try {
    const clotures = new Map((await ClotureMois.find().populate('historique.par', 'username').lean()).map(c => [c.mois, c]));
    const engages = new Map((await Expense.aggregate([
      { $match: { deletedAt: null, categorie: 'Budget', estEffectue: true } },
      { $group: { _id: '$moisProjet', fcfa: { $sum: '$montantReelFcfa' }, nb: { $sum: 1 } } }
    ])).map(e => [e._id, e]));
    return res.status(200).json(MOIS_CONVENTION.map(mois => {
      const { du, au } = bornesMois(mois);
      const c = clotures.get(mois);
      return { mois, du, au, close: !!c?.close, historique: c?.historique || [], engageFcfa: engages.get(mois)?.fcfa || 0, nbDepenses: engages.get(mois)?.nb || 0 };
    }));
  } catch (error) {
    console.error("Erreur listerClotures:", error);
    return res.status(500).json({ message: "Erreur lors du chargement des clôtures." });
  }
}

// POST /api/admin/finances/clotures/:mois  { action: 'cloturer' | 'rouvrir', motif }
// Clôture : admin ou comptable ; réouverture : admin seulement, motif obligatoire
async function changerCloture(req, res) {
  try {
    const { mois } = req.params;
    const { action } = req.body;
    const motif = texte(req.body.motif, 500);
    if (!bornesMois(mois)) return res.status(400).json({ message: "Mois du projet invalide." });
    if (!['cloturer', 'rouvrir'].includes(action)) return res.status(400).json({ message: "Action invalide." });
    if (action === 'rouvrir' && req.user.role !== 'admin') return res.status(403).json({ message: "Seul l'admin rouvre un mois clos." });
    if (action === 'rouvrir' && motif.length < 3) return res.status(400).json({ message: "Indiquez le motif de la réouverture." });

    const cloture = await ClotureMois.findOne({ mois }) || new ClotureMois({ mois });
    if (action === 'cloturer' && cloture.close) return res.status(400).json({ message: `Le mois ${mois} est déjà clos.` });
    if (action === 'rouvrir' && !cloture.close) return res.status(400).json({ message: `Le mois ${mois} n'est pas clos.` });
    cloture.close = action === 'cloturer';
    cloture.historique.push({ action: action === 'cloturer' ? 'Clôture' : 'Réouverture', par: req.user.id, motif });
    await cloture.save();
    await journaliser(req, { action: action === 'cloturer' ? 'Validation' : 'Modification', entite: 'Clôture mensuelle', entiteId: cloture._id, resume: `${mois} ${action === 'cloturer' ? 'clos' : `rouvert : ${motif}`}` });
    return res.status(200).json({ message: action === 'cloturer' ? `Mois ${mois} clos.` : `Mois ${mois} rouvert.` });
  } catch (error) {
    console.error("Erreur changerCloture:", error);
    return res.status(500).json({ message: "Erreur lors de la clôture." });
  }
}

// ------------------------------------------------------------------
// Synthèse et journal
// ------------------------------------------------------------------

// GET /api/admin/finances/synthese?du=AAAA-MM-JJ&au=AAAA-MM-JJ
async function obtenirSynthese(req, res) {
  try {
    const { du, au, debut, fin } = lirePeriode(req.query);

    const [encaissements, depensesExploitation, lignes, parMois, horsPeriode] = await Promise.all([
      Order.aggregate([
        { $match: { statut: 'Livrée', dateLivraison: { $gte: debut, $lte: fin } } },
        { $group: { _id: '$modePaiement', total: { $sum: '$total' }, nombre: { $sum: 1 }, livraison: { $sum: '$coutLivraison' } } }
      ]),
      Expense.aggregate([
        { $match: { categorie: 'Exploitation', deletedAt: null, $or: [{ datePaiement: { $gte: debut, $lte: fin } }, { estEffectue: false, createdAt: { $gte: debut, $lte: fin } }] } },
        { $group: { _id: { type: '$typeExploitation', effectue: '$estEffectue' }, prevu: { $sum: { $ifNull: ['$montantPrevuFcfa', 0] } }, reel: { $sum: '$montantReelFcfa' }, nombre: { $sum: 1 } } }
      ]),
      executionLignes(),
      Expense.aggregate([
        { $match: { categorie: 'Budget', deletedAt: null, estEffectue: true } },
        { $group: { _id: '$moisProjet', engageFcfa: { $sum: '$montantReelFcfa' } } }
      ]),
      Expense.find({ categorie: 'Budget', deletedAt: null, estEffectue: true }).select('libelle datePaiement montantReelFcfa referenceLigne').lean()
    ]);

    const totalEncaisse = encaissements.reduce((s, e) => s + e.total, 0);
    const coutLivraison = encaissements.reduce((s, e) => s + e.livraison, 0);
    const parType = Object.fromEntries(TYPES_EXPLOITATION.map(t => [t, { paye: 0, aPayer: 0 }]));
    for (const d of depensesExploitation) {
      const cible = parType[d._id.type] || parType['Autre'];
      if (d._id.effectue) cible.paye += d.reel; else cible.aPayer += d.prevu;
    }
    const achats = parType['Achat stock'].paye + parType['Achat stock'].aPayer;
    const autres = ['Livraison', 'Compensation', 'Autre'].reduce((s, t) => s + parType[t].paye + parType[t].aPayer, 0);

    // Budget de la convention : prévu, engagé, justifié, solde
    const somme = (cle) => lignes.reduce((s, l) => s + (l[cle] || 0), 0);
    const prevuFcfa = somme('montantPrevuFcfa');
    const engageFcfa = somme('engageFcfa');
    const engageParMois = new Map(parMois.map(m => [m._id || '', m.engageFcfa]));

    // Alertes sans blocage (D-20) : dépassements de ligne, paiements hors de la période de la convention
    const alertes = [
      ...lignes.filter(l => l.depassementFcfa > 0).map(l => ({ type: 'depassement', ligne: l.code, montantFcfa: l.depassementFcfa, message: `Ligne ${l.code} dépassée de ${formatFcfa(l.depassementFcfa)}` })),
      ...horsPeriode.filter(d => moisProjet(d.datePaiement).horsPeriode).map(d => ({ type: 'horsPeriode', ligne: d.referenceLigne, montantFcfa: d.montantReelFcfa, message: `« ${d.libelle} » payée le ${dateFr(d.datePaiement)}, hors de la période de la convention` }))
    ];

    return res.status(200).json({
      periode: { du, au },
      exploitation: {
        encaissements: { total: totalEncaisse, nombreLivraisons: encaissements.reduce((s, e) => s + e.nombre, 0), parMode: encaissements.map(e => ({ mode: e._id, total: e.total, nombre: e.nombre })) },
        coutLivraison,
        depenses: parType,
        // Marge = encaissé - achats engagés - coût des courses - autres dépenses de la période
        marge: totalEncaisse - achats - coutLivraison - autres
      },
      budget: {
        prevuFcfa,
        prevuUsd: somme('montantPrevuUsd'),
        engageFcfa,
        justifieFcfa: somme('justifieFcfa'),
        justifieUsd: arrondir(somme('justifieUsd'), 2),
        soldeFcfa: prevuFcfa - engageFcfa,
        absorption: prevuFcfa ? arrondir((engageFcfa / prevuFcfa) * 100, 1) : 0,
        parMois: [...MOIS_CONVENTION, ...[...engageParMois.keys()].filter(m => m && !MOIS_CONVENTION.includes(m))].map(m => ({ mois: m, engageFcfa: engageParMois.get(m) || 0 })),
        sansMois: engageParMois.get('') || 0,
        alertes
      },
      taux: await tauxCourant()
    });
  } catch (error) {
    console.error("Erreur obtenirSynthese:", error);
    return res.status(500).json({ message: "Erreur lors du calcul de la synthèse." });
  }
}

// GET /api/admin/finances/journal?page
// Prix VIP masqués pour les rôles hors de la section « vip » (comptable, auditeur) ; journal complet pour l'admin
// et le coordinateur
async function obtenirJournal(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 30;
    const [entrees, total] = await Promise.all([
      AuditLog.find().populate('utilisateur', 'username').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments()
    ]);
    const voitPrixVip = ACCES.vip.lecture.includes(req.user.role);
    return res.status(200).json({ entrees: voitPrixVip ? entrees : entrees.map(masquerPrixVip), total, hasMore: page * limit < total });
  } catch (error) {
    console.error("Erreur obtenirJournal:", error);
    return res.status(500).json({ message: "Erreur lors du chargement du journal." });
  }
}

module.exports = {
  obtenirTaux, enregistrerTaux,
  listerLignes, creerLigne, modifierLigne, supprimerLigne, importerLignes,
  listerDepenses, creerDepense, modifierDepense, changerValiditeAudit, effectuerDepense, supprimerDepense,
  ajouterJustificatif, lienJustificatif, supprimerJustificatif, exporterDepenses,
  exporterLivreCaisse, exporterRegistreFactures, exporterRegistreAchats,
  listerClotures, changerCloture,
  obtenirSynthese, obtenirJournal, executionLignes
};
