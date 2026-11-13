// Contenus du site public modifiables depuis l'admin (écran « Site public », section « site »).
// Contrats : docs-internes/admin/CONTRAT-site-public-A.md (lot A : « infos », infos pratiques, et « bandeau »)
// et CONTRAT-site-public-B.md (lot B : « formules », textes des cartes de la vitrine).
// Les lots suivants (faq, actualites, photos) s'ajoutent à la table CONTENUS, sans toucher au contrôleur :
//   cle → { libelle, valider(valeurs) → { valeurs } | { erreur }, resumer(avant, apres) → texte, publier?(valeurs, maintenant) }
//  - valider : contrôle complet, renvoie seulement les champs du contrat, nettoyés (jamais un champ inconnu) ;
//  - resumer : phrase du journal, ce qui change en clair (« Infos pratiques publiées : numéro WhatsApp, horaires ») ;
//  - publier : facultatif, ce que voit le site à cet instant (ex. bandeau hors de ses dates → null).
// Aucune valeur par défaut ici : sans publication, le site garde celles du code (front/src/config/contact.ts,
// formules.ts) ; seul llms.txt en garde une copie côté serveur (services/llmsService.js).

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const URL_MAX = 300;
const DECALAGE_COTONOU_MS = 60 * 60 * 1000; // UTC+1, sans heure d'été

const RETOUR_LIGNE = /[\r\n\v\f\u0085\u2028\u2029]/;
const CONTROLE = /[\u0000-\u0008\u000E-\u001F\u007F]/;

class ErreurSaisie extends Error {}
const refuser = (message) => { throw new ErreurSaisie(message); };

// Texte saisi : chaîne obligatoire, sans < > ni retour à la ligne, espaces en trop retirés, longueur en caractères
function texte(valeur, nom, min, max) {
  if (typeof valeur !== 'string') refuser(`${nom} : texte attendu.`);
  if (RETOUR_LIGNE.test(valeur)) refuser(`${nom} : les retours à la ligne ne sont pas acceptés.`);
  if (/[<>]/.test(valeur)) refuser(`${nom} : les caractères < et > ne sont pas acceptés.`);
  if (CONTROLE.test(valeur)) refuser(`${nom} : caractère invalide.`);
  const propre = valeur.replace(/[ \t]+/g, ' ').trim();
  const longueur = Array.from(propre).length;
  if (longueur < min) refuser(min === 1 ? `${nom} : obligatoire.` : `${nom} : ${min} caractères au moins.`);
  if (longueur > max) refuser(`${nom} : ${max} caractères au plus.`);
  return propre;
}

const objet = (valeur) => valeur !== null && typeof valeur === 'object' && !Array.isArray(valeur);

