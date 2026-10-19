// Outil de saisie des achats par l'API du back-office : catalogue, factures d'achat, transformations, contrôle.
// Aucun accès direct à la base : tout passe par l'API, avec un compte de l'équipe (admin pour écrire), donc par les
// mêmes contrôles et le même journal que l'écran d'administration. Node 22 ou plus (fetch natif).
// Simulation par défaut ; --appliquer pour écrire. Relancer une saisie reprend là où elle s'est arrêtée.
// `facture` accepte plusieurs fiches : toutes contrôlées avant toute écriture, puis écrites une par une.
// Les fiches JSON (données réelles : fournisseurs, montants, numéros) restent dans docs-internes/, exclu de Git.
// Identifiants : demandés dans le terminal (mot de passe masqué) ; SAISIE_EMAIL et SAISIE_MOT_DE_PASSE seulement pour
// les tests locaux. Le cookie de session reste en mémoire : jamais affiché ni écrit.
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { TYPES_PRODUIT, STATUTS_PRODUIT, FAMILLES } = require('../models/product'); // Constantes seulement : aucune connexion
const { MODES_PAIEMENT_PRESTATAIRE } = require('../models/partner');
const { MODES_PAIEMENT_DEPENSE } = require('../config/convention');
const { lireCsv, lireNombre } = require('../utils/csv');
const { normaliser } = require('../utils/texte');
const { lireDate } = require('../utils/dates');
const { moisProjet } = require('../services/financeService'); // Mois du projet (du 26 au 25) : même calcul que le serveur

const API_DEFAUT = 'https://api.ahitchebj.com';
const SOURCE_SUBVENTION = 'Subvention N°171';
const TYPES_COMMANDE = ['Achat direct', 'Bon de commande'];
const MAX_LIGNES = 100; // Lignes d'une facture : même limite que l'API (marge pour les 60 s des transactions Atlas)

const AIDE = `Saisie des achats par l'API du back-office (simulation par défaut, --appliquer pour écrire).

Usage :
  node src/scripts/saisirFacture.js <commande> [arguments] [--api <url>] [--appliquer]

Commandes :
  catalogue <fichier.json>
      Crée ou met à jour des produits (par référence), crée les catégories absentes, archive des produits.
      { "categories": ["Emballages"],
        "produits": [{ "reference": "EMB01", "name": "Sachet exemple", "unit": "unité", "type": "fourniture",
                       "categorie": "Emballages", "priceUnit": null, "statut": "indisponible" }],
        "archiver": ["V99"] }

  facture <fiche1.json> [fiche2.json …] [--lignes <chemin de 07_budget_lignes.csv>]
      Pour chaque fiche, dans cet ordre : fournisseur, dépense payée, bon de commande et réception (un lot par
      ligne). Exemple fictif de fiche : voir la fin de cette aide.
      Plusieurs fiches : une seule connexion, fiches traitées dans l'ordre donné.
        1. Toutes les fiches sont contrôlées avant toute écriture, puis entre elles : pas deux fois le même
           numéro de facture, le même numéro de lot, ni la même référence de bon pour deux factures.
           Une dépense à créer dont le paiement tombe dans un mois du projet clos est refusée dès le contrôle.
        2. Sans --appliquer : plan de chaque fiche et bilan (prête / déjà saisie / erreurs) ; code 1 si une
           fiche est en erreur.
        3. Avec --appliquer : une seule fiche en erreur et rien n'est écrit, pour aucune fiche. Sinon les fiches
           sont écrites une par une ; les fiches déjà saisies sont signalées et sautées. Si une écriture échoue,
           l'outil s'arrête, dit ce qui est fait et ce qui reste ; relancer la même commande reprend sans doublon.
      Usage conseillé : une commande de simulation, puis la même avec --appliquer.
        node src/scripts/saisirFacture.js facture fiches\\FAC-0001.json fiches\\FAC-0002.json
        node src/scripts/saisirFacture.js facture fiches\\FAC-0001.json fiches\\FAC-0002.json --appliquer

  transformation --matiere <REF> --quantite <n> --produit <REF> --obtenu <n> --date AAAA-MM-JJ
                 [--lot <numéro>] [--commentaire "…"]
      Sortie FIFO de la matière, entrée du produit obtenu (lot « Production interne »).

  controle [--depuis AAAA-MM-JJ]
      Lecture seule : bons au nouveau format, lots rattachés (alimentaire / emballages), dépenses par pièce,
      lots à compter.

Options :
  --api <url>     adresse de l'API (défaut : ${API_DEFAUT} ; http seulement vers localhost)
  --appliquer     écrit (sans cette option : simulation, rien n'est enregistré)
  --aide          affiche cette aide

Fiche facture (valeurs fictives) :
  { "fournisseur": { "nom": "Fournisseur Exemple", "ifu": "0000000000000", "rccm": "RB/COT/00 A 0000",
                     "telephone": "", "adresse": "", "modePaiement": "Mobile Money" },
    "facture": { "numero": "FAC-0001", "date": "2026-10-01", "totalTtc": 1000, "mecef": "", "references": [] },
    "paiement": { "mode": "Mobile Money (Flooz)", "date": "2026-10-01", "reference": "TXN-0001" },
    "commande": { "type": "Achat direct", "reference": "", "date": "" },
    "reception": { "date": "2026-10-02" },
    "financement": { "source": "${SOURCE_SUBVENTION}", "ligne": "L0", "sousLigne": "" },
    "depense": { "libelle": "Achat exemple", "pieceAttendue": ["FAC-0001.pdf"] },
    "commentaire": "",
    "lignes": [{ "designation": "Produit exemple 1 L", "quantiteFacture": "1 carton", "montant": 1000,
                 "produit": "EMB01", "unite": "unité", "quantite": 10, "detailQuantite": "10 unités",
                 "prixAchat": 100, "lotFournisseur": "", "numeroLot": "" }] }

Identifiants : demandés dans le terminal (mot de passe masqué). Un compte admin est exigé pour écrire.`;

// ------------------------------------------------------------------
// Utilitaires
// ------------------------------------------------------------------

class ErreurApi extends Error {
  constructor(statut, message) { super(message); this.statut = statut; }
}

const fmt = (n) => `${Number(n ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA`;
const nb = (n) => Number(n ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 3 });
const arrondi2 = (n) => Math.round(n * 100) / 100;
const chiffres = (s) => String(s ?? '').replace(/\D/g, '');
const txt = (v) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const objet = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const dateIso = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) && lireDate(v.trim()) ? v.trim() : null);
const nomProduit = (p) => [p.reference, p.name].filter(Boolean).join(' · ');

// Nombre d'une fiche : nombre ou texte numérique, fini ; NaN sinon (Infinity, 1e999, objet, tableau)
function nombre(v) {
  let n = NaN;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && v.trim() !== '') n = lireNombre(v);
  return Number.isFinite(n) ? n : NaN;
}

function lireJson(chemin) {
  if (!chemin) throw new Error('Indiquez le fichier JSON.');
  if (!fs.existsSync(chemin)) throw new Error(`Fichier absent : ${chemin}`);
  try {
    return JSON.parse(fs.readFileSync(chemin, 'utf8').replace(/^﻿/, ''));
  } catch (error) {
    throw new Error(`Fichier JSON illisible (${chemin}) : ${error.message}`);
  }
}

// Arguments : commande, valeurs positionnelles, options --nom valeur et drapeaux
function lireArguments(argv) {
  const DRAPEAUX = ['--appliquer', '--aide', '--help', '-h'];
  const options = {}, positions = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (DRAPEAUX.includes(a)) options[a.replace(/^-+/, '')] = true;
    else if (a.startsWith('--')) {
      const valeur = argv[i + 1];
      if (valeur === undefined || valeur.startsWith('--')) throw new Error(`${a} attend une valeur.`);
      options[a.slice(2)] = valeur;
      i++;
    } else positions.push(a);
  }
  return { commande: positions[0], positions: positions.slice(1), options };
}

// ------------------------------------------------------------------
// Saisie dans le terminal
// ------------------------------------------------------------------

function demander(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('SIGINT', () => { rl.close(); process.stdout.write('\n'); process.exit(130); });
    rl.question(question, (reponse) => { rl.close(); resolve(reponse.trim()); });
  });
}

