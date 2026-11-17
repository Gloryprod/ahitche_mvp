const { LotStockFifo, MouvementStock, FOURNISSEUR_INTERNE } = require('../models/stock');
const Product = require('../models/product');
const Partner = require('../models/partner');
const BudgetLine = require('../models/budgetLine');
const Expense = require('../models/expense');
const { rattacherDepenseAchat, creerDepenseAchat } = require('./depenseStockService');
const { comblerManques, texteComblements, genererNumeroLot, nomResponsable } = require('./stockService');
const { journaliser } = require('./journalService');
const { lireCsv } = require('../utils/csv');
const { normaliser, lireNombre } = require('../utils/texte');

/**
 * Enregistre une entrée en stock dans la transaction `session` : dépense de la pièce (rattachée, créée ou aucune),
 * lot, mouvement « entrée » et comblement des manques du produit (lot compté seulement), puis le journal du lot.
 * Partagée par le formulaire (POST /stock/lots) et l'import groupé (POST /stock/lots/import).
 * @param {object} lot - LotStockFifo pas encore enregistré
 * @param {object} o - { produit, responsable, creerDepense, ligneBudgetaire, journal (false : l'appelant journalise) }
 * @returns {{ depense, creee, comblements, combles }}
 */
async function enregistrerEntree(req, lot, { produit, responsable, creerDepense = true, ligneBudgetaire = '', journal = true }, session) {
  const { depense, creee } = await rattacherDepenseAchat(req, lot, { creerDepense, ligneBudgetaire, session });
  await lot.save({ session });

  let comblements = [];
  if (lot.quantiteInitiale !== null) {
    await MouvementStock.create([{
      product: produit._id,
      lotId: lot._id,
      type: 'entree',
      quantite: lot.quantiteInitiale,
      motif: `Réception de marchandise auprès de ${lot.fournisseur}${lot.numeroPiece ? ` (pièce ${lot.numeroPiece})` : ''}`,
      responsable
    }], { session });
    comblements = await comblerManques(produit._id, lot, session, responsable);
  }
  const combles = texteComblements(comblements, produit.unit);
  if (journal) {
    await journaliser(req, {
      action: 'Création', entite: 'Lot de stock', entiteId: lot._id,
      resume: `Entrée ${lot.numeroLot} : ${produit.name}, ${lot.quantiteInitiale === null ? `à compter (${lot.aConfirmer})` : `${lot.quantiteInitiale} ${produit.unit}`}${combles}${depense ? (creee ? ', dépense créée' : `, rattachée à la dépense de la pièce ${lot.numeroPiece}`) : ''}`
    }, session);
  }
  return { depense, creee, comblements, combles };
}

// ------------------------------------------------------------------
// Import groupé (docs-internes/stock/CONTRAT-import-entrees.md)
// ------------------------------------------------------------------

const MAX_LIGNES = 200;
const MAX_OCTETS = 100 * 1024;
// Colonnes reconnues (ordre libre) et longueur maximale de chaque cellule de texte
const COLONNES = {
  reference_produit: 30, quantite: 30, prix_achat_unitaire_fcfa: 30, valeur_fcfa: 30, date_reception: 30,
  fournisseur: 200, numero_piece: 60, lot_fournisseur: 60, conditionnement: 300, a_confirmer: 300,
  ligne_budgetaire: 20, creer_depense: 10, commentaire: 500
};
const OBLIGATOIRES = ['reference_produit', 'quantite', 'fournisseur', 'date_reception', 'valeur_fcfa'];
const cle = (nom) => normaliser(nom).replace(/\s/g, ''); // Sans casse, accents, espaces ni « _ »
const COLONNE_PAR_CLE = new Map(Object.keys(COLONNES).map(c => [cle(c), c]));
const arrondi2 = (n) => Math.round(n * 100) / 100;
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

// Séparateur détecté sur la première ligne : tabulation (copie d'Excel), tableau Markdown (« | »), sinon « ; »
function lireTableau(texte) {
  const lignes = texte.replace(/^﻿/, '').split(/\r?\n/);
  const premiere = lignes.find(l => l.trim()) || '';
  if (premiere.includes('\t')) return lireCsv(texte, '\t');
  if (premiere.trim().startsWith('|')) {
    // Ligne « |---|---| » ignorée ; « | » du début et de la fin retirés
    const md = lignes.filter(l => !/^[\s|:]*-{3,}[\s|:-]*$/.test(l)).map(l => l.trim().replace(/^\|/, '').replace(/\|$/, ''));
    return lireCsv(md.join('\n'), '|');
  }
  return lireCsv(texte, ';');
}