// Adresse https d'un des domaines autorisés (nom exact : « facebook.com.evil.bj » est refusé), sans identifiant ni port.
// Renvoie l'adresse normalisée par le lecteur d'URL (espaces et accents encodés), celle que suivra le navigateur.
function adresseHttps(valeur, nom, domaines, cheminValide) {
  const brute = texte(valeur, nom, 0, URL_MAX);
  if (!brute) return '';
  const invalide = () => refuser(`${nom} : adresse invalide (elle doit commencer par https://${domaines[0]}/).`);
  if (/[\\"'`]/.test(brute) || !/^https:\/\/[^/]/i.test(brute)) invalide();
  let url;
  try { url = new URL(brute); } catch { invalide(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !domaines.includes(url.hostname)
    || !cheminValide(url.pathname) || url.href.length > 2 * URL_MAX) invalide();
  return url.href;
}

// Jour « AAAA-MM-JJ » existant au calendrier, ou vide
function jour(valeur, nom) {
  if (valeur === undefined || valeur === null || valeur === '') return '';
  if (typeof valeur !== 'string' || !DATE.test(valeur)) refuser(`${nom} : date au format AAAA-MM-JJ attendue.`);
  const [a, m, j] = valeur.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== j) refuser(`${nom} : cette date n'existe pas.`);
  return valeur;
}

// Date du jour à Cotonou (UTC+1), « AAAA-MM-JJ »
const jourCotonou = (maintenant = new Date()) => new Date(maintenant.getTime() + DECALAGE_COTONOU_MS).toISOString().slice(0, 10);

// Exécute une validation qui lève ErreurSaisie ; toute autre erreur remonte (erreur serveur)
function valider(fn) {
  return (valeurs) => {
    try {
      if (!objet(valeurs)) return { erreur: 'Valeurs manquantes ou invalides.' };
      return { valeurs: fn(valeurs) };
    } catch (e) {
      if (e instanceof ErreurSaisie) return { erreur: e.message };
      throw e;
    }
  };
}

// Champs modifiés entre deux valeurs, par groupe (libellés du journal)
const egal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
function changements(avant, apres, groupes) {
  return groupes.filter(([, champs]) => champs.some((c) => !egal(avant?.[c], apres?.[c]))).map(([libelle]) => libelle);
}

// Phrase du journal : « Infos pratiques publiées : numéro WhatsApp, horaires »
const phrase = (debut, avant, liste) => (avant ? `${debut} : ${liste.length ? liste.join(', ') : 'aucun changement'}` : `${debut} pour la première fois`);

// ------------------------------------------------------------------
// Infos pratiques
// ------------------------------------------------------------------

const MESSAGES = {
  commande: 'Message WhatsApp « Commander une formule »',
  premiereCommande: 'Message WhatsApp « Première commande »',
  complements: 'Message WhatsApp « Produits de la semaine »',
  fondateur: 'Message WhatsApp « Client fondateur »',
};

function validerInfos(v) {
  // Numéro : les espaces et le « + » saisis sont retirés, puis 229 suivi de 8 ou 10 chiffres
  if (typeof v.whatsappNumero !== 'string') refuser('Numéro WhatsApp : texte attendu (ex. +229 01 23 45 67 89).');
  const numero = v.whatsappNumero.replace(/\s+/g, '').replace(/^\+/, '');
  if (!/^229(\d{8}|\d{10})$/.test(numero)) refuser('Numéro WhatsApp : 229 suivi de 8 ou 10 chiffres (ex. +229 01 23 45 67 89).');

  if (!objet(v.messages)) refuser('Messages WhatsApp : manquants.');
  const messages = {};
  for (const [cle, nom] of Object.entries(MESSAGES)) messages[cle] = texte(v.messages[cle], nom, 1, 300);

  const facebook = adresseHttps(v.facebook, 'Facebook', ['facebook.com', 'www.facebook.com', 'm.facebook.com'], (p) => p.length > 1);
  const tiktok = adresseHttps(v.tiktok, 'TikTok', ['tiktok.com', 'www.tiktok.com'], (p) => /^\/@[^/]+/.test(p));

  if (!objet(v.horaires)) refuser('Horaires : manquants.');
  const { jours, ouverture, fermeture } = v.horaires;
  if (!Array.isArray(jours) || !jours.length) refuser("Jours d'ouverture : choisissez au moins un jour.");
  if (jours.some((j) => !JOURS.includes(j))) refuser("Jours d'ouverture : jour inconnu (lundi à dimanche).");
  if (new Set(jours).size !== jours.length) refuser("Jours d'ouverture : un jour est en double.");
  if (typeof ouverture !== 'string' || !HEURE.test(ouverture)) refuser("Heure d'ouverture : format HH:MM attendu (ex. 09:00).");
  if (typeof fermeture !== 'string' || !HEURE.test(fermeture)) refuser('Heure de fermeture : format HH:MM attendu (ex. 18:00).');
  if (ouverture >= fermeture) refuser("Horaires : l'heure d'ouverture doit précéder l'heure de fermeture.");

  return {
    whatsappNumero: numero,
    messages,
    facebook,
    tiktok,
    horaires: { jours: JOURS.filter((j) => jours.includes(j)), ouverture, fermeture }, // Dans l'ordre de la semaine
    joursLivraison: texte(v.joursLivraison, 'Jours de livraison', 0, 80),
    paiement: texte(v.paiement, 'Moyens de paiement', 1, 120),
  };
}

function resumerInfos(avant, apres) {
  const messages = Object.entries(MESSAGES)
    .filter(([cle]) => avant?.messages?.[cle] !== apres.messages[cle])
    .map(([, nom]) => nom.replace('Message WhatsApp', 'message'));
  return phrase('Infos pratiques publiées', avant, [
    ...changements(avant, apres, [['numéro WhatsApp', ['whatsappNumero']]]),
    ...messages,
    ...changements(avant, apres, [
      ['Facebook', ['facebook']], ['TikTok', ['tiktok']], ['horaires', ['horaires']],
      ['jours de livraison', ['joursLivraison']], ['moyens de paiement', ['paiement']],
    ]),
  ]);
}

// ------------------------------------------------------------------
// Bandeau d'annonce
// ------------------------------------------------------------------

// Lien : vide, chemin interne (« /… », jamais « // » ni « /\ »), ou adresse https://wa.me/…
function lienBandeau(valeur) {
  const lien = texte(valeur, 'Lien du bandeau', 0, URL_MAX);
  if (!lien) return '';
  if (lien.startsWith('/')) {
    if (!/^\/(?![/\\])[^\s\\"'`]*$/.test(lien)) refuser('Lien du bandeau : chemin du site invalide (ex. /blog).');
    return lien;
  }
  return adresseHttps(lien, 'Lien du bandeau', ['wa.me'], (p) => /^\/[\w/-]*$/.test(p));
}

function validerBandeau(v) {
  if (typeof v.actif !== 'boolean') refuser('Bandeau affiché : oui ou non.');
  const message = texte(v.message, 'Message du bandeau', 0, 160);
  if (v.actif && !message) refuser('Message du bandeau : obligatoire pour afficher le bandeau.');
  if (!['info', 'important'].includes(v.ton)) refuser('Ton du bandeau : « info » ou « important ».');
  const lien = lienBandeau(v.lien);
  const texteLien = texte(v.texteLien, 'Texte du lien', 0, 40);
  if (lien && !texteLien) refuser('Texte du lien : obligatoire quand un lien est indiqué.');
  const debut = jour(v.debut, 'Début du bandeau');
  const fin = jour(v.fin, 'Fin du bandeau');
  if (debut && fin && fin < debut) refuser('Fin du bandeau : ne peut pas précéder le début.');
  return { actif: v.actif, message, ton: v.ton, lien, texteLien, debut, fin };
}

function resumerBandeau(avant, apres) {
  const liste = [];
  if (!!avant?.actif !== !!apres.actif) liste.push(apres.actif ? 'affiché' : 'masqué');
  return phrase("Bandeau d'annonce publié", avant, liste.concat(changements(avant, apres, [
    ['message', ['message']], ['ton', ['ton']], ['lien', ['lien', 'texteLien']], ['dates', ['debut', 'fin']],
  ])));
}

// Affiché seulement s'il est actif et que le jour de Cotonou est dans [debut, fin], bornes incluses
function bandeauVisible(valeurs, maintenant = new Date()) {
  if (!valeurs?.actif) return false;
  const aujourdhui = jourCotonou(maintenant);
  return (!valeurs.debut || aujourdhui >= valeurs.debut) && (!valeurs.fin || aujourdhui <= valeurs.fin);
}

// ------------------------------------------------------------------
// Formules de la vitrine (lot B, docs-internes/admin/CONTRAT-site-public-B.md)
// ------------------------------------------------------------------

// Slugs des cartes de l'accueil, dans l'ordre de la liste FORMULES de front/src/config/formules.ts (à garder identiques).
// Seuls les textes des cartes se publient ici ; nom, emoji, teinte, niveau, ordre et produits restent dans le code,
// et le prix vient de la base (« Formules et prix »), jamais de cet écran.
const FORMULES_VITRINE = {
  'ahi-essentiel': 'Essentiel',
  'ahi-equilibre': 'Équilibré',
  'ahi-confort': 'Confort',
};
const SLUGS_VITRINE = Object.keys(FORMULES_VITRINE);
const FOYERS = ['1', '2-3', '4-6'];
const CHAMPS_FORMULE = [['cible', ['cible']], ['accroche', ['accroche']], ['repas', ['repas']], ['heures', ['heures']], ['taille de foyer', ['foyer']]];

// Fourchettes « 20–30 » (repas) et « 2–4h » (heures) : au moins un chiffre ; tiret ou tiret demi-cadratin (U+2013)
const REPAS = /^(?=.*\d)[\d \-–]+$/;
const HEURES = /^(?=.*\d)[\d \-–h]+$/;

function validerFormule(v, nom) {
  if (!objet(v)) refuser(`${nom} : valeurs manquantes.`);
  const cible = texte(v.cible, `${nom} : cible`, 1, 60);
  const accroche = texte(v.accroche, `${nom} : accroche`, 1, 120);
  const repas = texte(v.repas, `${nom} : repas`, 1, 15);
  if (!REPAS.test(repas)) refuser(`${nom} : repas, chiffres et tiret seulement (ex. 20–30).`);
  const heures = texte(v.heures, `${nom} : heures`, 1, 15);
  if (!HEURES.test(heures)) refuser(`${nom} : heures, chiffres, tiret et « h » seulement (ex. 2–4h).`);
  if (!FOYERS.includes(v.foyer)) refuser(`${nom} : taille de foyer, 1, 2-3 ou 4-6.`);
  if (typeof v.recommandee !== 'boolean') refuser(`${nom} : recommandée, oui ou non.`);
  return { cible, accroche, repas, heures, foyer: v.foyer, recommandee: v.recommandee };
}

function validerFormules(v) {
  const inconnue = Object.keys(v).find((slug) => !Object.hasOwn(FORMULES_VITRINE, slug));
  if (inconnue !== undefined) refuser(`Formule inconnue : ${inconnue.slice(0, 40)}.`);
  const formules = {};
  for (const [slug, nom] of Object.entries(FORMULES_VITRINE)) {
    if (!Object.hasOwn(v, slug)) refuser(`${nom} : formule manquante.`);
    formules[slug] = validerFormule(v[slug], nom);
  }
  if (SLUGS_VITRINE.filter((slug) => formules[slug].recommandee).length > 1) refuser('Formule recommandée : une seule au plus.');
  // Le comparateur de l'accueil conseille une formule par taille de foyer : deux formules ne visent pas le même foyer
  const foyers = SLUGS_VITRINE.map((slug) => formules[slug].foyer);
  if (new Set(foyers).size !== foyers.length) refuser('Taille de foyer : une formule différente pour chaque taille (1, 2-3, 4-6).');
  return formules;
}

// Phrase du journal, formule par formule : « Formules publiées : Essentiel (accroche, repas), Confort (cible),
// formule recommandée : Confort »
function resumerFormules(avant, apres) {
  const liste = SLUGS_VITRINE.map((slug) => {
    const champs = changements(avant?.[slug], apres[slug], CHAMPS_FORMULE);
    return champs.length ? `${FORMULES_VITRINE[slug]} (${champs.join(', ')})` : null;
  }).filter(Boolean);
  const recommandee = (valeurs) => SLUGS_VITRINE.find((slug) => valeurs?.[slug]?.recommandee) ?? null;
  const nouvelle = recommandee(apres);
  if (avant && recommandee(avant) !== nouvelle) {
    liste.push(nouvelle ? `formule recommandée : ${FORMULES_VITRINE[nouvelle]}` : 'plus de formule recommandée');
  }
  return phrase('Formules publiées', avant, liste);
}

// ------------------------------------------------------------------

const CONTENUS = {
  infos: { libelle: 'Infos pratiques', valider: valider(validerInfos), resumer: resumerInfos },
  bandeau: {
    libelle: "Bandeau d'annonce", valider: valider(validerBandeau), resumer: resumerBandeau,
    publier: (valeurs, maintenant) => (bandeauVisible(valeurs, maintenant) ? valeurs : null),
  },
  formules: { libelle: 'Formules', valider: valider(validerFormules), resumer: resumerFormules },
};
const CLES = Object.keys(CONTENUS);

// Définition d'une clé, ou null (jamais une propriété héritée comme « constructor » ou « __proto__ »)
const contenu = (cle) => (typeof cle === 'string' && Object.hasOwn(CONTENUS, cle) ? CONTENUS[cle] : null);

module.exports = { CONTENUS, CLES, contenu, bandeauVisible, jourCotonou, egal, SLUGS_VITRINE };
