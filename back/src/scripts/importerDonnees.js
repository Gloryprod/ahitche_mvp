// Import des données du back-office : fichiers CSV 01 à 11 (docs-internes/imports, jamais versionnés), dans l'ordre B.3.
// Usage :
//   node src/scripts/importerDonnees.js <dossier des CSV> [--appliquer] [--attendu <fichier JSON des contrôles>]
//   Sans --appliquer : simulation. Tout s'exécute dans une transaction annulée à la fin ; seul le rapport reste.
//   STAFF_PASSWORD=… : mot de passe des comptes de l'équipe à créer ; sans lui, les comptes absents sont signalés.
// Règles : cellule vide = non renseigné (jamais 0 ni valeur par défaut) ; tout écart est signalé, jamais corrigé en silence ;
// aucun justificatif n'est téléversé ; aucune dépense n'est créée par le stock (Q 6.3).
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const Category = require('../models/category');
const CompositionRule = require('../models/compositionRule');
const Product = require('../models/product');
const Formule = require('../models/formules');
const Zone = require('../models/zone');
const Partner = require('../models/partner');
const BudgetLine = require('../models/budgetLine');
const Expense = require('../models/expense');
const { LotStockFifo, MouvementStock, FOURNISSEUR_INTERNE } = require('../models/stock');
const Parametres = require('../models/parametres');
const User = require('../models/user');
const { EQUIPE } = require('../config/roles');
const { SOURCES_FINANCEMENT, MODES_PAIEMENT_DEPENSE } = require('../config/convention');
const { lireCsv, lireNombre } = require('../utils/csv');
const { normaliser } = require('../utils/texte');
const { journaliser, TAUX_CONVENTION } = require('../services/journalService');
const { lienWhatsAppFormule } = require('../services/formuleService');
const { moisProjet } = require('../services/financeService');
const { controlerDonnees, comparerControles } = require('../services/controleDonneesService');

dotenv.config();

const PACKS = ['essentiel', 'equilibre', 'confort', 'reserve', 'fraicheur'];
const ecarts = [];
const ecart = (fichier, ligne, message) => ecarts.push({ fichier, ligne, message });
const bilan = [];

// --- Lecture des cellules ---
const texte = (v) => (v ?? '').toString().trim();
function nombre(v, fichier, ligne, colonne) {
  if (texte(v) === '') return null;
  const n = lireNombre(v);
  if (!Number.isFinite(n)) { ecart(fichier, ligne, `${colonne} illisible : « ${v} »`); return null; }
  return n;
}
function ouiNon(v) {
  const t = normaliser(v);
  if (t === 'oui') return true;
  if (t === 'non') return false;
  return null;
}
// AAAA-MM-JJ ou JJ/MM/AAAA -> date à midi, heure du Bénin (le jour ne change pas)
function date(v, fichier, ligne, colonne) {
  const t = texte(v);
  if (!t) return null;
  let iso = /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
  const fr = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (fr) iso = `${fr[3]}-${fr[2]}-${fr[1]}`;
  const d = iso ? new Date(`${iso}T12:00:00+01:00`) : null;
  if (!d || Number.isNaN(d.getTime())) { ecart(fichier, ligne, `${colonne} illisible : « ${v} »`); return null; }
  return d;
}
const telephone = (v) => texte(v).replace(/\s+/g, '');
const ifu = (v) => texte(v).replace(/^IFU\s*/i, '').trim();

// Fichier CSV -> lignes { colonne: valeur }, avec le numéro de ligne du fichier
function lire(dossier, nom) {
  const chemin = path.join(dossier, nom);
  if (!fs.existsSync(chemin)) throw new Error(`Fichier absent : ${chemin}`);
  const [entete, ...lignes] = lireCsv(fs.readFileSync(chemin, 'utf8'));
  const colonnes = entete.map(c => c.trim());
  return lignes.map((cellules, i) => ({ _ligne: i + 2, ...Object.fromEntries(colonnes.map((c, j) => [c, cellules[j] ?? ''])) }));
}

// ------------------------------------------------------------------
// Étapes, dans l'ordre B.3
// ------------------------------------------------------------------

async function importerCategories(lignes, s) {
  const parNom = new Map();
  let crees = 0, maj = 0;
  for (const l of lignes) {
    const nom = texte(l.categorie);
    if (!nom) { ecart('01', l._ligne, 'catégorie sans nom'); continue; }
    const existantes = await Category.find({ deletedAt: null }).session(s);
    let c = existantes.find(x => normaliser(x.name) === normaliser(nom));
    if (c) { c.description = texte(l.description); maj++; } else { c = new Category({ name: nom, description: texte(l.description) }); crees++; }
    await c.save({ session: s });
    parNom.set(normaliser(nom), c._id);
  }
  bilan.push(`01 catégories : ${crees} créée(s), ${maj} mise(s) à jour`);
  return parNom;
}