// AAAA-MM-JJ ou JJ/MM/AAAA -> date à midi, heure du Bénin (le jour ne change pas) ; null si illisible ou inexistante
function lireDate(t) {
  const fr = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  const iso = fr ? `${fr[3]}-${fr[2]}-${fr[1]}` : (/^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null);
  const d = iso ? new Date(`${iso}T12:00:00+01:00`) : null;
  return d && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? d : null;
}

/**
 * Import groupé d'entrées de stock. Tout s'exécute dans une transaction : contrôles en mémoire (produits, fournisseurs,
 * lignes budgétaires et dépenses des pièces lus une fois), puis, sans aucune erreur, les écritures de chaque lot
 * (enregistrerEntree). Simulation (appliquer = false) : transaction annulée. Une ligne en erreur : rien n'est enregistré.
 * Une pièce nouvelle sur plusieurs lignes donne une seule dépense, au total de la pièce, sans lotStockId.
 * @returns {{ statut: number, corps: object }}
 */
async function importerEntrees(req, texte, appliquer, session) {
  const [entete = [], ...donnees] = lireTableau(texte);

  // En-tête : colonnes connues, sans doublon, obligatoires présentes ; une colonne sans nom doit rester vide
  const colonnes = [];
  for (const nom of entete) {
    const colonne = nom ? COLONNE_PAR_CLE.get(cle(nom)) : null;
    if (nom && !colonne) return { statut: 400, corps: { message: `En-tête : colonne inconnue « ${nom.slice(0, 40)} ».` } };
    if (colonne && colonnes.includes(colonne)) return { statut: 400, corps: { message: `En-tête : colonne ${colonne} en double.` } };
    colonnes.push(colonne);
  }
  const absentes = OBLIGATOIRES.filter(c => !colonnes.includes(c));
  if (absentes.length) return { statut: 400, corps: { message: `En-tête : colonnes obligatoires absentes : ${absentes.join(', ')}.` } };
  if (!donnees.length) return { statut: 400, corps: { message: "Aucune ligne à importer sous les en-têtes." } };
  if (donnees.length > MAX_LIGNES) return { statut: 400, corps: { message: `${MAX_LIGNES} lignes au plus par import (${donnees.length} reçues).` } };

  const cellules = donnees.map(c => Object.fromEntries(colonnes.map((col, j) => [col, c[j] ?? '']).filter(([col]) => col)));
  const refs = [...new Set(cellules.map(v => v.reference_produit).filter(Boolean))];
  const pieces = [...new Set(cellules.map(v => v.numero_piece).filter(Boolean))];

  session.startTransaction();
  // Une lecture par liste (Atlas annule une transaction de plus de 60 s) ; uniquement des chaînes dans les filtres
  const produits = new Map((await Product.find({ deletedAt: null, reference: { $in: refs } }).session(session)).map(p => [p.reference, p]));
  const fournisseurs = new Map();
  for (const f of await Partner.find({ type: 'Fournisseur', actif: true, deletedAt: null }).session(session)) {
    const n = normaliser(f.nom);
    fournisseurs.set(n, fournisseurs.has(n) ? 'ambigu' : f);
  }
  const lignesBudget = new Set((await BudgetLine.find({ deletedAt: null }).select('code').session(session)).map(l => l.code));
  const depensesPiece = new Map();
  for (const d of pieces.length ? await Expense.find({ numeroPiece: { $in: pieces }, deletedAt: null }).session(session) : []) {
    if (!depensesPiece.has(d.numeroPiece)) depensesPiece.set(d.numeroPiece, d); // Comme depenseDeLaPiece : la première trouvée
  }

  // 1. Contrôles de chaque ligne
  const lignes = cellules.map((v, i) => {
    const r = { ligne: i + 2, statut: 'ok', messages: [], produit: null, quantite: null, prixAchat: null, valeur: null, numeroLot: null };
    const erreur = (m) => { r.statut = 'erreur'; r.messages.push(m); };
    if (donnees[i].some((x, j) => x !== '' && !colonnes[j])) erreur("Cellule hors des colonnes de l'en-tête.");
    for (const [c, max] of Object.entries(COLONNES)) if ((v[c] || '').length > max) erreur(`${c} : ${max} caractères au plus.`);

    const produit = produits.get(v.reference_produit) || null;
    r.produit = produit ? produit.name : (v.reference_produit || null);
    if (!v.reference_produit) erreur("Référence du produit manquante.");
    else if (!produit) erreur(`Produit ${v.reference_produit.slice(0, 30)} introuvable.`);

    let fiche = null;
    if (!v.fournisseur) erreur("Fournisseur manquant.");
    else if (normaliser(v.fournisseur) === normaliser(FOURNISSEUR_INTERNE)) erreur("« Production interne » refusé : passer par l'écran Transformation.");
    else {
      fiche = fournisseurs.get(normaliser(v.fournisseur)) || null;
      if (!fiche) erreur("Fournisseur introuvable ou inactif (voir Prestataires).");
      else if (fiche === 'ambigu') { fiche = null; erreur("Plusieurs fiches fournisseur portent ce nom (voir Prestataires)."); }
    }

    // Cellule vide = non renseigné (null) ; illisible ou négatif : erreur
    const nombre = (c, libelle) => {
      if (!v[c]) return null;
      const n = lireNombre(v[c]);
      if (Number.isFinite(n) && n >= 0) return n;
      erreur(`${libelle} : nombre positif attendu.`);
      return undefined;
    };
    const quantite = nombre('quantite', 'Quantité');
    const prix = nombre('prix_achat_unitaire_fcfa', "Prix d'achat unitaire");
    const valeur = nombre('valeur_fcfa', 'Valeur');
    if (valeur === null) erreur("Valeur du lot (valeur_fcfa) manquante.");
    if (quantite === 0) erreur("Quantité à 0.");
    if (quantite === null) {
      if (!v.a_confirmer) erreur("Lot à compter : indiquez ce qu'il faut compter (a_confirmer).");
      if (typeof prix === 'number') r.messages.push("Prix ignoré : un lot à compter prend son prix au comptage.");
    } else if (typeof quantite === 'number' && typeof prix === 'number' && typeof valeur === 'number' && Math.abs(quantite * prix - valeur) > 1) {
      erreur("Total incohérent : quantité × prix différent de la valeur de plus de 1 FCFA.");
    }
    r.quantite = quantite ?? null;
    r.valeur = valeur ?? null;
    if (quantite > 0) r.prixAchat = typeof prix === 'number' ? prix : (typeof valeur === 'number' ? arrondi2(valeur / quantite) : null);

    const date = v.date_reception ? lireDate(v.date_reception) : null;
    if (!v.date_reception) erreur("Date de réception manquante.");
    else if (!date) erreur("Date de réception illisible (AAAA-MM-JJ ou JJ/MM/AAAA).");

    if (v.ligne_budgetaire && !lignesBudget.has(v.ligne_budgetaire)) erreur(`La ligne budgétaire ${v.ligne_budgetaire.slice(0, 20)} n'existe pas.`);
    const creer = normaliser(v.creer_depense);
    if (!['', 'oui', 'non'].includes(creer)) erreur("creer_depense : oui ou non.");

    return Object.assign(r, { _v: v, _produit: produit, _fiche: fiche, _date: date, _creer: creer !== 'non' });
  });
  const avertir = (r, m) => { if (r.statut === 'ok') r.statut = 'avertissement'; r.messages.push(m); };

  // 2. Pièces : dépense existante (rattachement), une seule dépense pour une pièce nouvelle, ou aucune
  const depensesACreer = [];
  for (const piece of pieces) {
    const membres = lignes.filter(r => r._v.numero_piece === piece);
    const existante = depensesPiece.get(piece);
    const premiere = membres[0];
    if (!existante && membres.some(r => r._creer !== premiere._creer)) {
      for (const r of membres) { r.statut = 'erreur'; r.messages.push(`creer_depense doit être le même sur toutes les lignes de la pièce ${piece}.`); }
      continue;
    }
    // Référence de la pièce : la dépense existante, sinon la première ligne (celle qui crée la dépense)
    const partenaire = existante ? existante.partenaireId : premiere._fiche?._id;
    const ligneRef = existante ? existante.referenceLigne || '' : premiere._v.ligne_budgetaire || '';
    for (const r of membres) {
      if (r._fiche && partenaire && String(r._fiche._id) !== String(partenaire)) avertir(r, `Pièce ${piece} : fournisseur différent ${existante ? 'de celui de la dépense existante' : `de la ligne ${premiere.ligne}`}.`);
      if (r._v.ligne_budgetaire && r._v.ligne_budgetaire !== ligneRef && (existante || r !== premiere)) avertir(r, `Pièce ${piece} : ligne budgétaire différente de celle de la dépense (${ligneRef || 'exploitation'}).`);
      if (r.statut === 'erreur') continue; // rien n'est créé pour une ligne refusée
      if (existante) r.messages.push(`Rattachée à la dépense existante de la pièce ${piece}.`);
      else if (!premiere._creer) r.messages.push("Sans dépense.");
      else r.messages.push(membres.length > 1 ? `Une seule dépense pour la pièce ${piece} (${membres.length} lots).` : "Dépense créée.");
    }
    if (!existante && premiere._creer && membres.length > 1) depensesACreer.push({ piece, membres });
  }
  for (const r of lignes) if (!r._v.numero_piece && r.statut !== 'erreur') r.messages.push(r._creer ? "Dépense créée." : "Sans dépense.");

  // 3. Numéros de lot : genererNumeroLot (lots existants ce jour-là, archivés compris), puis lignes précédentes du collage
  const suivants = new Map();
  const numeros = new Set();
  for (const r of lignes) {
    if (r.statut === 'erreur') continue;
    const jour = r._date.toISOString().slice(0, 10);
    const groupe = `${r._produit.reference}|${jour}`;
    let numero;
    if (!suivants.has(groupe)) numero = await genererNumeroLot(r._produit, r._date, session);
    else { const { prefixe, n } = suivants.get(groupe); numero = prefixe + String(n + 1).padStart(2, '0'); }
    const coupure = numero.lastIndexOf('-') + 1;
    suivants.set(groupe, { prefixe: numero.slice(0, coupure), n: parseInt(numero.slice(coupure), 10) });
    if (numeros.has(numero)) { r.statut = 'erreur'; r.messages.push(`Numéro de lot ${numero} en double dans le collage.`); continue; }
    numeros.add(numero);
    r.numeroLot = numero;
  }

  const valides = lignes.filter(r => r.statut !== 'erreur');
  const resume = { lignes: lignes.length, totalFcfa: Math.round(valides.reduce((s, r) => s + r.valeur, 0)), lotsCrees: valides.length };
  const sortie = () => lignes.map(({ _v, _produit, _fiche, _date, _creer, ...r }) => r);
  if (valides.length < lignes.length) {
    await session.abortTransaction();
    const message = appliquer ? "L'import contient des erreurs : rien n'a été enregistré." : "Des lignes sont à corriger : rien ne peut encore être importé.";
    return { statut: appliquer ? 400 : 200, corps: { message, lignes: sortie(), resume: appliquer ? { ...resume, lotsCrees: 0 } : resume } };
  }

  // 4. Écritures (aussi en simulation, annulées à la fin) : dépenses des pièces de plusieurs lots, puis chaque lot
  for (const { piece, membres } of depensesACreer) {
    const montant = membres.reduce((s, r) => s + Math.round(r.valeur), 0);
    const premiere = membres[0];
    await creerDepenseAchat(req, {
      montant, ligneBudgetaire: premiere._v.ligne_budgetaire || '', partenaireId: premiere._fiche._id, numeroPiece: piece,
      // Logique de libelleAchat, pour plusieurs lots
      libelle: `Achat ${[...new Set(membres.map(r => r._produit.name))].join(', ')} - lots ${membres.map(r => r.numeroLot).join(', ')}`,
      resume: `Dépense créée par l'import de stock (pièce ${piece}, ${membres.length} lots) : ${montant} FCFA à payer à ${premiere._fiche.nom}`
    }, session);
  }
  const responsable = await nomResponsable(req);
  let comblees = 0;
  for (const r of lignes) {
    const v = r._v;
    const lot = new LotStockFifo({
      numeroLot: r.numeroLot,
      product: r._produit._id,
      quantiteInitiale: r.quantite,
      quantiteRestante: r.quantite,
      prixAchatUnitaire: r.prixAchat,
      valeurFcfa: r.valeur,
      fournisseurId: r._fiche._id,
      fournisseur: r._fiche.nom,
      dateReception: r._date,
      lotFournisseur: v.lot_fournisseur || '',
      conditionnement: v.conditionnement || '',
      aConfirmer: v.a_confirmer || '',
      numeroPiece: v.numero_piece || '',
      commentaire: v.commentaire || ''
    });
    const { combles } = await enregistrerEntree(req, lot, { produit: r._produit, responsable, creerDepense: r._creer, ligneBudgetaire: v.ligne_budgetaire || '', journal: false }, session);
    if (combles) { r.messages.push(`Entrée${combles}.`); comblees++; }
  }
  // Une seule ligne de journal pour les lots, sans montant ni texte collé (les dépenses créées ont la leur)
  await journaliser(req, { action: 'Import', entite: 'Lot de stock', resume: `Import de ${pluriel(lignes.length, 'lot')} (${pluriel(pieces.length, 'pièce')})` }, session);

  if (appliquer) await session.commitTransaction();
  else await session.abortTransaction();
  return {
    statut: appliquer ? 201 : 200,
    corps: {
      message: appliquer ? `${pluriel(lignes.length, 'lot')} importé${lignes.length > 1 ? 's' : ''}.${comblees ? ` Manques comblés sur ${pluriel(comblees, 'lot')}.` : ''}` : `Vérification terminée : ${pluriel(lignes.length, 'lot')} prêt${lignes.length > 1 ? 's' : ''} à importer.`,
      lignes: sortie(),
      resume
    }
  };
}

module.exports = { enregistrerEntree, importerEntrees, MAX_OCTETS };
