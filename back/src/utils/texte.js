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

module.exports = { echapperRegex, normaliser };