async function importerRegles(lignes, s) {
  const parNom = new Map();
  let crees = 0, maj = 0;
  for (const l of lignes) {
    const nom = texte(l.regle);
    if (!nom) { ecart('02', l._ligne, 'règle sans nom'); continue; }
    const champs = {
      multiplierEquilibre: nombre(l.multiplicateur_equilibre, '02', l._ligne, 'multiplicateur_equilibre'),
      multiplierConfort: nombre(l.multiplicateur_confort, '02', l._ligne, 'multiplicateur_confort'),
      description: texte(l.description)
    };
    const existantes = await CompositionRule.find({ deletedAt: null }).session(s);
    let r = existantes.find(x => normaliser(x.name) === normaliser(nom));
    if (r) { Object.assign(r, champs); maj++; } else { r = new CompositionRule({ name: nom, ...champs }); crees++; }
    await r.save({ session: s });
    parNom.set(normaliser(nom), r._id);
  }
  bilan.push(`02 règles : ${crees} créée(s), ${maj} mise(s) à jour`);
  return parNom;
}

async function importerProduits(lignes, categories, regles, s) {
  let crees = 0, maj = 0;
  const vus = new Set();
  for (const l of lignes) {
    const reference = texte(l.reference);
    const nom = texte(l.produit);
    if (!reference || !nom) { ecart('03', l._ligne, 'produit sans référence ou sans nom'); continue; }
    if (vus.has(reference)) { ecart('03', l._ligne, `référence ${reference} en double dans le fichier`); continue; }
    vus.add(reference);
    const categorie = texte(l.categorie) ? categories.get(normaliser(l.categorie)) : null;
    if (texte(l.categorie) && !categorie) ecart('03', l._ligne, `${reference} : catégorie « ${l.categorie} » absente de 01`);
    const regle = texte(l.regle) ? regles.get(normaliser(l.regle)) : null;
    if (texte(l.regle) && !regle) ecart('03', l._ligne, `${reference} : règle « ${l.regle} » absente de 02`);
    const type = texte(l.type);
    if (!['base fixe', 'extra'].includes(type)) ecart('03', l._ligne, `${reference} : type « ${type} » inconnu`);
    const statut = texte(l.statut) || null;
    if (statut && !['disponible', 'indisponible'].includes(statut)) ecart('03', l._ligne, `${reference} : statut « ${statut} » inconnu`);

    const quantites = {
      essentiel: nombre(l.quantite_base_essentiel, '03', l._ligne, 'quantite_base_essentiel'),
      equilibre: nombre(l.quantite_equilibre, '03', l._ligne, 'quantite_equilibre'),
      confort: nombre(l.quantite_confort, '03', l._ligne, 'quantite_confort'),
      reserve: nombre(l.quantite_reserve, '03', l._ligne, 'quantite_reserve'),
      fraicheur: nombre(l.quantite_fraicheur, '03', l._ligne, 'quantite_fraicheur')
    };
    // Cohérence avec « exclu_de » : un pack exclu n'a pas de quantité
    const exclus = texte(l.exclu_de).split(',').map(x => normaliser(x)).filter(Boolean);
    for (const pack of exclus) {
      if (!PACKS.includes(pack)) ecart('03', l._ligne, `${reference} : pack exclu « ${pack} » inconnu`);
      else if (quantites[pack] !== null) ecart('03', l._ligne, `${reference} : exclu de ${pack} mais quantité ${quantites[pack]}`);
    }

    const champs = {
      reference, name: nom, category: categorie || null, compositionRule: regle || null,
      type: type || 'extra', statut: statut || 'disponible', unit: texte(l.unite),
      priceUnit: nombre(l.prix_unitaire_fcfa, '03', l._ligne, 'prix_unitaire_fcfa'),
      seuilAlerte: nombre(l.seuil_alerte, '03', l._ligne, 'seuil_alerte'),
      quantites, commentaire: texte(l.commentaire)
    };
    // Produit existant : même référence, sinon même nom (ancien catalogue sans référence)
    let p = await Product.findOne({ reference, deletedAt: null }).session(s);
    if (!p) {
      const candidats = await Product.find({ deletedAt: null, $or: [{ reference: null }, { reference: '' }, { reference: { $exists: false } }] }).session(s);
      p = candidats.find(x => normaliser(x.name) === normaliser(nom)) || null;
      if (p) ecart('03', l._ligne, `${reference} : produit existant « ${p.name} » sans référence, repris et complété`);
    }
    if (p) { Object.assign(p, champs); maj++; } else { p = new Product(champs); crees++; }
    await p.save({ session: s });
  }

  // D-15 : matières premières stockées, introduites en produits variables, sans prix (non vendues)
  const matieres = [
    { reference: 'MP01', name: 'Maïs trié', unit: 'kg' },
    { reference: 'MP02', name: 'Arachide', unit: 'sac' }
  ];
  for (const m of matieres) {
    if (await Product.exists({ reference: m.reference, deletedAt: null }).session(s)) continue;
    await Product.create([{
      ...m, type: 'extra', statut: 'indisponible', priceUnit: null, category: null, compositionRule: null,
      quantites: { essentiel: null, equilibre: null, confort: null, reserve: null, fraicheur: null },
      commentaire: 'Matière première (D-15) : stockée, non vendue ; catégorie et prix à renseigner'
    }], { session: s });
    crees++;
  }
  ecart('03', '-', 'D-15 : MP01 « Maïs trié » (kg) et MP02 « Arachide » (sac, unité de suivi à préciser) créés hors fichier, statut indisponible, sans prix ni catégorie');

  // Produits actifs hors référentiel (ancien catalogue) : signalés, jamais supprimés
  const references = new Set([...vus, ...matieres.map(m => m.reference)]);
  const horsFichier = (await Product.find({ deletedAt: null }).session(s)).filter(p => !references.has(p.reference));
  for (const p of horsFichier) ecart('03', '-', `produit actif hors référentiel v4 : « ${p.name} »${p.reference ? ` (${p.reference})` : ''} — à retirer ou garder`);
  bilan.push(`03 produits : ${crees} créé(s), ${maj} mis à jour, ${horsFichier.length} hors référentiel`);
}

