// Lecture stricte d'une date saisie : « AAAA-MM-JJ », éventuellement suivie d'une heure ISO (« T10:00:00Z »,
// « T10:00:00+01:00 »). Le jour doit exister au calendrier : « 2026-02-30 » est refusée (le moteur JavaScript
// la transformerait en silence en 2 mars). Renvoie un objet Date, ou null si la valeur est absente ou invalide.
const FORMAT_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function lireDate(valeur) {
  if (typeof valeur !== 'string') return null;
  const t = valeur.trim();
  const m = FORMAT_DATE.exec(t);
  if (!m) return null;
  const [annee, mois, jour] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const calendrier = new Date(Date.UTC(annee, mois - 1, jour));
  if (calendrier.getUTCFullYear() !== annee || calendrier.getUTCMonth() !== mois - 1 || calendrier.getUTCDate() !== jour) return null;
  const date = new Date(t);
  return Number.isNaN(date.getTime()) ? null : date;
}

module.exports = { lireDate };
