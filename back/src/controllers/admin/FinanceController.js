const mongoose = require('mongoose');
const Expense = require('../../models/expense');
const { CATEGORIES_DEPENSE, TYPES_EXPLOITATION } = require('../../models/expense');
const BudgetLine = require('../../models/budgetLine');
const ExchangeRate = require('../../models/exchangeRate');
const AuditLog = require('../../models/auditLog');
const Order = require('../../models/order');
const Partner = require('../../models/partner');
const { journaliser, tauxCourant, TAUX_CONVENTION } = require('../../services/journalService');
const { lireCsv, lireNombre, ecrireCsv } = require('../../utils/csv');
const { ficheJustificatif, lienSigne, supprimerFichier, DUREE_LIEN_SECONDES } = require('../../services/justificatifService');

const arrondir = (n, decimales = 0) => Math.round(n * 10 ** decimales) / 10 ** decimales;
const formatFcfa = (n) => `${Math.round(n).toLocaleString('fr-FR').replace(/\s/g, ' ')} FCFA`;
const montantValide = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;

// Période [du, au] en dates (AAAA-MM-JJ, heure de Cotonou) ; par défaut le mois en cours
function lirePeriode(query) {
  const maintenant = new Date(Date.now() + 3600 * 1000);
  const du = /^\d{4}-\d{2}-\d{2}$/.test(query.du) ? query.du : `${maintenant.toISOString().slice(0, 7)}-01`;
  const au = /^\d{4}-\d{2}-\d{2}$/.test(query.au) ? query.au : maintenant.toISOString().slice(0, 10);
  return { du, au, debut: new Date(`${du}T00:00:00+01:00`), fin: new Date(`${au}T23:59:59.999+01:00`) };
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

// GET /api/admin/finances/lignes : lignes avec prévu et réalisé (dépenses effectuées et valides pour l'audit)
async function listerLignes(req, res) {
  try {
    const [lignes, realise] = await Promise.all([
      BudgetLine.find({ deletedAt: null }).lean(),
      Expense.aggregate([
        { $match: { categorie: 'Budget', deletedAt: null } },
        {
          $group: {
            _id: '$referenceLigne',
            engageFcfa: { $sum: '$montantPrevuFcfa' },
            // Réalisé = dépenses effectuées ET retenues pour l'audit (même règle que la synthèse)
            reelFcfa: { $sum: { $cond: [{ $and: ['$estEffectue', '$estValidePourAudit'] }, '$montantReelFcfa', 0] } },
            reelUsd: { $sum: { $cond: [{ $and: ['$estEffectue', '$estValidePourAudit'] }, '$montantReelUsd', 0] } },
            nbDepenses: { $sum: 1 }
          }
        }
      ])
    ]);
    const parCode = new Map(realise.map(r => [r._id, r]));
    const collator = new Intl.Collator('fr', { numeric: true });

    const resultat = lignes
      .sort((a, b) => collator.compare(a.code, b.code))
      .map(l => {
        const r = parCode.get(l.code) || {};
        return {
          ...l,
          engageFcfa: r.engageFcfa || 0,
          reelFcfa: r.reelFcfa || 0,
          reelUsd: arrondir(r.reelUsd || 0, 2),
          nbDepenses: r.nbDepenses || 0,
          tauxExecution: l.montantPrevuFcfa > 0 ? arrondir(((r.reelFcfa || 0) / l.montantPrevuFcfa) * 100, 1) : 0
        };
      });
    return res.status(200).json(resultat);
  } catch (error) {
    console.error("Erreur listerLignes:", error);
    return res.status(500).json({ message: "Erreur lors du chargement du budget." });
  }
}

function lireLigne(body) {
  const ligne = {
    code: typeof body.code === 'string' ? body.code.trim() : '',
    libelle: typeof body.libelle === 'string' ? body.libelle.trim() : '',
    montantPrevuUsd: Number(body.montantPrevuUsd ?? 0),
    montantPrevuFcfa: Number(body.montantPrevuFcfa ?? 0)
  };
  if (!ligne.code || !ligne.libelle) return { erreur: "Le code et le libellé de la ligne sont obligatoires." };
  if (!montantValide(ligne.montantPrevuUsd) || !montantValide(ligne.montantPrevuFcfa)) return { erreur: "Montants prévus invalides." };
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
    // Les dépenses rattachées suivent le changement de code
    if (ligne.code !== existante.code) {
      await Expense.updateMany({ categorie: 'Budget', referenceLigne: existante.code }, { $set: { referenceLigne: ligne.code } });
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

// POST /api/admin/finances/lignes/import  { csv } : colonnes code ; libellé ; prévu USD ; prévu FCFA
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
      const [code, libelle, usd, fcfa] = lignesCsv[i];
      const { ligne, erreur } = lireLigne({ code, libelle, montantPrevuUsd: lireNombre(usd), montantPrevuFcfa: lireNombre(fcfa) });
      if (erreur) { erreurs.push(`Ligne ${i + 1} : ${erreur}`); continue; }
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
  return filtre;
}

// GET /api/admin/finances/depenses?categorie&ligne&effectue&page&limit
async function listerDepenses(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const filtre = filtreDepenses(req.query);
    const [depenses, total] = await Promise.all([
      Expense.find(filtre).populate('partenaireId', 'nom type').populate('creePar', 'username')
        .sort({ estEffectue: 1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Expense.countDocuments(filtre)
    ]);
    return res.status(200).json({ depenses, total, hasMore: page * limit < total });
  } catch (error) {
    console.error("Erreur listerDepenses:", error);
    return res.status(500).json({ message: "Erreur lors du chargement des dépenses." });
  }
}

// Valide et normalise une dépense saisie ; le montant USD se déduit du FCFA (ou l'inverse) avec le taux
async function lireDepense(body, taux) {
  const categorie = CATEGORIES_DEPENSE.includes(body.categorie) ? body.categorie : null;
  const libelle = typeof body.libelle === 'string' ? body.libelle.trim() : '';
  if (!categorie || !libelle) return { erreur: "La catégorie et le libellé sont obligatoires." };

  const depense = { categorie, libelle, tauxApplique: taux };

  if (categorie === 'Budget') {
    const code = typeof body.referenceLigne === 'string' ? body.referenceLigne.trim() : '';
    if (!code || !(await BudgetLine.exists({ code, deletedAt: null }))) return { erreur: "Choisissez une ligne budgétaire existante." };
    depense.referenceLigne = code;
    depense.typeExploitation = null;
  } else {
    if (!TYPES_EXPLOITATION.includes(body.typeExploitation)) return { erreur: "Type de dépense d'exploitation invalide." };
    depense.typeExploitation = body.typeExploitation;
    depense.referenceLigne = '';
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
  if (typeof body.estValidePourAudit === 'boolean') depense.estValidePourAudit = body.estValidePourAudit;
  return { depense };
}

// POST /api/admin/finances/depenses
async function creerDepense(req, res) {
  try {
    const { depense, erreur } = await lireDepense(req.body, await tauxCourant());
    if (erreur) return res.status(400).json({ message: erreur });

    const creee = await Expense.create({ ...depense, creePar: req.user.id });
    await journaliser(req, { action: 'Création', entite: 'Dépense', entiteId: creee._id, resume: `Dépense « ${creee.libelle} » prévue : ${formatFcfa(creee.montantPrevuFcfa)}`, apres: depense });
    return res.status(201).json(creee);
  } catch (error) {
    console.error("Erreur creerDepense:", error);
    return res.status(500).json({ message: "Erreur lors de la création de la dépense." });
  }
}

// PUT /api/admin/finances/depenses/:id (une dépense effectuée n'est plus modifiable : traçabilité de l'audit)
async function modifierDepense(req, res) {
  try {
    const existante = await Expense.findOne({ _id: req.params.id, deletedAt: null });
    if (!existante) return res.status(404).json({ message: "Dépense introuvable." });
    if (existante.estEffectue) return res.status(400).json({ message: "Une dépense effectuée ne se modifie plus. Seule sa validité pour l'audit peut changer." });

    // Le taux reste celui de la création de la dépense
    const { depense, erreur } = await lireDepense({ ...req.body, categorie: req.body.categorie ?? existante.categorie }, existante.tauxApplique);
    if (erreur) return res.status(400).json({ message: erreur });

    const avant = existante.toObject();
    Object.assign(existante, depense);
    await existante.save();
    await journaliser(req, { action: 'Modification', entite: 'Dépense', entiteId: existante._id, resume: `Dépense « ${existante.libelle} » modifiée`, avant, apres: depense });
    return res.status(200).json(existante);
  } catch (error) {
    console.error("Erreur modifierDepense:", error);
    return res.status(500).json({ message: "Erreur lors de la modification de la dépense." });
  }
}

// PATCH /api/admin/finances/depenses/:id/audit  { estValidePourAudit }
async function changerValiditeAudit(req, res) {
  try {
    if (typeof req.body.estValidePourAudit !== 'boolean') return res.status(400).json({ message: "Valeur invalide." });
    const depense = await Expense.findOne({ _id: req.params.id, deletedAt: null });
    if (!depense) return res.status(404).json({ message: "Dépense introuvable." });

    depense.estValidePourAudit = req.body.estValidePourAudit;
    await depense.save();
    await journaliser(req, { action: 'Modification', entite: 'Dépense', entiteId: depense._id, resume: `Dépense « ${depense.libelle} » ${depense.estValidePourAudit ? 'incluse dans' : 'exclue de'} l'audit` });
    return res.status(200).json(depense);
  } catch (error) {
    console.error("Erreur changerValiditeAudit:", error);
    return res.status(500).json({ message: "Erreur lors de la mise à jour." });
  }
}

// PATCH /api/admin/finances/depenses/:id/effectuer  { montantReelFcfa | montantReelUsd, datePaiement } (au moins un justificatif joint)
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

    depense.montantReelFcfa = Math.round(fcfa || usd * depense.tauxApplique);
    depense.montantReelUsd = arrondir(usd || fcfa / depense.tauxApplique, 2);
    depense.datePaiement = datePaiement;
    depense.estEffectue = true;
    await depense.save();

    await journaliser(req, {
      action: 'Validation', entite: 'Dépense', entiteId: depense._id,
      resume: `Dépense « ${depense.libelle} » effectuée : ${formatFcfa(depense.montantReelFcfa)} (prévu ${formatFcfa(depense.montantPrevuFcfa)})`,
      apres: { montantReelFcfa: depense.montantReelFcfa, montantReelUsd: depense.montantReelUsd, datePaiement, justificatifs: depense.justificatifs.length }
    });
    return res.status(200).json(depense);
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

// POST /api/admin/finances/justificatifs (multipart, champ « fichier ») -> { url }
// POST /api/admin/finances/depenses/:id/justificatifs (multipart : « fichier », « typePiece ») : stockage privé
async function ajouterJustificatif(req, res) {
  try {
    if (!req.file) return res.status(400).json({ message: "Aucun fichier reçu (PDF, JPG ou PNG, 10 Mo maximum)." });
    const depense = await Expense.findOne({ _id: req.params.id, deletedAt: null });
    if (!depense) {
      await supprimerFichier({ publicId: req.file.filename }).catch(() => {});
      return res.status(404).json({ message: "Dépense introuvable." });
    }
    const fiche = ficheJustificatif(req.file, req.body?.typePiece, req.user.id);
    depense.justificatifs.push(fiche);
    await depense.save();
    await journaliser(req, { action: 'Modification', entite: 'Dépense', entiteId: depense._id, resume: `Justificatif ajouté à « ${depense.libelle} »${fiche.typePiece ? ` (${fiche.typePiece})` : ''}` });
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
    if (depense.estEffectue && depense.justificatifs.length === 1) {
      return res.status(400).json({ message: "Une dépense effectuée garde au moins un justificatif." });
    }
    await supprimerFichier(justificatif);
    justificatif.deleteOne();
    await depense.save();
    await journaliser(req, { action: 'Suppression', entite: 'Dépense', entiteId: depense._id, resume: `Justificatif retiré de « ${depense.libelle} »` });
    return res.status(200).json({ message: "Justificatif supprimé." });
  } catch (error) {
    console.error("Erreur supprimerJustificatif:", error);
    return res.status(500).json({ message: "Erreur lors de la suppression du justificatif." });
  }
}

// GET /api/admin/finances/depenses/export : CSV pour Excel (séparateur « ; »)
async function exporterDepenses(req, res) {
  try {
    const depenses = await Expense.find(filtreDepenses(req.query)).populate('partenaireId', 'nom').sort({ referenceLigne: 1, createdAt: 1 }).lean();
    const lignes = [[
      'Catégorie', 'Ligne', 'Type', 'Libellé', 'Prestataire', 'Prévu FCFA', 'Prévu USD', 'Réel FCFA', 'Réel USD',
      'Taux', 'Effectuée', 'Date de paiement', 'Valide audit', 'Justificatifs'
    ]];
    for (const d of depenses) {
      lignes.push([
        d.categorie, d.referenceLigne, d.typeExploitation || '', d.libelle, d.partenaireId?.nom || '',
        d.montantPrevuFcfa, String(d.montantPrevuUsd).replace('.', ','), d.montantReelFcfa, String(d.montantReelUsd).replace('.', ','),
        d.tauxApplique, d.estEffectue ? 'Oui' : 'Non', d.datePaiement ? new Date(d.datePaiement).toLocaleDateString('fr-FR') : '',
        d.estValidePourAudit ? 'Oui' : 'Non', `${d.justificatifs?.length || 0} pièce(s)`
      ]);
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="depenses-ahitche-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.status(200).send(ecrireCsv(lignes));
  } catch (error) {
    console.error("Erreur exporterDepenses:", error);
    return res.status(500).json({ message: "Erreur lors de l'export des dépenses." });
  }
}

// ------------------------------------------------------------------
// Synthèse et journal
// ------------------------------------------------------------------

// GET /api/admin/finances/synthese?du=AAAA-MM-JJ&au=AAAA-MM-JJ
async function obtenirSynthese(req, res) {
  try {
    const { du, au, debut, fin } = lirePeriode(req.query);

    const [encaissements, depensesExploitation, budget, compensations] = await Promise.all([
      Order.aggregate([
        { $match: { statut: 'Livrée', dateLivraison: { $gte: debut, $lte: fin } } },
        { $group: { _id: '$modePaiement', total: { $sum: '$total' }, nombre: { $sum: 1 }, livraison: { $sum: '$coutLivraison' } } }
      ]),
      Expense.aggregate([
        { $match: { categorie: 'Exploitation', deletedAt: null, $or: [{ datePaiement: { $gte: debut, $lte: fin } }, { estEffectue: false, createdAt: { $gte: debut, $lte: fin } }] } },
        { $group: { _id: { type: '$typeExploitation', effectue: '$estEffectue' }, prevu: { $sum: '$montantPrevuFcfa' }, reel: { $sum: '$montantReelFcfa' }, nombre: { $sum: 1 } } }
      ]),
      Expense.aggregate([
        { $match: { categorie: 'Budget', deletedAt: null, estEffectue: true, estValidePourAudit: true } },
        { $group: { _id: null, reelFcfa: { $sum: '$montantReelFcfa' }, reelUsd: { $sum: '$montantReelUsd' } } }
      ]),
      Order.countDocuments({ enRetard: true, dateLivraison: { $gte: debut, $lte: fin } })
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

    const prevuBudget = await BudgetLine.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: null, fcfa: { $sum: '$montantPrevuFcfa' }, usd: { $sum: '$montantPrevuUsd' } } }]);

    return res.status(200).json({
      periode: { du, au },
      exploitation: {
        encaissements: { total: totalEncaisse, nombreLivraisons: encaissements.reduce((s, e) => s + e.nombre, 0), parMode: encaissements.map(e => ({ mode: e._id, total: e.total, nombre: e.nombre })) },
        coutLivraison,
        depenses: parType,
        // Marge = encaissé - achats engagés - coût des courses - autres dépenses de la période
        marge: totalEncaisse - achats - coutLivraison - autres,
        livraisonsEnRetard: compensations
      },
      budget: {
        prevuFcfa: prevuBudget[0]?.fcfa || 0,
        prevuUsd: prevuBudget[0]?.usd || 0,
        reelFcfa: budget[0]?.reelFcfa || 0,
        reelUsd: arrondir(budget[0]?.reelUsd || 0, 2)
      },
      taux: await tauxCourant()
    });
  } catch (error) {
    console.error("Erreur obtenirSynthese:", error);
    return res.status(500).json({ message: "Erreur lors du calcul de la synthèse." });
  }
}

// GET /api/admin/finances/journal?page
async function obtenirJournal(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 30;
    const [entrees, total] = await Promise.all([
      AuditLog.find().populate('utilisateur', 'username').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments()
    ]);
    return res.status(200).json({ entrees, total, hasMore: page * limit < total });
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
  obtenirSynthese, obtenirJournal
};