async function importerFormules(lignes, s) {
  let maj = 0;
  for (const l of lignes) {
    const slug = texte(l.slug);
    const f = await Formule.findOne({ slug }).session(s);
    if (!f) { ecart('04', l._ligne, `formule ${slug} absente de la base : lancer createFormules.js avant l'import`); continue; }
    if (texte(l.prix_reference_fcfa)) ecart('04', l._ligne, `${slug} : prix_reference_fcfa renseigné mais non utilisé (le prix de vente fait foi)`);
    const prix = nombre(l.prix_vente_fcfa, '04', l._ligne, 'prix_vente_fcfa');
    Object.assign(f, {
      nom: texte(l.nom) || f.nom, cible: texte(l.cible), phraseAccroche: texte(l.accroche),
      estimationRepas: { min: nombre(l.repas_min, '04', l._ligne, 'repas_min'), max: nombre(l.repas_max, '04', l._ligne, 'repas_max') },
      heuresEconomisees: { min: nombre(l.heures_min, '04', l._ligne, 'heures_min'), max: nombre(l.heures_max, '04', l._ligne, 'heures_max') },
      prixActuel: prix, ancienPrix: null,
      cycleJours: nombre(l.cycle_jours, '04', l._ligne, 'cycle_jours') ?? f.cycleJours,
      estRecommandee: ouiNon(l.recommandee) ?? f.estRecommandee,
      bientotDisponible: ouiNon(l.bientot_disponible) ?? f.bientotDisponible,
      promesse: texte(l.promesse), foyersCibles: texte(l.foyers_cibles), logiqueCommande: texte(l.logique_commande),
      changementsMax: nombre(l.changements_max, '04', l._ligne, 'changements_max'),
      variationQuantitePct: nombre(l.variation_quantite_pct, '04', l._ligne, 'variation_quantite_pct')
    });
    if (f.prixCommercial !== null && f.prixCommercial !== undefined && f.prixCommercial !== prix) {
      ecart('04', l._ligne, `${slug} : prix fixé par l'admin (${f.prixCommercial}) différent du fichier (${prix ?? 'vide'}) ; le prix de l'admin reste le prix de vente`);
    }
    f.lienWhatsApp = lienWhatsAppFormule(f);
    await f.save({ session: s });
    maj++;
  }
  bilan.push(`04 formules : ${maj} mise(s) à jour`);
}

