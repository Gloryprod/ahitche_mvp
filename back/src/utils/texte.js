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

// Numéro béninois saisi à la main : espaces, points, tirets et parenthèses retirés, indicatif « +229 » ou « 00229 »
// facultatif, 8 chiffres (ancien plan) ou 10 (« 01… »). Renvoie « 229… », ou '' si le numéro est invalide.
function normaliserTelephone(telephone) {
  const n = String(telephone ?? '').replace(/[\s.()-]/g, '').replace(/^(\+|00)/, '');
  const complet = /^(\d{8}|\d{10})$/.test(n) ? `229${n}` : n;
  return /^229(\d{8}|\d{10})$/.test(complet) ? complet : '';
}

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

module.exports = { echapperRegex, normaliser, normaliserEmail, EMAIL_VALIDE, normaliserTelephone, lireNombre };