// Mot de passe : saisie brute, une étoile par caractère (cmd sous Windows compris)
function demanderMasque(question) {
  return new Promise((resolve, reject) => {
    const entree = process.stdin;
    let saisie = '';
    const terminer = () => {
      entree.removeListener('data', surTouche);
      entree.setRawMode(false);
      entree.pause();
      process.stdout.write('\n');
    };
    const surTouche = (morceau) => {
      for (const c of morceau) {
        if (c === '\r' || c === '\n') { terminer(); resolve(saisie); return; }
        if (c === '\u0003') { terminer(); reject(new Error('Saisie interrompue.')); return; }
        if (c === '\u0008' || c === '\u007f') {
          if (saisie.length) { saisie = saisie.slice(0, -1); process.stdout.write('\b \b'); }
          continue;
        }
        if (c === '\u001b') return; // Flèches et autres séquences d'échappement : ignorées
        if (c < ' ') continue;
        saisie += c;
        process.stdout.write('*');
      }
    };
    process.stdout.write(question);
    entree.setEncoding('utf8');
    entree.setRawMode(true);
    entree.resume();
    entree.on('data', surTouche);
  });
}

// ------------------------------------------------------------------
// Client de l'API : cookie de session en mémoire, mis à jour à chaque set-cookie
// ------------------------------------------------------------------