async function importerZones(lignes, s) {
  let maj = 0;
  for (const l of lignes) {
    const code = texte(l.code_zone);
    const z = await Zone.findOne({ code }).session(s);
    if (!z) { ecart('05', l._ligne, `zone ${code} absente : lancer migrerDonnees.js (zones) avant l'import`); continue; }
    const tarif = nombre(l.tarif_course_fcfa, '05', l._ligne, 'tarif_course_fcfa');
    if (tarif !== null) z.tarifCourse = tarif;
    const prioritaire = ouiNon(l.prioritaire); if (prioritaire !== null) z.prioritaire = prioritaire;
    const actif = ouiNon(l.active); if (actif !== null) z.actif = actif;
    const ajouter = texte(l.quartiers_a_ajouter).split(',').map(texte).filter(Boolean);
    const retirer = texte(l.quartiers_a_retirer).split(',').map(x => normaliser(x)).filter(Boolean);
    for (const q of ajouter) if (!z.quartiers.some(x => normaliser(x) === normaliser(q))) z.quartiers.push(q);
    z.quartiers = z.quartiers.filter(q => !retirer.includes(normaliser(q)));
    await z.save({ session: s });
    maj++;
  }
  bilan.push(`05 zones : ${maj} mise(s) à jour`);
}

async function importerPrestataires(lignes, s) {
  let crees = 0, maj = 0;
  const parNom = new Map();
  for (const l of lignes) {
    const nom = texte(l.nom);
    if (!nom) { ecart('06', l._ligne, 'prestataire sans nom'); continue; }
    const type = texte(l.type);
    if (!Partner.TYPES_PRESTATAIRE.includes(type)) { ecart('06', l._ligne, `${nom} : type « ${type} » inconnu`); continue; }
    const mode = texte(l.mode_paiement);
    if (mode && !Partner.MODES_PAIEMENT_PRESTATAIRE.includes(mode)) ecart('06', l._ligne, `${nom} : mode de paiement « ${mode} » inconnu`);
    const champs = {
      nom, type, telephone: telephone(l.telephone), quartier: texte(l.quartier), ifuRccm: ifu(l.ifu_rccm),
      ...(Partner.MODES_PAIEMENT_PRESTATAIRE.includes(mode) ? { modePaiement: mode } : {}),
      notes: texte(l.notes), actif: ouiNon(l.actif) ?? true
    };
    // Fusion avec une fiche existante : même nom (normalisé) ou même IFU
    const fiches = await Partner.find({ deletedAt: null }).session(s);
    let p = fiches.find(x => normaliser(x.nom) === normaliser(nom)) || (champs.ifuRccm ? fiches.find(x => x.ifuRccm && x.ifuRccm.replace(/\s+/g, '') === champs.ifuRccm.replace(/\s+/g, '')) : null);
    if (p && normaliser(p.nom) !== normaliser(nom)) ecart('06', l._ligne, `${nom} : fusionné avec la fiche « ${p.nom} » (même IFU)`);
    if (p) { Object.assign(p, champs); maj++; } else { p = new Partner(champs); crees++; }
    await p.save({ session: s });
    parNom.set(normaliser(nom), p);
  }
  bilan.push(`06 prestataires : ${crees} créé(s), ${maj} fusionné(s) ou mis à jour`);
  return parNom;
}

// Catégorie de la convention de chaque ligne, déduite des dépenses (08) : doit être unique par ligne
function categoriesDesLignes(depenses) {
  const parLigne = new Map();
  for (const d of depenses) {
    const code = texte(d.ligne_budgetaire), cat = texte(d.categorie_ad);
    if (!code || !cat) continue;
    if (!parLigne.has(code)) parLigne.set(code, new Set());
    parLigne.get(code).add(Number(cat));
  }
  return parLigne;
}

async function importerLignesBudget(lignes, depenses, s) {
  let crees = 0, maj = 0;
  const categories = categoriesDesLignes(depenses);
  for (const l of lignes) {
    const code = texte(l.code);
    if (!code) { ecart('07', l._ligne, 'ligne sans code'); continue; }
    const champs = {
      libelle: texte(l['libellé']),
      montantPrevuUsd: nombre(l['prévu USD'], '07', l._ligne, 'prévu USD'),
      montantPrevuFcfa: nombre(l['prévu FCFA'], '07', l._ligne, 'prévu FCFA')
    };
    if (champs.montantPrevuUsd !== null && champs.montantPrevuFcfa !== null && Math.round(champs.montantPrevuUsd * TAUX_CONVENTION) !== champs.montantPrevuFcfa) {
      ecart('07', l._ligne, `${code} : ${champs.montantPrevuUsd} USD × ${TAUX_CONVENTION} ≠ ${champs.montantPrevuFcfa} FCFA`);
    }
    const cats = categories.get(code);
    if (cats && cats.size > 1) ecart('07', l._ligne, `${code} : catégories contradictoires dans 08 (${[...cats].join(', ')})`);
    if (cats && cats.size === 1) champs.categorieAd = [...cats][0];
    let b = await BudgetLine.findOne({ code, deletedAt: null }).session(s);
    if (b) { Object.assign(b, champs); maj++; } else { b = new BudgetLine({ code, ...champs }); crees++; }
    await b.save({ session: s });
  }
  ecart('07', '-', 'passation des lignes : absente des fichiers (tableau F.5 du document) : à saisir dans Finances');
  bilan.push(`07 lignes budgétaires : ${crees} créée(s), ${maj} mise(s) à jour`);
}

