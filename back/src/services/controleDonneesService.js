// Contrôles après import (section B.4) : valeurs calculées en lecture seule sur la base.
// Les valeurs attendues ne sont jamais dans le code : elles se lisent dans un fichier exclu de Git (docs-internes).
const Category = require('../models/category');
const CompositionRule = require('../models/compositionRule');
const Product = require('../models/product');
const Formule = require('../models/formules');
const Zone = require('../models/zone');
const Partner = require('../models/partner');
const BudgetLine = require('../models/budgetLine');
const Expense = require('../models/expense');
const { LotStockFifo } = require('../models/stock');
const User = require('../models/user');
const { EQUIPE } = require('../config/roles');

const PACKS = ['essentiel', 'equilibre', 'confort', 'reserve', 'fraicheur'];
const arrondi = (n) => Math.round(n * 100) / 100;

async function controlerDonnees(session = null) {
  const q = (requete) => requete.session(session);
  // Requêtes l'une après l'autre : une transaction n'accepte pas d'opérations simultanées
  const resultats = [];
  for (const requete of [
    () => q(Category.countDocuments({ deletedAt: null })),
    () => q(CompositionRule.countDocuments({ deletedAt: null })),
    () => q(Product.find({ deletedAt: null }).lean()),
    () => q(Formule.find().lean()),
    () => q(Zone.find().lean()),
    () => q(Partner.find({ deletedAt: null }).lean()),
    () => q(BudgetLine.find({ deletedAt: null }).lean()),
    () => q(Expense.find({ deletedAt: null }).lean()),
    () => q(LotStockFifo.find({ deletedAt: null }).lean()),
    () => q(User.countDocuments({ role: { $in: EQUIPE } }))
  ]) resultats.push(await requete());
  const [categories, regles, produits, formules, zones, prestataires, lignes, depenses, lots, comptes] = resultats;

  // Coût des matières de chaque pack aux prix du catalogue (produits de base fixe)
  const matieres = {}, prixManquants = {};
  for (const pack of PACKS) {
    const items = produits.filter(p => p.type === 'base fixe' && p.quantites?.[pack] > 0);
    matieres[pack] = arrondi(items.reduce((s, p) => s + (p.priceUnit ?? 0) * p.quantites[pack], 0));
    prixManquants[pack] = items.filter(p => p.priceUnit === null || p.priceUnit === undefined).length;
  }

  const budget = depenses.filter(d => d.categorie === 'Budget');
  const engage = (d) => (d.estEffectue ? d.montantReelFcfa : d.montantPrevuFcfa ?? 0);
  const engageParMois = {};
  for (const d of budget.filter(d => d.estEffectue)) engageParMois[d.moisProjet || 'sans mois'] = (engageParMois[d.moisProjet || 'sans mois'] || 0) + d.montantReelFcfa;
  const prevuFcfa = lignes.reduce((s, l) => s + (l.montantPrevuFcfa || 0), 0);
  const engageFcfa = budget.reduce((s, d) => s + engage(d), 0);
  const depassements = {};
  for (const l of lignes) {
    const e = budget.filter(d => d.referenceLigne === l.code).reduce((s, d) => s + engage(d), 0);
    if (e > l.montantPrevuFcfa) depassements[l.code] = e - l.montantPrevuFcfa;
  }

  return {
    categories,
    regles,
    produits: produits.length,
    produitsReferentiel: produits.filter(p => /^[PV]\d+$/.test(p.reference || '')).length,
    produitsBaseFixe: produits.filter(p => p.type === 'base fixe').length,
    produitsExtras: produits.filter(p => p.type === 'extra').length,
    produitsIndisponibles: produits.filter(p => p.statut === 'indisponible').map(p => p.reference || p.name).join(', ') || 'aucun',
    matieres,
    prixManquants,
    formules: formules.length,
    prix: Object.fromEntries(formules.map(f => [f.slug, f.prixCommercial ?? f.prixActuel ?? null])),
    prixBarres: formules.filter(f => f.ancienPrix !== null && f.ancienPrix !== undefined).length,
    zones: zones.length,
    zonesPrioritaires: zones.filter(z => z.prioritaire).length,
    zonesActives: zones.filter(z => z.actif).length,
    prestataires: prestataires.length,
    prestatairesActifs: prestataires.filter(p => p.actif).length,
    lignes: lignes.length,
    lignesUsd: arrondi(lignes.reduce((s, l) => s + (l.montantPrevuUsd || 0), 0)),
    lignesFcfa: prevuFcfa,
    depenses: depenses.length,
    engageFcfa,
    engageParMois,
    soldeFcfa: prevuFcfa - engageFcfa,
    absorptionPct: prevuFcfa ? Math.round((engageFcfa / prevuFcfa) * 1000) / 10 : 0,
    depassements,
    lots: lots.length,
    lotsACompter: lots.filter(l => l.quantiteInitiale === null).length,
    valeurStockFcfa: lots.reduce((s, l) => s + (l.valeurFcfa ?? (l.quantiteInitiale ?? 0) * (l.prixAchatUnitaire ?? 0)), 0),
    depensesCreeesParStock: depenses.filter(d => d.lotStockId).length,
    comptes
  };
}

// Compare les valeurs obtenues aux valeurs attendues (objet de même forme, facultatif) : lignes lisibles
function comparerControles(obtenu, attendu = null, prefixe = '') {
  const lignes = [];
  for (const [cle, valeur] of Object.entries(obtenu)) {
    const nom = prefixe ? `${prefixe}.${cle}` : cle;
    const cible = attendu ? attendu[cle] : undefined;
    if (valeur && typeof valeur === 'object') {
      lignes.push(...comparerControles(valeur, cible && typeof cible === 'object' ? cible : null, nom));
      if (cible && typeof cible === 'object') {
        for (const manquant of Object.keys(cible).filter(k => !(k in valeur))) lignes.push(`✘ ${nom}.${manquant} : absent (attendu ${cible[manquant]})`);
      }
      continue;
    }
    if (cible === undefined) lignes.push(`· ${nom} : ${valeur}`);
    else lignes.push(`${cible === valeur ? '✔' : '✘'} ${nom} : ${valeur}${cible === valeur ? '' : ` (attendu ${cible})`}`);
  }
  return lignes;
}

module.exports = { controlerDonnees, comparerControles };
