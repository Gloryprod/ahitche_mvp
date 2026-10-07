const {
  DEBUT_CONVENTION, NB_MOIS_CONVENTION, SEUIL_COTATION_USD, PIECES_ATTENDUES, PIECES_COTATION, PIECES_FACULTATIVES
} = require('../config/convention');
const ClotureMois = require('../models/clotureMois');

const FUSEAU = 'Africa/Porto-Novo';

// Jour d'une date à l'heure du Bénin : { annee, mois, jour }
function jourBenin(date) {
  const [annee, mois, jour] = new Date(date).toLocaleDateString('sv-SE', { timeZone: FUSEAU }).split('-').map(Number);
  return { annee, mois, jour };
}

// Rang du mois du projet (0 = M1) ; négatif avant la convention
function rangMois(date) {
  const { annee, mois, jour } = jourBenin(date);
  const d = DEBUT_CONVENTION;
  return (annee * 12 + mois - 1 + (jour >= d.jour ? 1 : 0)) - (d.annee * 12 + d.mois - 1 + 1);
}

/**
 * Mois du projet d'une date : { mois: 'M1'…, horsPeriode }.
 * Avant le début : mois null ; après M6 : M7, M8… signalés hors période.
 */
function moisProjet(date) {
  if (!date || Number.isNaN(new Date(date).getTime())) return { mois: null, horsPeriode: false };
  const rang = rangMois(date);
  if (rang < 0) return { mois: null, horsPeriode: true };
  return { mois: `M${rang + 1}`, horsPeriode: rang >= NB_MOIS_CONVENTION };
}

// Bornes d'un mois du projet (« M4 » : du 26/08 au 25/09/2026), en dates à l'heure du Bénin
function bornesMois(code) {
  const n = /^M(\d{1,2})$/.exec(code || '');
  if (!n || Number(n[1]) < 1) return null;
  const d = DEBUT_CONVENTION;
  const debut = new Date(Date.UTC(d.annee, d.mois - 1 + Number(n[1]) - 1, d.jour));
  const fin = new Date(Date.UTC(d.annee, d.mois - 1 + Number(n[1]), d.jour - 1));
  const iso = (x) => x.toISOString().slice(0, 10);
  return { du: iso(debut), au: iso(fin), debut: new Date(`${iso(debut)}T00:00:00+01:00`), fin: new Date(`${iso(fin)}T23:59:59.999+01:00`) };
}

const MOIS_CONVENTION = Array.from({ length: NB_MOIS_CONVENTION }, (_, i) => `M${i + 1}`);

// Pièces exigées pour une dépense : selon sa catégorie (1 ou 2) et son montant (cotation au-delà de 1 000 USD)
function piecesAttendues(depense) {
  const categorie = depense.categorieAd;
  if (!PIECES_ATTENDUES[categorie]) return [];
  const usd = depense.estEffectue ? depense.montantReelUsd : depense.montantPrevuUsd;
  return [...PIECES_ATTENDUES[categorie], ...((usd ?? 0) > SEUIL_COTATION_USD ? PIECES_COTATION : [])];
}

// État des pièces : attendues, présentes (par type de pièce des justificatifs), manquantes
function etatPieces(depense) {
  const attendues = piecesAttendues(depense);
  const types = new Set((depense.justificatifs || []).map(j => j.typePiece).filter(Boolean));
  return {
    attendues,
    facultatives: PIECES_FACULTATIVES[depense.categorieAd] || [],
    presentes: attendues.filter(p => types.has(p)),
    manquantes: attendues.filter(p => !types.has(p))
  };
}

/**
 * Validité pour l'audit, recalculée automatiquement pour une dépense de la convention (catégorie 1 ou 2) :
 * payée, toutes les pièces exigées présentes et datée dans la période. Sans catégorie : inchangée.
 */
function appliquerValiditeAudit(depense) {
  if (!PIECES_ATTENDUES[depense.categorieAd]) return depense.estValidePourAudit;
  const { manquantes } = etatPieces(depense);
  const periode = depense.datePaiement ? moisProjet(depense.datePaiement) : { horsPeriode: false };
  depense.estValidePourAudit = !!depense.estEffectue && manquantes.length === 0 && !periode.horsPeriode;
  return depense.estValidePourAudit;
}

// Un mois clos ne se modifie plus sans réouverture tracée
async function estMoisClos(mois) {
  if (!mois) return false;
  return !!(await ClotureMois.exists({ mois, close: true }));
}

module.exports = { FUSEAU, jourBenin, moisProjet, bornesMois, MOIS_CONVENTION, piecesAttendues, etatPieces, appliquerValiditeAudit, estMoisClos };