async function importerDepenses(lignes, prestataires, admin, s) {
  let crees = 0, inchangees = 0;
  for (const l of lignes) {
    const libelle = texte(l.libelle);
    const categorie = texte(l.categorie);
    if (!['Budget', 'Exploitation'].includes(categorie) || !libelle) { ecart('08', l._ligne, `catégorie ou libellé invalide (« ${categorie} »)`); continue; }
    const code = texte(l.ligne_budgetaire);
    if (categorie === 'Budget' && !(await BudgetLine.exists({ code, deletedAt: null }).session(s))) { ecart('08', l._ligne, `${libelle} : ligne ${code} absente de 07`); continue; }
    const partenaire = texte(l.prestataire) ? prestataires.get(normaliser(l.prestataire)) : null;
    if (texte(l.prestataire) && !partenaire) ecart('08', l._ligne, `${libelle} : prestataire « ${l.prestataire} » absent de 06`);

    // « Mobile Money (Flooz) » -> mode « Mobile Money » et détail « Flooz »
    const modeTexte = texte(l.mode_paiement);
    const mode = /^([^(]+?)\s*(?:\(([^)]*)\))?$/.exec(modeTexte);
    const modePaiement = mode ? mode[1].trim() : '';
    if (modePaiement && !MODES_PAIEMENT_DEPENSE.includes(modePaiement)) ecart('08', l._ligne, `${libelle} : mode de paiement « ${modeTexte} » inconnu`);
    const source = texte(l.source_financement);
    if (source && !SOURCES_FINANCEMENT.includes(source)) ecart('08', l._ligne, `${libelle} : source « ${source} » inconnue`);

    const prevuFcfa = nombre(l.montant_prevu_fcfa, '08', l._ligne, 'montant_prevu_fcfa');
    const prevuUsd = nombre(l.montant_prevu_usd, '08', l._ligne, 'montant_prevu_usd');
    const reelFcfa = nombre(l.montant_reel_fcfa, '08', l._ligne, 'montant_reel_fcfa');
    const datePaiement = date(l.date_paiement, '08', l._ligne, 'date_paiement');
    const paye = reelFcfa !== null && datePaiement !== null;
    if (prevuFcfa === null && categorie === 'Budget') ecart('08', l._ligne, `${libelle} : montant prévu vide (laissé vide)`);

    const moisFichier = texte(l.mois_projet);
    const moisCalcule = datePaiement ? moisProjet(datePaiement).mois : null;
    if (moisFichier && moisCalcule && moisFichier !== moisCalcule) ecart('08', l._ligne, `${libelle} : mois ${moisFichier} dans le fichier, ${moisCalcule} d'après la date ; le fichier fait foi`);
    const categorieAd = texte(l.categorie_ad) ? Number(l.categorie_ad) : null;

    const champs = {
      categorie, referenceLigne: categorie === 'Budget' ? code : '', typeExploitation: categorie === 'Exploitation' ? (texte(l.type_exploitation) || 'Autre') : null,
      libelle, partenaireId: partenaire?._id || null,
      montantPrevuFcfa: prevuFcfa, montantPrevuUsd: prevuUsd,
      montantReelFcfa: reelFcfa ?? 0, montantReelUsd: reelFcfa === null ? 0 : Math.round((reelFcfa / TAUX_CONVENTION) * 100) / 100,
      tauxApplique: TAUX_CONVENTION, estEffectue: paye, datePaiement,
      numeroPiece: texte(l.numero_piece), numeroAutorisation: texte(l.numero_autorisation_decaissement),
      fichiersAttendus: texte(l.justificatif_fichier).split(';').map(texte).filter(Boolean),
      estValidePourAudit: false, // Aucun justificatif joint à l'import : se coche quand les pièces sont complètes
      sousLigne: texte(l.sous_ligne), modePaiement: MODES_PAIEMENT_DEPENSE.includes(modePaiement) ? modePaiement : '',
      detailPaiement: mode?.[2]?.trim() || '', referencePaiement: texte(l.reference_paiement),
      sourceFinancement: SOURCES_FINANCEMENT.includes(source) ? source : '', moisProjet: moisFichier || moisCalcule || '',
      categorieAd: [1, 2].includes(categorieAd) ? categorieAd : null,
      piecesManquantes: texte(l.pieces_manquantes), commentaire: texte(l.commentaire)
    };
    if (ouiNon(l.valide_pour_audit) === true) ecart('08', l._ligne, `${libelle} : « valide pour l'audit » à oui, mais aucune pièce n'est jointe : laissé à non`);

    // Clé naturelle : catégorie, ligne, n° de pièce et libellé (import relançable)
    const existante = await Expense.findOne({ deletedAt: null, categorie, referenceLigne: champs.referenceLigne, numeroPiece: champs.numeroPiece, libelle }).session(s);
    if (existante) {
      const differe = ['montantReelFcfa', 'montantPrevuFcfa', 'moisProjet'].some(k => (existante[k] ?? null) !== (champs[k] ?? null));
      if (differe) ecart('08', l._ligne, `${libelle} : déjà en base avec d'autres montants ou un autre mois : non modifiée`);
      inchangees++;
      continue;
    }
    await Expense.create([{ ...champs, creePar: admin._id }], { session: s });
    crees++;
  }
  ecart('08', '-', 'dépenses importées payées sans justificatif joint (téléversement après la mise en service, stockage privé) : non retenues pour l\'audit tant que les pièces manquent');
  bilan.push(`08 dépenses : ${crees} créée(s), ${inchangees} déjà présente(s)`);
}

