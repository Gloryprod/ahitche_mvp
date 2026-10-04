// Lecture et écriture CSV pour les imports/exports des Finances.
// Excel en français utilise « ; » comme séparateur et la virgule décimale : on accepte les deux formats.

function detecterSeparateur(premiereLigne) {
  const pointsVirgules = (premiereLigne.match(/;/g) || []).length;
  const virgules = (premiereLigne.match(/,/g) || []).length;
  return pointsVirgules >= virgules ? ';' : ',';
}

// Découpe un texte CSV en lignes de cellules (gère les guillemets et les retours à la ligne entre guillemets)
function lireCsv(texte) {
  const contenu = String(texte).replace(/^﻿/, '');
  const separateur = detecterSeparateur(contenu.split(/\r?\n/, 1)[0] || '');
  const lignes = [];
  let ligne = [], cellule = '', entreGuillemets = false;

  for (let i = 0; i < contenu.length; i++) {
    const c = contenu[i];
    if (entreGuillemets) {
      if (c === '"' && contenu[i + 1] === '"') { cellule += '"'; i++; }
      else if (c === '"') entreGuillemets = false;
      else cellule += c;
    } else if (c === '"') entreGuillemets = true;
    else if (c === separateur) { ligne.push(cellule.trim()); cellule = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && contenu[i + 1] === '\n') i++;
      ligne.push(cellule.trim()); cellule = '';
      if (ligne.some(v => v !== '')) lignes.push(ligne);
      ligne = [];
    } else cellule += c;
  }
  ligne.push(cellule.trim());
  if (ligne.some(v => v !== '')) lignes.push(ligne);
  return lignes;
}

// "1 234 567,50" ou "1234567.5" -> 1234567.5 ; vide -> 0 ; illisible -> NaN
function lireNombre(valeur) {
  const texte = String(valeur ?? '').replace(/[\s  ]/g, '').replace(/(FCFA|USD|\$|F)$/i, '');
  if (texte === '') return 0;
  const normalise = texte.includes(',') && !texte.includes('.') ? texte.replace(',', '.') : texte.replace(/,/g, '');
  return Number(normalise);
}

// Tableau de lignes -> texte CSV pour Excel (séparateur « ; », BOM UTF-8 pour les accents)
function ecrireCsv(lignes) {
  const echapper = v => {
    const texte = v === null || v === undefined ? '' : String(v);
    return /[;"\n\r]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
  };
  return '﻿' + lignes.map(l => l.map(echapper).join(';')).join('\r\n');
}

module.exports = { lireCsv, lireNombre, ecrireCsv };
