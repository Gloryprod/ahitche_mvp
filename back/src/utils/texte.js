// Échappe les caractères spéciaux d'une saisie avant de l'utiliser dans une expression régulière
// (recherche insensible à la casse) : évite les erreurs et les recherches piégées.
function echapperRegex(texte) {
  return String(texte).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Normalise un texte pour comparer des noms saisis à la main (accents, casse, espaces, tirets)
function normaliser(texte) {
  return String(texte ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[-_']/g, ' ').replace(/\s+/g, ' ').trim();
}

// Adresse e-mail comparable : sans espaces autour, en minuscules. Sur téléphone, le clavier met souvent une majuscule
// au début : « Awa@… » et « awa@… » doivent désigner le même compte.
function normaliserEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}
const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Nombre saisi par l'équipe : un nombre fini, ou un texte décimal (« 85 », « 1 500 », « 1,5 », « 0.5 », « -1 ») ;
// NaN sinon (vide, tableau, objet, Infinity, et formes hexadécimales ou exponentielles comme « 0x10 » ou « 1e2 »,
// que Number() accepterait sans prévenir). Les espaces des milliers sont ignorés.
const DECIMAL = /^-?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;
function lireNombre(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v !== 'string') return NaN;
  const t = v.replace(/\s/g, '');
  return DECIMAL.test(t) ? Number(t.replace(',', '.')) : NaN;
}

module.exports = { echapperRegex, normaliser, normaliserEmail, EMAIL_VALIDE, lireNombre };