async function importerStock(lignes, prestataires, s) {
  let crees = 0, presents = 0;
  const parPiece = new Map();
  for (const l of lignes) {
    const numeroLot = texte(l.numero_lot);
    const reference = texte(l.reference_produit);
    if (!numeroLot) { ecart('09', l._ligne, 'lot sans numéro'); continue; }
    const produit = await Product.findOne({ reference, deletedAt: null }).session(s);
    if (!produit) { ecart('09', l._ligne, `${numeroLot} : produit ${reference} introuvable`); continue; }
    if (texte(l.unite) && texte(l.unite) !== produit.unit) ecart('09', l._ligne, `${numeroLot} : unité ${l.unite} ≠ unité du produit (${produit.unit})`);

    const nomFournisseur = texte(l.fournisseur);
    const interne = normaliser(nomFournisseur) === normaliser(FOURNISSEUR_INTERNE);
    const fiche = interne ? null : prestataires.get(normaliser(nomFournisseur));
    if (!interne && !fiche) { ecart('09', l._ligne, `${numeroLot} : fournisseur « ${nomFournisseur} » absent de 06`); continue; }

    const quantite = nombre(l.quantite, '09', l._ligne, 'quantite');
    const prix = nombre(l.prix_achat_unitaire_fcfa, '09', l._ligne, 'prix_achat_unitaire_fcfa');
    const valeur = nombre(l.valeur_fcfa, '09', l._ligne, 'valeur_fcfa');
    const dateReception = date(l.date_reception, '09', l._ligne, 'date_reception');
    const aConfirmer = texte(l.a_confirmer);
    if (quantite !== null && prix !== null && valeur !== null && Math.abs(quantite * prix - valeur) > 1) ecart('09', l._ligne, `${numeroLot} : ${quantite} × ${prix} ≠ ${valeur} FCFA`);
    if (quantite === null && !aConfirmer) ecart('09', l._ligne, `${numeroLot} : quantité vide sans consigne de comptage`);
    if (!dateReception) ecart('09', l._ligne, `${numeroLot} : date de réception vide (le lot passe après les lots datés dans le FIFO)`);
    if (ouiNon(l.creer_depense) === true) ecart('09', l._ligne, `${numeroLot} : creer_depense = oui non géré par l'import (aucune dépense créée)`);

    // Rattachement à la dépense de la pièce (jamais de seconde dépense)
    const numeroPiece = texte(l.numero_piece);
    const depense = numeroPiece ? await Expense.findOne({ numeroPiece, deletedAt: null }).session(s) : null;
    if (numeroPiece && !depense) ecart('09', l._ligne, `${numeroLot} : aucune dépense ne porte la pièce ${numeroPiece}`);
    if (depense && texte(l.ligne_budgetaire) && depense.referenceLigne !== texte(l.ligne_budgetaire)) ecart('09', l._ligne, `${numeroLot} : ligne ${l.ligne_budgetaire} ≠ ligne de la dépense (${depense.referenceLigne})`);
    if (depense) parPiece.set(numeroPiece, { depense, total: (parPiece.get(numeroPiece)?.total || 0) + (valeur || 0) });

    if (await LotStockFifo.exists({ numeroLot, deletedAt: null }).session(s)) { presents++; continue; }
    const [lot] = await LotStockFifo.create([{
      numeroLot, product: produit._id,
      quantiteInitiale: quantite, quantiteRestante: quantite,
      prixAchatUnitaire: quantite === null ? null : (prix ?? (valeur !== null ? Math.round((valeur / quantite) * 100) / 100 : null)),
      valeurFcfa: valeur, dateReception,
      fournisseurId: fiche?._id || null, fournisseur: interne ? FOURNISSEUR_INTERNE : fiche.nom,
      lotFournisseur: texte(l.lot_fournisseur), conditionnement: texte(l.conditionnement), aConfirmer,
      numeroPiece, depenseId: depense?._id || null, commentaire: texte(l.commentaire)
    }], { session: s });
    if (quantite !== null) {
      await MouvementStock.create([{ product: produit._id, lotId: lot._id, type: 'entree', quantite, motif: `Stock de départ (import)${numeroPiece ? `, pièce ${numeroPiece}` : ''}`, responsable: 'Import' }], { session: s });
    }
    crees++;
  }
  // Valeur des lots d'une même pièce comparée au montant payé
  for (const [piece, { depense, total }] of parPiece) {
    if (Math.round(total) !== Math.round(depense.montantReelFcfa)) {
      ecart('09', '-', `pièce ${piece} : lots ${total} FCFA, dépense ${depense.montantReelFcfa} FCFA (écart ${depense.montantReelFcfa - total})`);
    }
  }
  bilan.push(`09 stock : ${crees} lot(s) créé(s), ${presents} déjà présent(s), aucune dépense créée`);
}