function creerClient(base) {
  let jeton = null;

  async function appeler(methode, chemin, corps) {
    let reponse;
    try {
      reponse = await fetch(base + chemin, {
        method: methode,
        headers: {
          Accept: 'application/json',
          ...(corps !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(jeton ? { Cookie: `token=${jeton}` } : {})
        },
        body: corps !== undefined ? JSON.stringify(corps) : undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(60000)
      });
    } catch (error) {
      throw new ErreurApi(0, `API injoignable (${base}) : ${error.cause?.code || error.message}`);
    }
    for (const cookie of reponse.headers.getSetCookie()) {
      const m = /^token=([^;]*)/.exec(cookie);
      if (m) jeton = m[1] || null;
    }
    const brut = await reponse.text();
    let donnees = null;
    try { donnees = brut ? JSON.parse(brut) : null; } catch { donnees = null; }
    if (!reponse.ok) {
      const message = donnees?.message || `réponse HTTP ${reponse.status}`;
      throw new ErreurApi(reponse.status, reponse.status === 401 ? `Session refusée ou expirée (${message}) : relancez l'outil.` : message);
    }
    return donnees;
  }

  return {
    get: (chemin) => appeler('GET', chemin),
    post: (chemin, corps) => appeler('POST', chemin, corps ?? {}),
    put: (chemin, corps) => appeler('PUT', chemin, corps ?? {}),
    del: (chemin) => appeler('DELETE', chemin)
  };
}

// Toutes les pages d'une liste paginée de l'API
async function tout(client, chemin, cle, params = {}) {
  const resultats = [];
  for (let page = 1; page <= 500; page++) {
    const qs = new URLSearchParams({ ...params, page: String(page), limit: '100' });
    const r = await client.get(`${chemin}?${qs}`);
    resultats.push(...(r?.[cle] || []));
    if (!r?.hasMore) break;
  }
  return resultats;
}

function adresseApi(valeur) {
  let url;
  try { url = new URL(valeur || API_DEFAUT); } catch { throw new Error(`Adresse de l'API invalide : ${valeur}`); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error("L'API doit être en https (http seulement vers localhost) : le mot de passe ne circule jamais en clair.");
  }
  return url.origin;
}

async function connecter(client, { adminRequis }) {
  let email = process.env.SAISIE_EMAIL;
  let motDePasse = process.env.SAISIE_MOT_DE_PASSE;
  if (!(email && motDePasse)) {
    if (!process.stdin.isTTY) {
      throw new Error("Entrée non interactive : lancez l'outil dans un terminal pour saisir l'e-mail et le mot de passe (SAISIE_EMAIL et SAISIE_MOT_DE_PASSE sont réservées aux tests locaux).");
    }
    email = await demander('E-mail : ');
    motDePasse = await demanderMasque('Mot de passe : ');
  }
  const r = await client.post('/api/auth/login', { email, password: motDePasse });
  motDePasse = null;
  const utilisateur = r?.user || {};
  if (adminRequis && utilisateur.role !== 'admin') {
    throw new Error(`Ce compte a le rôle « ${utilisateur.role || 'inconnu'} » : la saisie des achats exige un compte admin.`);
  }
  console.log(`Connecté : ${utilisateur.username || utilisateur.email} (${utilisateur.role}).`);
  return utilisateur;
}

function afficherErreurs(erreurs) {
  console.error(`\n❌ ${erreurs.length} contrôle(s) en échec, rien n'a été écrit :`);
  for (const e of erreurs) console.error(`  - ${e}`);
  process.exitCode = 1;
}

// ------------------------------------------------------------------
// a) catalogue <fichier.json>
// ------------------------------------------------------------------

async function commandeCatalogue(client, chemin, appliquer) {
  const fiche = objet(lireJson(chemin));
  const erreurs = [];
  const liste = (cle) => {
    if (fiche[cle] === undefined) return [];
    if (!Array.isArray(fiche[cle])) { erreurs.push(`« ${cle} » doit être une liste.`); return []; }
    return fiche[cle];
  };
  const categoriesFiche = liste('categories').map(txt).filter(Boolean);
  const produitsFiche = liste('produits');
  const aArchiver = [...new Set(liste('archiver').map(r => txt(r).toUpperCase()).filter(Boolean))];

  // Forme des produits
  const vus = new Set();
  const produits = [];
  produitsFiche.forEach((p, i) => {
    const nom = `Produit ${i + 1}`;
    if (!p || typeof p !== 'object') { erreurs.push(`${nom} : objet attendu.`); return; }
    const reference = txt(p.reference).toUpperCase();
    if (!reference) { erreurs.push(`${nom} : référence obligatoire.`); return; }
    if (vus.has(reference)) { erreurs.push(`${reference} : en double dans le fichier.`); return; }
    vus.add(reference);
    const champs = {};
    for (const cle of ['name', 'unit', 'categorie']) {
      if (p[cle] === undefined) continue;
      if (!txt(p[cle])) erreurs.push(`${reference} : « ${cle} » vide.`); else champs[cle] = txt(p[cle]);
    }
    if (p.type !== undefined) { if (!TYPES_PRODUIT.includes(p.type)) erreurs.push(`${reference} : type « ${p.type} » inconnu (${TYPES_PRODUIT.join(', ')}).`); else champs.type = p.type; }
    if (p.statut !== undefined) { if (!STATUTS_PRODUIT.includes(p.statut)) erreurs.push(`${reference} : statut « ${p.statut} » inconnu.`); else champs.statut = p.statut; }
    if (p.priceUnit !== undefined) {
      if (p.priceUnit === null || p.priceUnit === '') champs.priceUnit = null;
      else if (!(nombre(p.priceUnit) >= 0)) erreurs.push(`${reference} : priceUnit invalide.`);
      else champs.priceUnit = nombre(p.priceUnit);
    }
    if (aArchiver.includes(reference)) erreurs.push(`${reference} : à la fois dans « produits » et dans « archiver ».`);
    produits.push({ reference, champs });
  });

  const [enBase, categoriesBase, inventaire] = await Promise.all([
    tout(client, '/api/admin/products', 'products'),
    tout(client, '/api/admin/categories', 'categories'),
    client.get('/api/admin/inventory/global')
  ]);
  const parRef = new Map(enBase.filter(p => p.reference).map(p => [p.reference.toUpperCase(), p]));
  const categorieParNom = new Map(categoriesBase.map(c => [normaliser(c.name), c]));
  const categoriesACreer = [...new Map(categoriesFiche.filter(n => !categorieParNom.has(normaliser(n))).map(n => [normaliser(n), n])).values()];
  const categoriesConnues = new Set([...categorieParNom.keys(), ...categoriesACreer.map(normaliser)]);
  const stockParProduit = new Map((inventaire || []).map(i => [String(i.productId), i]));

  const plan = [];
  for (const { reference, champs } of produits) {
    if (champs.categorie && !categoriesConnues.has(normaliser(champs.categorie))) {
      erreurs.push(`${reference} : catégorie « ${champs.categorie} » inconnue : ajoutez-la à « categories ».`);
    }
    const existant = parRef.get(reference);
    if (!existant) {
      const manque = ['name', 'unit', 'type'].filter(c => !champs[c]);
      if (manque.length) erreurs.push(`${reference} : produit à créer, champ(s) obligatoire(s) manquant(s) : ${manque.join(', ')}.`);
      plan.push({ action: 'créer', reference, champs, detail: `${champs.name || '?'} (${champs.type || '?'}, ${champs.unit || '?'})` });
      continue;
    }
    if (champs.name !== undefined && normaliser(champs.name) !== normaliser(existant.name)) {
      erreurs.push(`${reference} : référence déjà portée par « ${existant.name} » (le fichier dit « ${champs.name} ») : arrêt.`);
      continue;
    }
    const changements = [];
    const comparer = (libelle, avant, apres) => { if ((avant ?? null) !== (apres ?? null)) changements.push(`${libelle} : ${avant ?? 'vide'} → ${apres ?? 'vide'}`); };
    if (champs.name !== undefined) comparer('nom', existant.name, champs.name);
    if (champs.unit !== undefined) comparer('unité', existant.unit, champs.unit);
    if (champs.type !== undefined) comparer('type', existant.type, champs.type);
    if (champs.statut !== undefined) comparer('statut', existant.statut, champs.statut);
    if (champs.priceUnit !== undefined) comparer('prix', existant.priceUnit, champs.priceUnit);
    if (champs.categorie !== undefined && normaliser(existant.category?.name || '') !== normaliser(champs.categorie)) {
      changements.push(`catégorie : ${existant.category?.name || 'vide'} → ${champs.categorie}`);
    }
    plan.push({ action: changements.length ? 'modifier' : 'rien à faire', reference, champs, existant, detail: changements.length ? changements.join(' ; ') : existant.name });
  }
  for (const reference of aArchiver) {
    const existant = parRef.get(reference);
    if (!existant) { plan.push({ action: 'rien à faire', reference, detail: 'absent du catalogue actif (déjà archivé ?)' }); continue; }
    const stock = stockParProduit.get(String(existant._id));
    const lotsActifs = (stock?.nbLotsActifs || 0) + (stock?.lotsACompter || 0);
    if (lotsActifs) erreurs.push(`${reference} : ${lotsActifs} lot(s) encore en stock : archivage refusé.`);
    plan.push({ action: 'archiver', reference, existant, detail: existant.name });
  }

  console.log('\nCatalogue :');
  for (const nom of categoriesACreer) console.log(`  ${'créer'.padEnd(13)} catégorie « ${nom} »`);
  for (const l of plan) console.log(`  ${l.action.padEnd(13)} ${l.reference} · ${l.detail}`);
  if (!plan.length && !categoriesACreer.length) console.log('  (rien dans le fichier)');

  if (erreurs.length) return afficherErreurs(erreurs);
  if (!appliquer) { console.log('\n🔎 SIMULATION : rien n\'a été écrit. Relancez avec --appliquer pour enregistrer.'); return; }

  // Écritures, dans l'ordre : catégories, produits créés ou modifiés, archivages
  const faits = [];
  try {
    for (const nom of categoriesACreer) {
      const c = await client.post('/api/admin/categories', { name: nom });
      categorieParNom.set(normaliser(nom), c);
      faits.push(`catégorie « ${nom} » créée`);
    }
    const idCategorie = (nom) => categorieParNom.get(normaliser(nom))?._id ?? null;
    for (const l of plan) {
      if (l.action === 'créer') {
        const c = l.champs;
        await client.post('/api/admin/products', {
          reference: l.reference, name: c.name, unit: c.unit, type: c.type,
          ...(c.statut ? { statut: c.statut } : {}), priceUnit: c.priceUnit ?? null,
          category: c.categorie ? idCategorie(c.categorie) : null, quantites: {}
        });
        faits.push(`${l.reference} créé`);
      } else if (l.action === 'modifier') {
        // L'API attend le produit entier : on repart de la fiche en base et on remplace les seuls champs donnés
        const e = l.existant, c = l.champs;
        await client.put(`/api/admin/products/${e._id}`, {
          reference: e.reference, name: c.name ?? e.name, unit: c.unit ?? e.unit, type: c.type ?? e.type,
          statut: c.statut ?? e.statut, quantites: e.quantites || {},
          category: c.categorie !== undefined ? idCategorie(c.categorie) : (e.category?._id ?? e.category ?? null),
          compositionRule: e.compositionRule?._id ?? e.compositionRule ?? null,
          priceUnit: c.priceUnit !== undefined ? c.priceUnit : (e.priceUnit ?? null),
          seuilAlerte: e.seuilAlerte ?? null, commentaire: e.commentaire || ''
        });
        faits.push(`${l.reference} modifié`);
      } else if (l.action === 'archiver') {
        await client.del(`/api/admin/products/${l.existant._id}`);
        faits.push(`${l.reference} archivé`);
      }
    }
  } catch (error) {
    console.error(`\n❌ Arrêt : ${error.message}`);
    if (faits.length) console.error(`Déjà enregistré : ${faits.join(', ')}. Relancez la commande pour reprendre.`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n✅ CATALOGUE APPLIQUÉ : ${faits.length ? faits.join(', ') : 'rien à faire'}.`);
}

// ------------------------------------------------------------------
// b) facture <fichier.json> [--lignes 07_budget_lignes.csv]
// ------------------------------------------------------------------

// Contrôles 1 et 2 : champs requis, dates, nombres, cohérence des montants
function analyserFiche(fiche, erreurs) {
  const f = objet(fiche);
  const fournisseur = objet(f.fournisseur), facture = objet(f.facture), paiement = objet(f.paiement);
  const commande = objet(f.commande), reception = objet(f.reception), financement = objet(f.financement), depense = objet(f.depense);
  const requis = (valeur, libelle, max = 300) => {
    const v = txt(valeur);
    if (!v) erreurs.push(`${libelle} : obligatoire.`);
    else if (v.length > max) erreurs.push(`${libelle} : ${max} caractères au plus.`);
    return v;
  };
  const date = (valeur, libelle) => {
    const v = dateIso(valeur);
    if (!v) erreurs.push(`${libelle} : date obligatoire au format AAAA-MM-JJ${txt(valeur) ? ` (« ${txt(valeur)} » invalide)` : ''}.`);
    return v;
  };
  const positif = (valeur, libelle) => {
    const n = nombre(valeur);
    if (!(Number.isFinite(n) && n > 0)) erreurs.push(`${libelle} : nombre supérieur à 0 obligatoire.`);
    return n;
  };

  const r = {
    fournisseur: {
      nom: requis(fournisseur.nom, 'fournisseur.nom', 200), ifu: txt(fournisseur.ifu), rccm: txt(fournisseur.rccm),
      telephone: txt(fournisseur.telephone), adresse: txt(fournisseur.adresse), modePaiement: txt(fournisseur.modePaiement)
    },
    facture: {
      numero: requis(facture.numero, 'facture.numero', 60), date: date(facture.date, 'facture.date'),
      totalTtc: positif(facture.totalTtc, 'facture.totalTtc'), mecef: txt(facture.mecef),
      references: Array.isArray(facture.references) ? facture.references.map(txt).filter(Boolean) : []
    },
    paiement: { date: date(paiement.date, 'paiement.date'), reference: txt(paiement.reference) },
    commande: { type: txt(commande.type), reference: txt(commande.reference), date: null },
    reception: { date: date(reception.date, 'reception.date') },
    financement: { source: txt(financement.source) || SOURCE_SUBVENTION, ligne: requis(financement.ligne, 'financement.ligne', 20), sousLigne: txt(financement.sousLigne) },
    depense: {
      libelle: requis(depense.libelle, 'depense.libelle'),
      fichiersAttendus: (Array.isArray(depense.pieceAttendue) ? depense.pieceAttendue : [depense.pieceAttendue]).map(txt).filter(Boolean)
    },
    commentaire: txt(f.commentaire),
    lignes: []
  };

  if (r.fournisseur.modePaiement && !MODES_PAIEMENT_PRESTATAIRE.includes(r.fournisseur.modePaiement)) {
    erreurs.push(`fournisseur.modePaiement : « ${r.fournisseur.modePaiement} » inconnu (${MODES_PAIEMENT_PRESTATAIRE.join(', ')}).`);
  }
  if (r.fournisseur.ifu && chiffres(r.fournisseur.ifu).length < 9) erreurs.push(`fournisseur.ifu : « ${r.fournisseur.ifu} » illisible (13 chiffres pour un IFU du Bénin).`);
  // « Mobile Money (Flooz) » : mode « Mobile Money », détail « Flooz »
  const mode = /^([^(]+?)\s*(?:\(([^)]*)\))?$/.exec(txt(paiement.mode));
  r.paiement.mode = mode ? mode[1].trim() : '';
  r.paiement.detail = mode?.[2]?.trim() || '';
  if (!MODES_PAIEMENT_DEPENSE.includes(r.paiement.mode)) erreurs.push(`paiement.mode : obligatoire (${MODES_PAIEMENT_DEPENSE.join(', ')}).`);
  if (!TYPES_COMMANDE.includes(r.commande.type)) erreurs.push(`commande.type : « Achat direct » ou « Bon de commande ».`);
  if (r.commande.type === 'Bon de commande') {
    requis(commande.reference, 'commande.reference (référence du bon signé)', 60);
    r.commande.date = date(commande.date, 'commande.date');
  } else {
    r.commande.date = txt(commande.date) ? date(commande.date, 'commande.date') : r.facture.date;
  }
  if (r.financement.source !== SOURCE_SUBVENTION) erreurs.push(`financement.source : seule la « ${SOURCE_SUBVENTION} » est gérée par l'outil.`);
  if (!r.depense.fichiersAttendus.length) erreurs.push('depense.pieceAttendue : au moins un nom de fichier.');

  if (!Array.isArray(f.lignes) || !f.lignes.length) erreurs.push('lignes : au moins une ligne.');
  // Même limite que l'API (bon et réception), vérifiée avant toute écriture
  else if (f.lignes.length > MAX_LIGNES) erreurs.push(`lignes : ${MAX_LIGNES} au plus par facture (${f.lignes.length} dans la fiche).`);
  const numerosLot = new Set();
  (Array.isArray(f.lignes) ? f.lignes : []).forEach((brute, i) => {
    const l = objet(brute);
    const nom = `Ligne ${i + 1}`;
    const ligne = {
      rang: i + 1,
      designation: requis(l.designation, `${nom} : designation`), quantiteFacture: txt(l.quantiteFacture),
      montant: positif(l.montant, `${nom} : montant`), produit: requis(l.produit, `${nom} : produit (référence)`).toUpperCase(),
      unite: requis(l.unite, `${nom} : unite`), quantite: positif(l.quantite, `${nom} : quantite`),
      detailQuantite: txt(l.detailQuantite), prixAchat: positif(l.prixAchat, `${nom} : prixAchat`),
      lotFournisseur: txt(l.lotFournisseur), numeroLot: txt(l.numeroLot)
    };
    // Écart toléré : 1 FCFA, comparé après arrondi au centime (0,7 × 90 = 62,999… contre 64 passe)
    if ([ligne.montant, ligne.quantite, ligne.prixAchat].every(n => n > 0) && Math.abs(Math.round((ligne.quantite * ligne.prixAchat - ligne.montant) * 100) / 100) > 1) {
      erreurs.push(`${nom} : ${nb(ligne.quantite)} × ${fmt(ligne.prixAchat)} = ${fmt(ligne.quantite * ligne.prixAchat)}, différent du montant ${fmt(ligne.montant)} (écart toléré : 1 FCFA).`);
    }
    if (ligne.numeroLot) {
      if (numerosLot.has(ligne.numeroLot)) erreurs.push(`${nom} : numéro de lot ${ligne.numeroLot} en double dans la fiche.`);
      numerosLot.add(ligne.numeroLot);
    }
    r.lignes.push(ligne);
  });
  const somme = arrondi2(r.lignes.reduce((s, l) => s + (l.montant > 0 ? l.montant : 0), 0));
  if (r.facture.totalTtc > 0 && r.lignes.length && somme !== arrondi2(r.facture.totalTtc)) {
    erreurs.push(`Somme des lignes ${fmt(somme)} différente du total TTC ${fmt(r.facture.totalTtc)}.`);
  }
  return r;
}

// Lignes budgétaires du fichier 07 (code ; libellé ; prévu USD ; prévu FCFA [; categorie_ad ; passation])
function lignesDuCsv(chemin) {
  if (!fs.existsSync(chemin)) throw new Error(`Fichier absent : ${chemin}`);
  const [entete, ...lignes] = lireCsv(fs.readFileSync(chemin, 'utf8'));
  const colonnes = (entete || []).map(c => normaliser(c));
  const col = (...noms) => colonnes.findIndex(c => noms.includes(c));
  const i = { code: col('code'), libelle: col('libelle'), usd: col('prevu usd'), fcfa: col('prevu fcfa'), categorie: col('categorie ad', 'categoriead'), passation: col('passation') };
  if (i.code < 0 || i.libelle < 0) throw new Error(`${chemin} : colonnes « code » et « libellé » attendues.`);
  return new Map(lignes.map(l => {
    const cellule = (k) => (i[k] >= 0 ? (l[i[k]] ?? '').trim() : '');
    const categorie = Number(cellule('categorie'));
    return [cellule('code'), {
      code: cellule('code'), libelle: cellule('libelle'),
      montantPrevuUsd: lireNombre(cellule('usd')), montantPrevuFcfa: lireNombre(cellule('fcfa')),
      categorieAd: [1, 2].includes(categorie) ? categorie : null, passation: cellule('passation')
    }];
  }).filter(([code]) => code));
}

// « AAAA-MM-JJ » -> « JJ/MM/AAAA »
const dateFr = (iso) => iso.split('-').reverse().join('/');

// Mois du projet clos, lus une seule fois par lancement par l'API (seulement si une fiche doit créer sa dépense).
// Lecture refusée ou impossible : erreur de contrôle (on ne sait pas vérifier, donc rien ne sera écrit).
function clotures(client, ctx) {
  if (!ctx.clotures) {
    ctx.clotures = client.get('/api/admin/finances/clotures')
      .then(liste => ({ clos: new Set((Array.isArray(liste) ? liste : []).filter(m => m.close).map(m => m.mois)), erreur: null }))
      .catch(error => ({
        clos: null,
        erreur: `Clôtures des mois du projet illisibles (${error.statut === 403 ? 'lecture refusée pour ce compte, 403' : error.message}) : impossible de vérifier que le mois du paiement n'est pas clos.`
      }));
  }
  return ctx.clotures;
}

// Fournisseur d'une fiche : par IFU (chiffres seuls, fiches Fournisseur), sinon par nom exact (casse ignorée).
// `prestataires` contient aussi les fournisseurs que les fiches précédentes du lancement vont créer (aCreerPar).
function resoudreFournisseur(fiche, prestataires, erreurs, infos) {
  let fournisseur = null, trouvePar = null;
  const ifu = chiffres(fiche.fournisseur.ifu);
  if (ifu.length >= 9) {
    const parIfu = prestataires.filter(p => p.type === 'Fournisseur' && chiffres(p.ifuRccm).includes(ifu));
    if (parIfu.length > 1) erreurs.push(`Fournisseur : l'IFU ${ifu} figure sur plusieurs fiches (${parIfu.map(p => p.nom).join(', ')}).`);
    else if (parIfu.length === 1) { fournisseur = parIfu[0]; trouvePar = 'IFU'; }
  }
  if (!fournisseur && !erreurs.some(e => e.startsWith('Fournisseur :')) && fiche.fournisseur.nom) {
    const parNom = prestataires.filter(p => p.nom.trim().toLowerCase() === fiche.fournisseur.nom.toLowerCase());
    if (parNom.length && parNom[0].type !== 'Fournisseur') {
      erreurs.push(`Fournisseur : « ${parNom[0].nom} » existe comme prestataire de type ${parNom[0].type} : passez sa fiche en Fournisseur.`);
    } else if (parNom.length) { fournisseur = parNom[0]; trouvePar = 'nom'; }
  }
  if (fournisseur && fournisseur.actif === false) erreurs.push(`Fournisseur « ${fournisseur.nom} » : fiche inactive, réactivez-la dans Prestataires.`);
  if (fournisseur && trouvePar === 'IFU' && normaliser(fournisseur.nom) !== normaliser(fiche.fournisseur.nom)) {
    infos.push(`Fournisseur trouvé par IFU : fiche « ${fournisseur.nom} » (nom sur la facture : « ${fiche.fournisseur.nom} »).`);
  }
  if (fournisseur && trouvePar === 'nom' && ifu && chiffres(fournisseur.ifuRccm) && !chiffres(fournisseur.ifuRccm).includes(ifu)) {
    infos.push(`Attention : la fiche « ${fournisseur.nom} » porte un autre IFU que la facture.`);
  }
  return { fournisseur, trouvePar };
}

/**
 * Contrôles d'une fiche, sans aucune écriture (contrôles 1 à 7). Renvoie
 * { nom, chemin, numero, deja, erreurs, infos, plan } ; plan : tout ce qu'il faut pour écrire la fiche.
 * ctx : données lues une fois pour tout le lancement (produits, prestataires, lignes budgétaires, CSV des lignes),
 * complétées au fil des fiches par ce que les fiches précédentes vont créer (fournisseur, ligne budgétaire).
 */
async function controlerFiche(client, chemin, ctx) {
  const c = { nom: path.basename(chemin), chemin, numero: null, deja: null, erreurs: [], infos: [], plan: null };
  let brut;
  try { brut = lireJson(chemin); } catch (error) { c.erreurs.push(error.message); return c; }
  const { erreurs, infos } = c;
  const fiche = analyserFiche(brut, erreurs);
  const numero = fiche.facture.numero;
  c.numero = numero || null;
  const achatDirect = fiche.commande.type === 'Achat direct';
  const numeroBonAttendu = achatDirect ? `Achat direct – facture n° ${numero}` : fiche.commande.reference;

  // 6 (d'abord) : facture déjà saisie et reçue -> rien à faire pour cette fiche
  let bon = null;
  if (numero) {
    const bons = (await tout(client, '/api/admin/bons-commande', 'bonsCommande', { search: numero })).filter(b => b.numeroFacture === numero);
    if (bons.length > 1) erreurs.push(`Plusieurs bons actifs portent la facture ${numero} : ${bons.map(b => b.numeroBon).join(', ')}.`);
    bon = bons[0] || null;
    if (bon?.statut === 'Reçu') { c.deja = bon; return c; }
  }

  // 3. Produits : référence active, même unité
  for (const l of fiche.lignes) {
    l.produitBase = ctx.parRef.get(l.produit) || null;
    if (l.produit && !l.produitBase) erreurs.push(`Ligne ${l.rang} : produit ${l.produit} introuvable dans le catalogue actif.`);
    else if (l.produitBase && l.unite && l.produitBase.unit !== l.unite) {
      erreurs.push(`Ligne ${l.rang} : unité « ${l.unite} » différente de celle du produit ${l.produit} (« ${l.produitBase.unit} »).`);
    }
  }

  // 4. Fournisseur : trouvé, à créer par une fiche précédente du lancement, ou à créer par celle-ci
  let { fournisseur, trouvePar } = resoudreFournisseur(fiche, ctx.prestataires, erreurs, infos);
  if (!fournisseur && !erreurs.some(e => e.startsWith('Fournisseur :')) && fiche.fournisseur.nom) {
    const ifuRccm = [fiche.fournisseur.ifu, fiche.fournisseur.rccm ? `RCCM ${fiche.fournisseur.rccm}` : ''].filter(Boolean).join(' / ');
    fournisseur = { _id: null, nom: fiche.fournisseur.nom, type: 'Fournisseur', actif: true, ifuRccm, aCreerPar: c.nom };
    ctx.prestataires.push(fournisseur); // Une fiche suivante du même fournisseur le retrouvera (pas de seconde création)
  }

  // 5. Dépense de la pièce (et ligne budgétaire)
  let depense = null, depenseACreer = false, ligneACreer = null, ligneParFiche = null;
  const code = fiche.financement.ligne;
  const ligneExiste = !!code && ctx.codesLignes.has(code);
  if (numero) {
    const depenses = await tout(client, '/api/admin/finances/depenses', 'depenses', { piece: numero });
    if (depenses.length > 1) erreurs.push(`Dépense : ${depenses.length} dépenses portent la pièce ${numero} (doublon à corriger dans les Finances).`);
    else if (depenses.length === 1) {
      depense = depenses[0];
      const montant = depense.estEffectue ? depense.montantReelFcfa : depense.montantPrevuFcfa;
      if (depense.categorie !== 'Budget') erreurs.push(`Dépense de la pièce ${numero} : catégorie ${depense.categorie}, « Budget » attendue.`);
      if (depense.referenceLigne !== code) erreurs.push(`Dépense de la pièce ${numero} : ligne ${depense.referenceLigne || 'vide'}, la fiche dit ${code}.`);
      if (fiche.financement.sousLigne && depense.sousLigne !== fiche.financement.sousLigne) erreurs.push(`Dépense de la pièce ${numero} : sous-ligne ${depense.sousLigne || 'vide'}, la fiche dit ${fiche.financement.sousLigne}.`);
      if (fiche.facture.totalTtc > 0 && arrondi2(montant ?? 0) !== arrondi2(fiche.facture.totalTtc)) {
        erreurs.push(`Dépense de la pièce ${numero} : montant ${depense.estEffectue ? 'payé' : 'prévu'} ${fmt(montant)}, total de la facture ${fmt(fiche.facture.totalTtc)}.`);
      }
    } else depenseACreer = true;
  }
  // 5 bis. Dépense à créer : son mois du projet ne doit pas être clos (l'API la refuserait en cours d'écriture).
  // Une dépense déjà existante ne déclenche pas ce contrôle.
  if (depenseACreer && fiche.paiement.date) {
    const { mois } = moisProjet(lireDate(fiche.paiement.date));
    if (mois) {
      const { clos, erreur } = await clotures(client, ctx);
      if (erreur) erreurs.push(erreur);
      else if (clos.has(mois)) {
        erreurs.push(`Paiement du ${dateFr(fiche.paiement.date)} en ${mois}, mois clos : rouvrez-le dans Finances (motif tracé) avant la saisie.`);
      }
    }
  }
  if (code && !ligneExiste) {
    if (ctx.lignesPrevues.has(code)) ligneParFiche = ctx.lignesPrevues.get(code); // Créée par une fiche précédente
    else if (ctx.optionLignes) {
      if (ctx.erreurCsv) erreurs.push(ctx.erreurCsv);
      else {
        ligneACreer = ctx.lignesCsv.get(code) || null;
        if (!ligneACreer) erreurs.push(`Ligne budgétaire ${code} : absente de la base et de ${ctx.optionLignes}.`);
        else ctx.lignesPrevues.set(code, c.nom);
      }
    } else {
      erreurs.push(`Ligne budgétaire ${code} : absente de la base (ajoutez --lignes <chemin de 07_budget_lignes.csv> pour la créer).`);
    }
  }

  // 6. Bon : repris s'il existe (lignes identiques à la fiche), sinon à créer avec une référence libre
  if (bon) {
    const ecarts = [];
    if (bon.typeCommande !== fiche.commande.type) ecarts.push(`type ${bon.typeCommande}`);
    if (numeroBonAttendu && bon.numeroBon !== numeroBonAttendu) ecarts.push(`numéro ${bon.numeroBon}`);
    if (fournisseur?._id && String(bon.fournisseurId) !== String(fournisseur._id)) ecarts.push(`fournisseur ${bon.fournisseur}`);
    if (!fournisseur?._id) ecarts.push(`fournisseur ${bon.fournisseur} (fiche de la facture introuvable)`);
    if (bon.lignes.length !== fiche.lignes.length) ecarts.push(`${bon.lignes.length} ligne(s) au lieu de ${fiche.lignes.length}`);
    else {
      bon.lignes.forEach((lb, i) => {
        const lf = fiche.lignes[i];
        const ref = (lb.productId?.reference || '').toUpperCase();
        if (lb.designation !== lf.designation || ref !== lf.produit || lb.quantite !== lf.quantite || arrondi2(lb.montantFcfa) !== arrondi2(lf.montant)) {
          ecarts.push(`ligne ${i + 1} (${lb.designation} : ${ref}, ${nb(lb.quantite)}, ${fmt(lb.montantFcfa)})`);
        }
        lf.ligneBon = lb;
      });
    }
    if (ecarts.length) erreurs.push(`Le bon ${bon.numeroBon} (facture ${numero}, ${bon.statut}) ne correspond pas à la fiche : ${ecarts.join(' ; ')}.`);
  } else if (numeroBonAttendu) {
    // Numéro visé (référence du bon signé, ou « Achat direct – facture n° … ») déjà porté par un bon actif d'une autre
    // facture : contrôlé ici, AVANT toute écriture (fournisseur, dépense), sinon l'API refuserait le bon en 409 après coup
    const memeNumero = (await tout(client, '/api/admin/bons-commande', 'bonsCommande', { search: numeroBonAttendu }))
      .filter(b => b.numeroBon === numeroBonAttendu && b.numeroFacture !== numero);
    if (memeNumero.length) {
      erreurs.push(`La référence de bon ${numeroBonAttendu} sert déjà à la facture ${memeNumero[0].numeroFacture || '(sans facture)'} (bon actif, ${memeNumero[0].statut}).`);
    }
  }

  // 7. Numéros de lot de la fiche : aucun parmi les lots actifs (lignes pas encore reçues)
  const aRecevoir = fiche.lignes.filter(l => !(l.ligneBon && (l.ligneBon.lotId || l.ligneBon.quantiteRecue !== null)));
  for (const l of aRecevoir.filter(x => x.numeroLot)) {
    const lots = (await tout(client, '/api/admin/stock/lots', 'lots', { search: l.numeroLot })).filter(x => x.numeroLot === l.numeroLot);
    if (lots.length) erreurs.push(`Ligne ${l.rang} : le numéro de lot ${l.numeroLot} existe déjà.`);
  }

  c.plan = { fiche, numero, achatDirect, numeroBonAttendu, bon, fournisseur, trouvePar, depense, depenseACreer, code, ligneExiste, ligneACreer, ligneParFiche, aRecevoir };
  return c;
}

// Contrôles entre les fiches d'un même lancement : pas deux fois la même facture, le même numéro de lot, ni la même
// référence de bon de commande pour deux factures (l'API refuserait la seconde en cours d'écriture)
function controlerEntreFiches(controles) {
  const grouper = (cle) => {
    const groupes = new Map();
    for (const x of controles.flatMap(cle)) groupes.set(x.cle, [...(groupes.get(x.cle) || []), x]);
    return [...groupes.values()];
  };
  for (const groupe of grouper(c => (c.numero ? [{ cle: c.numero, c }] : []))) {
    if (groupe.length < 2) continue;
    for (const { c } of groupe) c.erreurs.push(`Facture ${c.numero} : présente dans ${groupe.length} fiches de ce lancement (${groupe.map(x => x.c.nom).join(', ')}).`);
  }
  for (const groupe of grouper(c => (c.plan?.aRecevoir || []).filter(l => l.numeroLot).map(l => ({ cle: l.numeroLot, c, l })))) {
    if (new Set(groupe.map(x => x.c)).size < 2) continue; // Doublon dans une seule fiche : déjà signalé par la fiche
    for (const { c, l } of groupe) {
      const autres = groupe.filter(x => x.c !== c).map(x => `${x.c.nom} (ligne ${x.l.rang})`);
      c.erreurs.push(`Ligne ${l.rang} : numéro de lot ${l.numeroLot} aussi demandé par ${autres.join(', ')}.`);
    }
  }
  for (const groupe of grouper(c => (c.plan && !c.plan.bon && !c.plan.achatDirect && c.plan.numeroBonAttendu ? [{ cle: c.plan.numeroBonAttendu, c }] : []))) {
    if (new Set(groupe.map(x => x.c.numero)).size < 2) continue;
    for (const { c } of groupe) {
      c.erreurs.push(`La référence de bon ${c.plan.numeroBonAttendu} est aussi celle de ${groupe.filter(x => x.c !== c).map(x => `${x.c.nom} (facture ${x.c.numero})`).join(', ')}.`);
    }
  }
}

const etatFiche = (c) => (c.erreurs.length ? 'erreurs' : c.deja ? 'déjà saisie' : 'prête');

function afficherControle(c, rang, total) {
  if (total > 1) console.log(`\n══ Fiche ${rang}/${total} : ${c.nom} ══`);
  if (c.deja) {
    console.log(`\nFacture ${c.numero} déjà saisie (bon ${c.deja.numeroBon}, reçu le ${String(c.deja.dateReception || '').slice(0, 10) || '?'}) : rien à faire.`);
  } else if (c.plan) {
    const p = c.plan, f = p.fiche;
    const fournisseur = p.fournisseur;
    const texteFournisseur = !fournisseur ? `à créer (« ${f.fournisseur.nom} »)`
      : fournisseur._id ? `trouvé par ${p.trouvePar} (« ${fournisseur.nom} »)`
        : fournisseur.aCreerPar === c.nom ? `à créer (« ${fournisseur.nom} »)` : `à créer par la fiche ${fournisseur.aCreerPar} (« ${fournisseur.nom} »)`;
    const texteLigne = p.ligneExiste ? '(existante)' : p.ligneACreer ? '(à créer depuis le CSV)' : p.ligneParFiche ? `(à créer depuis le CSV par la fiche ${p.ligneParFiche})` : '(absente)';
    console.log(`\nFacture ${p.numero || '?'} du ${f.facture.date || '?'} · total ${fmt(f.facture.totalTtc)} · ${f.lignes.length} ligne(s)`);
    console.log(`  Fournisseur      : ${texteFournisseur}`);
    console.log(`  Ligne budgétaire : ${p.code || '?'}${f.financement.sousLigne ? ` / ${f.financement.sousLigne}` : ''} ${texteLigne}`);
    console.log(`  Dépense          : ${p.depense ? `existante, pièce ${p.numero} (${p.depense.estEffectue ? 'payée' : 'prévue'})` : `à créer, payée le ${f.paiement.date || '?'} (${f.paiement.mode || '?'}), pièce attendue : ${f.depense.fichiersAttendus.join(', ')}`}`);
    console.log(`  Bon              : ${p.bon ? `existant ${p.bon.numeroBon} (${p.bon.statut}) : réception reprise` : `à créer : ${p.achatDirect ? p.numeroBonAttendu : `${f.commande.type || '?'} ${p.numeroBonAttendu || '?'}`}`}`);
    console.log(`  Réception du ${f.reception.date || '?'} : ${p.aRecevoir.length} lot(s)`);
    for (const l of p.aRecevoir) {
      console.log(`    ${l.produit} · ${l.produitBase?.name || '?'} : ${nb(l.quantite)} ${l.produitBase?.unit || l.unite}, ${fmt(l.montant)}, lot ${l.numeroLot || 'numéroté à la réception'}`);
    }
  }
  for (const i of c.infos) console.log(`  ℹ ${i}`);
  if (c.erreurs.length) {
    console.error(`\n❌ ${c.erreurs.length} contrôle(s) en échec, rien n'a été écrit :`);
    for (const e of c.erreurs) console.error(`  - ${e}`);
  }
}

// Étapes d'écriture d'une fiche prête, dans l'ordre : fournisseur → ligne budgétaire → dépense → bon → réception
function etapesPrevues(c) {
  const p = c.plan;
  return [
    !p.fournisseur._id && p.fournisseur.aCreerPar === c.nom ? ['fournisseur', 'création du fournisseur'] : null,
    p.ligneACreer ? ['ligne', `création de la ligne budgétaire ${p.code}`] : null,
    p.depenseACreer ? ['depense', 'création de la dépense'] : null,
    !p.bon ? ['bon', 'création du bon'] : null,
    p.aRecevoir.length ? ['reception', `réception (${p.aRecevoir.length} lot(s))`] : null
  ].filter(Boolean);
}

// Écrit une fiche prête ; `fait` reçoit chaque étape terminée (pour dire, en cas d'arrêt, ce qui est fait et ce qui reste)
async function ecrireFiche(client, c, ctx, fait) {
  const p = c.plan, fiche = p.fiche, numero = p.numero;
  const fournisseur = p.fournisseur;
  let bon = p.bon;
  const recap = [];

  if (!fournisseur._id) {
    if (fournisseur.aCreerPar !== c.nom) throw new Error(`le fournisseur « ${fournisseur.nom} » devait être créé par la fiche ${fournisseur.aCreerPar}.`);
    const cree = await client.post('/api/admin/prestataires', {
      nom: fiche.fournisseur.nom, type: 'Fournisseur', telephone: fiche.fournisseur.telephone, quartier: fiche.fournisseur.adresse,
      ifuRccm: fournisseur.ifuRccm, ...(fiche.fournisseur.modePaiement ? { modePaiement: fiche.fournisseur.modePaiement } : {}),
      notes: `Fiche créée à la saisie de la facture ${numero}`
    });
    Object.assign(fournisseur, cree); // Les fiches suivantes du même fournisseur reçoivent son identifiant
    fait.push('fournisseur');
    recap.push(`Fournisseur : créé (« ${fournisseur.nom} »)`);
  } else {
    recap.push(`Fournisseur : trouvé (« ${fournisseur.nom} »${fournisseur.aCreerPar && fournisseur.aCreerPar !== c.nom ? `, créé par la fiche ${fournisseur.aCreerPar}` : ''})`);
  }

  if (p.ligneACreer) {
    await client.post('/api/admin/finances/lignes', p.ligneACreer);
    ctx.codesLignes.add(p.code);
    fait.push('ligne');
    recap.push(`Ligne budgétaire ${p.code} : créée depuis le CSV`);
  }

  if (p.depenseACreer) {
    const commentaire = [fiche.commentaire, fiche.facture.mecef ? `MECeF ${fiche.facture.mecef}` : '', fiche.facture.references.length ? `Références : ${fiche.facture.references.join(', ')}` : ''].filter(Boolean).join(' ; ');
    await client.post('/api/admin/finances/depenses', {
      dejaPayee: true, categorie: 'Budget', referenceLigne: p.code, sousLigne: fiche.financement.sousLigne,
      libelle: fiche.depense.libelle, partenaireId: fournisseur._id, numeroPiece: numero,
      montantReelFcfa: fiche.facture.totalTtc, datePaiement: fiche.paiement.date,
      modePaiement: fiche.paiement.mode, detailPaiement: fiche.paiement.detail, referencePaiement: fiche.paiement.reference,
      fichiersAttendus: fiche.depense.fichiersAttendus, commentaire
    });
    fait.push('depense');
    recap.push(`Dépense : créée (pièce ${numero}, payée, hors audit jusqu'au dépôt des justificatifs)`);
  } else recap.push(`Dépense : existante (pièce ${numero})`);

  if (!bon) {
    const r = await client.post('/api/admin/bons-commande', {
      typeCommande: fiche.commande.type, ...(p.achatDirect ? {} : { numeroBon: fiche.commande.reference }),
      numeroFacture: numero, dateFacture: fiche.facture.date, dateEmission: fiche.commande.date,
      fournisseurId: fournisseur._id, totalFacture: fiche.facture.totalTtc,
      ligneBudgetaire: p.code, sousLigne: fiche.financement.sousLigne, commentaire: fiche.commentaire,
      lignes: fiche.lignes.map(l => ({
        designation: l.designation, quantiteFacture: l.quantiteFacture, montantFcfa: l.montant,
        productId: l.produitBase._id, quantite: l.quantite, detailQuantite: l.detailQuantite
      }))
    });
    bon = r.bon;
    fiche.lignes.forEach((l, i) => { l.ligneBon = bon.lignes[i]; });
    fait.push('bon');
  }

  const lignesReception = fiche.lignes
    .filter(l => !(l.ligneBon.lotId || l.ligneBon.quantiteRecue !== null))
    .map(l => ({ ligneId: l.ligneBon._id, quantiteRecue: l.quantite, lotFournisseur: l.lotFournisseur, numeroLot: l.numeroLot }));
  let lots = [];
  if (lignesReception.length) {
    const r = await client.post(`/api/admin/bons-commande/${bon._id}/reception`, { dateReception: fiche.reception.date, lignes: lignesReception });
    bon = r.bon;
    lots = r.lots || [];
    fait.push('reception');
  }
  recap.push(`Bon : ${bon.numeroBon} (${bon.statut})`);

  console.log(`\n✅ FACTURE SAISIE${ctx.total > 1 ? ` : ${c.nom}` : ''}`);
  for (const ligne of recap) console.log(`  ${ligne}`);
  console.log(`  Lots créés (${lots.length}) :`);
  for (const lot of lots) {
    const produit = ctx.produitParId.get(String(lot.product));
    console.log(`    ${lot.numeroLot} · ${produit ? nomProduit(produit) : '?'} : ${nb(lot.quantiteInitiale)} ${produit?.unit || ''}, ${fmt(lot.valeurFcfa)}`);
  }
  const dejaRecues = fiche.lignes.length - lignesReception.length;
  console.log(`  Total des lots créés : ${fmt(lots.reduce((s, l) => s + (l.valeurFcfa || 0), 0))} (facture : ${fmt(fiche.facture.totalTtc)})${dejaRecues ? ` ; ${dejaRecues} ligne(s) déjà réceptionnée(s) avant cette reprise` : ''}`);
}

/**
 * facture <fiche1.json> [fiche2.json …] : une seule connexion, fiches traitées dans l'ordre donné.
 * 1. Toutes les fiches sont contrôlées (aucune écriture), puis les contrôles entre fiches ; plan et erreurs affichés.
 * 2. Simulation : bilan, code 1 si une fiche est en erreur.
 *    --appliquer : une seule fiche en erreur et rien n'est écrit, pour aucune ; sinon écriture fiche par fiche (les
 *    fiches déjà saisies sont sautées). Un échec en route arrête tout : ce qui est fait et ce qui reste sont affichés,
 *    et la relance de la même commande reprend sans doublon (chaque étape déjà enregistrée est retrouvée).
 */
async function commandeFacture(client, chemins, options) {
  const [produits, prestataires, lignesBudget] = await Promise.all([
    tout(client, '/api/admin/products', 'products'),
    tout(client, '/api/admin/prestataires', 'prestataires'),
    client.get('/api/admin/finances/lignes')
  ]);
  const ctx = {
    total: chemins.length,
    parRef: new Map(produits.filter(p => p.reference).map(p => [p.reference.toUpperCase(), p])),
    produitParId: new Map(produits.map(p => [String(p._id), p])),
    prestataires: [...prestataires],
    codesLignes: new Set((lignesBudget || []).map(l => l.code)),
    lignesPrevues: new Map(), // code -> fiche qui crée la ligne depuis le CSV
    optionLignes: options.lignes || null, lignesCsv: null, erreurCsv: null
  };
  if (options.lignes) {
    try { ctx.lignesCsv = lignesDuCsv(options.lignes); } catch (error) { ctx.erreurCsv = error.message; }
  }

  const controles = [];
  for (const chemin of chemins) controles.push(await controlerFiche(client, chemin, ctx));
  controlerEntreFiches(controles);
  controles.forEach((c, i) => afficherControle(c, i + 1, controles.length));

  const enErreur = controles.filter(c => etatFiche(c) === 'erreurs');
  const pretes = controles.filter(c => etatFiche(c) === 'prête');
  if (controles.length > 1) {
    console.log(`\nBilan des ${controles.length} fiches :`);
    for (const c of controles) {
      const etat = etatFiche(c);
      console.log(`  ${(etat === 'erreurs' ? `erreurs (${c.erreurs.length})` : etat).padEnd(13)} ${c.nom}${c.numero ? ` · facture ${c.numero}` : ''}`);
    }
  }

  if (enErreur.length) {
    if (controles.length > 1) {
      console.error(`\n❌ ${enErreur.length} fiche(s) en erreur sur ${controles.length} : rien n'a été écrit, pour aucune fiche. Corrigez-les puis relancez.`);
    }
    process.exitCode = 1;
    return;
  }
  if (!pretes.length) {
    if (controles.length > 1) console.log('\nToutes les fiches sont déjà saisies : rien à faire.');
    return;
  }
  if (!options.appliquer) {
    console.log(`\n🔎 SIMULATION : rien n'a été écrit. Relancez avec --appliquer pour enregistrer${pretes.length > 1 ? ` les ${pretes.length} fiches prêtes` : ''}.`);
    return;
  }

  // Écriture, fiche par fiche, dans l'ordre donné
  const saisies = [], sautees = [];
  for (const [i, c] of controles.entries()) {
    if (c.deja) {
      sautees.push(c.nom);
      if (controles.length > 1) console.log(`\n── ${c.nom} : facture ${c.numero} déjà saisie, sautée.`);
      continue;
    }
    const prevues = etapesPrevues(c);
    const fait = [];
    try {
      await ecrireFiche(client, c, ctx, fait);
      saisies.push(c.nom);
    } catch (error) {
      const restantes = controles.slice(i + 1).filter(x => !x.deja).map(x => x.nom);
      const resteFiche = prevues.filter(([cle]) => !fait.includes(cle)).map(([, libelle]) => libelle);
      console.error(`\n❌ Arrêt pendant la fiche ${c.nom} : ${error.message}`);
      console.error(`Fait : ${saisies.length ? `fiche(s) saisie(s) : ${saisies.join(', ')}` : 'aucune fiche complète'}${fait.length ? ` ; pour ${c.nom} : ${prevues.filter(([cle]) => fait.includes(cle)).map(([, libelle]) => libelle).join(', ')}` : ''}.`);
      console.error(`Reste : ${c.nom}${resteFiche.length ? ` (${resteFiche.join(', ')})` : ''}${restantes.length ? `, puis ${restantes.join(', ')}` : ''}.`);
      console.error('Relancez la même commande : ce qui est déjà enregistré (fournisseur, ligne budgétaire, dépense, bon, lots) est retrouvé et sauté, sans doublon.');
      process.exitCode = 1;
      return;
    }
  }
  if (controles.length > 1) {
    console.log(`\n✅ ${saisies.length} fiche(s) saisie(s)${sautees.length ? `, ${sautees.length} déjà saisie(s) sautée(s) (${sautees.join(', ')})` : ''}.`);
  }
}

// ------------------------------------------------------------------
// c) transformation
// ------------------------------------------------------------------

async function commandeTransformation(client, options) {
  const erreurs = [];
  const matiereRef = txt(options.matiere).toUpperCase();
  const produitRef = txt(options.produit).toUpperCase();
  const quantite = nombre(options.quantite);
  const obtenu = nombre(options.obtenu);
  const date = dateIso(options.date);
  const numeroLot = txt(options.lot);
  if (!matiereRef) erreurs.push('--matiere <REF> obligatoire.');
  if (!produitRef) erreurs.push('--produit <REF> obligatoire.');
  if (matiereRef && matiereRef === produitRef) erreurs.push('La matière et le produit obtenu doivent être différents.');
  if (!(quantite > 0)) erreurs.push('--quantite : nombre supérieur à 0 obligatoire.');
  if (!(obtenu > 0)) erreurs.push('--obtenu : nombre supérieur à 0 obligatoire.');
  if (!date) erreurs.push('--date : date obligatoire au format AAAA-MM-JJ.');

  const [produits, inventaire] = await Promise.all([tout(client, '/api/admin/products', 'products'), client.get('/api/admin/inventory/global')]);
  const parRef = new Map(produits.filter(p => p.reference).map(p => [p.reference.toUpperCase(), p]));
  const matiere = parRef.get(matiereRef), produit = parRef.get(produitRef);
  if (matiereRef && !matiere) erreurs.push(`Matière ${matiereRef} introuvable dans le catalogue actif.`);
  if (produitRef && !produit) erreurs.push(`Produit ${produitRef} introuvable dans le catalogue actif.`);
  if (matiere && quantite > 0) {
    const stock = (inventaire || []).find(i => String(i.productId) === String(matiere._id))?.stockTotal ?? 0;
    if (stock < quantite) erreurs.push(`Stock de ${nomProduit(matiere)} insuffisant : ${nb(stock)} ${matiere.unit} disponibles (lots comptés).`);
  }
  if (numeroLot && (await tout(client, '/api/admin/stock/lots', 'lots', { search: numeroLot })).some(l => l.numeroLot === numeroLot)) {
    erreurs.push(`Le numéro de lot ${numeroLot} existe déjà.`);
  }

  if (matiere && produit && quantite > 0 && obtenu > 0) {
    console.log(`\nTransformation du ${date || '?'} : ${nb(quantite)} ${matiere.unit} de ${nomProduit(matiere)} → ${nb(obtenu)} ${produit.unit} de ${nomProduit(produit)} (rendement ${Math.round((obtenu / quantite) * 100)} %), lot ${numeroLot || 'numéroté par le serveur'}`);
    if (matiere.type !== 'matière première') console.log(`  ℹ ${matiere.reference} est de type « ${matiere.type} », pas « matière première ».`);
    if (!numeroLot) console.log('  ℹ Sans --lot, relancer cette commande enregistrerait une seconde transformation.');
  }
  if (erreurs.length) return afficherErreurs(erreurs);
  if (!options.appliquer) { console.log('\n🔎 SIMULATION : rien n\'a été écrit. Relancez avec --appliquer pour enregistrer.'); return; }

  const r = await client.post('/api/admin/stock/transformations', {
    matiereId: matiere._id, quantiteMatiere: quantite, produitId: produit._id, quantiteObtenue: obtenu, date,
    ...(numeroLot ? { numeroLot } : {}), commentaire: txt(options.commentaire)
  });
  console.log(`\n✅ ${r.message} Lot ${r.lot?.numeroLot}${r.lot?.valeurFcfa !== null && r.lot?.valeurFcfa !== undefined ? `, valeur ${fmt(r.lot.valeurFcfa)}` : ', coût de la matière à renseigner'}.`);
}

// ------------------------------------------------------------------
// d) controle [--depuis AAAA-MM-JJ] (lecture seule)
// ------------------------------------------------------------------

async function commandeControle(client, options) {
  const depuis = options.depuis ? dateIso(options.depuis) : null;
  if (options.depuis && !depuis) { afficherErreurs(['--depuis : date au format AAAA-MM-JJ.']); return; }

  const [bonsTous, lots, produits] = await Promise.all([
    tout(client, '/api/admin/bons-commande', 'bonsCommande'),
    tout(client, '/api/admin/stock/lots', 'lots'),
    tout(client, '/api/admin/products', 'products')
  ]);
  const dateBon = (b) => String(b.dateFacture || b.dateEmission || '').slice(0, 10);
  const bons = bonsTous.filter(b => b.lignes?.length && (!depuis || dateBon(b) >= depuis))
    .sort((a, b) => dateBon(a).localeCompare(dateBon(b)));

  console.log(`\nBons au nouveau format${depuis ? ` depuis le ${depuis}` : ''} (${bons.length}) :`);
  for (const b of bons) {
    console.log(`  ${dateBon(b)} · ${b.numeroBon}${b.numeroFacture && b.typeCommande !== 'Achat direct' ? ` · facture ${b.numeroFacture}` : ''} · ${b.statut} · ${b.lignes.length} ligne(s) · ${fmt(b.montantTotalFcfa)}`);
  }

  // Lots rattachés à ces bons : valeur d'achat, alimentaire (P, V, MP) et emballages (EMB)
  const idsBons = new Set(bons.map(b => String(b._id)));
  const familleParProduit = new Map(produits.map(p => [String(p._id), FAMILLES[p.type] || '?']));
  const lotsBons = lots.filter(l => l.bonCommandeId && idsBons.has(String(l.bonCommandeId)));
  const valeur = (liste) => liste.reduce((s, l) => s + (l.valeurFcfa || 0), 0);
  const emballages = lotsBons.filter(l => familleParProduit.get(String(l.product?._id || l.product)) === 'EMB');
  const alimentaire = lotsBons.filter(l => ['P', 'V', 'MP'].includes(familleParProduit.get(String(l.product?._id || l.product))));
  const autres = lotsBons.length - emballages.length - alimentaire.length;
  console.log(`\nLots rattachés à ces bons : ${lotsBons.length}, valeur d'achat ${fmt(valeur(lotsBons))}`);
  console.log(`  Alimentaire (P, V, MP) : ${alimentaire.length} lot(s), ${fmt(valeur(alimentaire))}`);
  console.log(`  Emballages (EMB)       : ${emballages.length} lot(s), ${fmt(valeur(emballages))}`);
  if (autres) console.log(`  Produit archivé ou inconnu : ${autres} lot(s)`);

  // Dépenses par pièce (section Finances : refusée aux rôles qui n'y ont pas accès)
  let manquantes = 0, doublons = 0;
  console.log('\nDépenses par pièce :');
  try {
    for (const b of bons.filter(x => x.numeroFacture)) {
      const n = (await tout(client, '/api/admin/finances/depenses', 'depenses', { piece: b.numeroFacture })).length;
      if (n === 0) manquantes++;
      if (n > 1) doublons++;
      console.log(`  ${b.numeroFacture} : ${n} dépense(s)${n === 0 ? '  ⚠ aucune dépense' : n > 1 ? '  ⚠ DOUBLON' : ''}`);
    }
    const sansFacture = bons.filter(x => !x.numeroFacture).length;
    console.log(`  Bilan : ${doublons} doublon(s), ${manquantes} pièce(s) sans dépense${sansFacture ? `, ${sansFacture} bon(s) sans numéro de facture` : ''}`);
  } catch (error) {
    if (error.statut !== 403) throw error;
    console.log(`  non consultables avec ce compte (${error.message})`);
  }

  console.log(`\nLots à compter (quantité non comptée) : ${lots.filter(l => l.quantiteInitiale === null).length}`);
}

// ------------------------------------------------------------------

async function executer() {
  let args;
  try { args = lireArguments(process.argv.slice(2)); } catch (error) { console.error(`❌ ${error.message}\n\n${AIDE}`); process.exitCode = 1; return; }
  const { commande, positions, options } = args;
  if (options.aide || options.help || options.h) { console.log(AIDE); return; }
  if (!['catalogue', 'facture', 'transformation', 'controle'].includes(commande)) {
    console.error(`${commande ? `❌ Commande inconnue : ${commande}\n\n` : ''}${AIDE}`);
    process.exitCode = 1;
    return;
  }
  if (Number(process.versions.node.split('.')[0]) < 22 || typeof fetch !== 'function') {
    console.error('❌ Node 22 ou plus est nécessaire (fetch natif).');
    process.exitCode = 1;
    return;
  }

  try {
    const base = adresseApi(options.api);
    if (commande === 'catalogue') {
      if (!positions[0]) throw new Error('Indiquez le fichier JSON : catalogue <fichier.json>.');
      if (positions.length > 1) throw new Error('catalogue : un seul fichier JSON à la fois.');
      lireJson(positions[0]); // Fichier lisible avant de demander les identifiants
    }
    if (commande === 'facture') {
      if (!positions.length) throw new Error('Indiquez le fichier JSON : facture <fiche1.json> [fiche2.json …].');
      // Avant de demander les identifiants : si aucune fiche n'est lisible, inutile d'aller plus loin. Une fiche
      // illisible parmi d'autres est signalée dans le bilan, avec les erreurs des autres fiches.
      const illisibles = positions.map(p => { try { lireJson(p); return null; } catch (error) { return error.message; } }).filter(Boolean);
      if (illisibles.length === positions.length) throw new Error(illisibles.join('\n❌ '));
    }
    console.log(`API : ${base} · ${options.appliquer ? 'ÉCRITURE (--appliquer)' : 'simulation'}`);
    const client = creerClient(base);
    await connecter(client, { adminRequis: commande !== 'controle' });

    if (commande === 'catalogue') await commandeCatalogue(client, positions[0], !!options.appliquer);
    else if (commande === 'facture') await commandeFacture(client, positions, options);
    else if (commande === 'transformation') await commandeTransformation(client, options);
    else await commandeControle(client, options);
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exitCode = 1;
  }
}

executer();