async function importerParametres(lignes, s) {
  if (lignes.length !== 1) { ecart('10', '-', `${lignes.length} ligne(s) au lieu d'une`); if (!lignes.length) return; }
  const l = lignes[0];
  const n = (c) => nombre(l[c], '10', l._ligne, c);
  const p = await Parametres.findOne({ cle: 'general' }).session(s) || new Parametres({ cle: 'general' });
  Object.assign(p, {
    chargesFixesMensuellesFcfa: n('charges_fixes_mensuelles_fcfa'), objectifCaMensuelFcfa: n('objectif_ca_mensuel_fcfa'),
    repartition: { essentiel: n('part_essentiel_pct'), equilibre: n('part_equilibre_pct'), confort: n('part_confort_pct') },
    emballageParCommandeFcfa: n('emballage_par_commande_fcfa'), commissionMobileMoneyPct: n('commission_mobile_money_pct'),
    livraisonMoyenneFcfa: n('livraison_moyenne_fcfa'), objectifClients: n('objectif_clients'),
    debutObjectif: date(l.debut_objectif, '10', l._ligne, 'debut_objectif'), finObjectif: date(l.fin_objectif, '10', l._ligne, 'fin_objectif'),
    parts: { emballage: n('part_emballage_pct'), transformation: n('part_transformation_pct'), logistique: n('part_logistique_pct'), pertes: n('part_pertes_pct') },
    margeCiblePct: n('marge_cible_pct')
  });
  const coefficientFichier = n('coefficient_operationnel');
  if (coefficientFichier !== null && p.coefficient() !== null && Math.abs(coefficientFichier - p.coefficient()) > 0.0001) {
    ecart('10', l._ligne, `coefficient ${coefficientFichier} ≠ 1 + parts (${p.coefficient()})`);
  }
  await p.save({ session: s });
  bilan.push(`10 paramètres : enregistrés (coefficient ${p.coefficient() ?? 'à renseigner'})`);
}

async function importerEquipe(lignes, prestataires, s) {
  let crees = 0, maj = 0, aCreer = 0;
  const motDePasse = process.env.STAFF_PASSWORD;
  for (const l of lignes) {
    const email = texte(l.email).toLowerCase(), nom = texte(l.nom), role = texte(l.role);
    if (!email || !nom) { ecart('11', l._ligne, 'membre sans nom ou sans e-mail'); continue; }
    if (!EQUIPE.includes(role)) { ecart('11', l._ligne, `${nom} : rôle « ${role} » inconnu`); continue; }
    // Gestionnaire qui livre : relié à sa fiche livreur de même nom (D-17)
    const fiche = prestataires.get(normaliser(nom));
    const livreurId = role === 'gestionnaire' && fiche?.type === 'Livreur' ? fiche._id : null;
    const principal = ouiNon(l.admin_principal) === true;

    let u = await User.findOne({ email }).session(s);
    if (u) {
      if (u.role !== role) ecart('11', l._ligne, `${email} : rôle ${u.role} remplacé par ${role}`);
      Object.assign(u, { role, adminPrincipal: principal, ...(livreurId ? { livreurId } : {}) });
      await u.save({ session: s });
      maj++;
    } else if (motDePasse && motDePasse.length >= 8) {
      if (await User.exists({ username: nom }).session(s)) { ecart('11', l._ligne, `${nom} : nom d'utilisateur déjà pris`); continue; }
      await User.create([{ username: nom, email, role, adminPrincipal: principal, livreurId, password: await bcrypt.hash(motDePasse, 10) }], { session: s });
      crees++;
    } else {
      ecart('11', l._ligne, `${email} : compte à créer (STAFF_PASSWORD absent)`);
      aCreer++;
    }
    if (livreurId) ecart('11', l._ligne, `${nom} : relié à sa fiche livreur, ne voit que les clients de ses livraisons`);
  }
  const principaux = await User.countDocuments({ adminPrincipal: true }).session(s);
  if (principaux > 1) ecart('11', '-', `${principaux} comptes « admin principal »`);
  bilan.push(`11 équipe : ${crees} compte(s) créé(s), ${maj} mis à jour, ${aCreer} à créer`);
}

// ------------------------------------------------------------------

async function importer() {
  const args = process.argv.slice(2);
  const dossier = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--attendu');
  const appliquer = args.includes('--appliquer');
  const fichierAttendu = args.includes('--attendu') ? args[args.indexOf('--attendu') + 1] : null;
  if (!dossier) {
    console.error('Usage : node src/scripts/importerDonnees.js <dossier des CSV> [--appliquer] [--attendu <controles.json>]');
    process.exit(1);
  }

  const f = (nom) => lire(dossier, nom);
  const fichiers = {
    categories: f('01_categories.csv'), regles: f('02_regles.csv'), produits: f('03_produits.csv'), formules: f('04_formules.csv'),
    zones: f('05_zones.csv'), prestataires: f('06_prestataires.csv'), lignes: f('07_budget_lignes.csv'), depenses: f('08_depenses.csv'),
    stock: f('09_stock_depart.csv'), parametres: f('10_parametres.csv'), equipe: f('11_equipe.csv')
  };

  // autoIndex désactivé : aucune écriture hors de la transaction (simulation sans trace)
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false });
  const session = await mongoose.startSession();
  let controles = null;
  try {
    const admin = await User.findOne({ role: 'admin' }).sort({ adminPrincipal: -1, createdAt: 1 });
    if (!admin) throw new Error("Aucun compte admin : lancer createAdmin.js d'abord.");
    const req = { user: { id: admin._id, role: 'admin' } };

    session.startTransaction();
    const categories = await importerCategories(fichiers.categories, session);
    const regles = await importerRegles(fichiers.regles, session);
    await importerProduits(fichiers.produits, categories, regles, session);
    await importerFormules(fichiers.formules, session);
    await importerZones(fichiers.zones, session);
    const prestataires = await importerPrestataires(fichiers.prestataires, session);
    await importerLignesBudget(fichiers.lignes, fichiers.depenses, session);
    await importerDepenses(fichiers.depenses, prestataires, admin, session);
    await importerStock(fichiers.stock, prestataires, session);
    await importerParametres(fichiers.parametres, session);
    await importerEquipe(fichiers.equipe, prestataires, session);
    await journaliser(req, { action: 'Import', entite: 'Données du back-office', resume: `Import des fichiers 01 à 11 : ${bilan.join(' ; ')}` }, session);

    controles = await controlerDonnees(session);
    if (appliquer) { await session.commitTransaction(); } else { await session.abortTransaction(); }
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    console.error('❌ Import interrompu, rien n\'a été enregistré :', error.message);
    process.exitCode = 1;
  } finally {
    session.endSession();
    await mongoose.disconnect();
  }
  if (!controles) return;

  console.log(appliquer ? '✅ IMPORT APPLIQUÉ' : '🔎 SIMULATION (rien n\'a été enregistré)');
  for (const b of bilan) console.log('  ' + b);
  console.log(`\nÉcarts signalés (${ecarts.length}) :`);
  for (const e of ecarts) console.log(`  [${e.fichier}${e.ligne !== '-' ? ` l.${e.ligne}` : ''}] ${e.message}`);
  console.log('\nContrôles :');
  const attendu = fichierAttendu ? JSON.parse(fs.readFileSync(fichierAttendu, 'utf8')) : null;
  for (const ligne of comparerControles(controles, attendu)) console.log('  ' + ligne);
}

importer();
