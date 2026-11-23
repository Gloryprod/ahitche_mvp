// Contenus du site public modifiables depuis l'admin (écran « Site public », section « site »).
// Contrats : docs-internes/admin/CONTRAT-site-public-A.md (lot A : « infos », infos pratiques, et « bandeau »),
// CONTRAT-site-public-B.md (lot B : « formules », textes des cartes de la vitrine), CONTRAT-site-public-C.md
// (lot C : « faq » et « actualites », des listes, avec des variables dans les réponses et les résumés) et
// CONTRAT-site-public-D.md (lot D : « photos » de la frise, envoyées dans Cloudinary, et « temoignages »).
// Un nouveau contenu s'ajoute à la table CONTENUS, sans toucher au contrôleur :
//   cle → { libelle, valider(valeurs, contexte?) → { valeurs } | { erreur }, resumer(avant, apres, contexte?) → texte,
//           publier?(valeurs, maintenant), charger?() → contexte }
//  - valider : contrôle complet, renvoie seulement les champs du contrat, nettoyés (jamais un champ inconnu) ;
//  - resumer : phrase du journal, ce qui change en clair (« Infos pratiques publiées : numéro WhatsApp, horaires ») ;
//  - publier : facultatif, ce que voit le site à cet instant (ex. bandeau hors de ses dates → null, questions masquées retirées) ;
//  - charger : facultatif, données de la base lues avant une publication et passées à valider et resumer (ex. les packs
//    des formules) ; à la relecture par le site, valider est appelé sans contexte.
// Aucune valeur par défaut ici : sans publication, le site garde celles du code (front/src/config/contact.ts,
// formules.ts, faq.ts, actualites.ts, photos.ts, temoignages.ts) ; seul llms.txt en garde une copie côté serveur
// (services/llmsService.js).

const { echapperRegex } = require('../utils/texte');
const { TYPE_PACK, typeDepuisSlug, listerPacks } = require('./packService');

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
// cheminValide(chemin, domaine) contrôle le chemin ; `message` remplace le motif de refus par défaut.
function adresseHttps(valeur, nom, domaines, cheminValide, message = `adresse invalide (elle doit commencer par https://${domaines[0]}/)`) {
  const brute = texte(valeur, nom, 0, URL_MAX);
  if (!brute) return '';
  const invalide = () => refuser(`${nom} : ${message}.`);
  if (/[\\"'`]/.test(brute) || !/^https:\/\/[^/]/i.test(brute)) invalide();
  let url;
  try { url = new URL(brute); } catch { invalide(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !domaines.includes(url.hostname)
    || !cheminValide(url.pathname, url.hostname) || url.href.length > 2 * URL_MAX) invalide();
  return url.href;
}

// Chemin interne du site : « /… », jamais « // » ni « /\ » (adresse d'un autre site pour le navigateur), sans espace ni guillemet
const CHEMIN_INTERNE = /^\/(?![/\\])[^\s\\"'`]*$/;
// Ancre de l'accueil : « #formules » (lettres, chiffres, tiret)
const ANCRE = /^#[A-Za-z0-9-]+$/;

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

// Exécute une validation qui lève ErreurSaisie ; toute autre erreur remonte (erreur serveur).
// `liste` : les valeurs sont une liste (faq, actualites), sinon un objet. `contexte` : ce que renvoie charger(), s'il existe.
function valider(fn, liste = false) {
  return (valeurs, contexte) => {
    try {
      if (liste ? !Array.isArray(valeurs) : !objet(valeurs)) return { erreur: 'Valeurs manquantes ou invalides.' };
      return { valeurs: fn(valeurs, contexte) };
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
    if (!CHEMIN_INTERNE.test(lien)) refuser('Lien du bandeau : chemin du site invalide (ex. /blog).');
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
// Cartes des formules de l'accueil (lot B, docs-internes/admin/CONTRAT-site-public-B.md)
// ------------------------------------------------------------------

// Une carte se règle ici pour tout pack de la base (collection Formules, services/packService.js) : affichage, ordre,
// emoji, couleur, niveau et textes. Le nom du pack et son prix viennent de la base (« Formules et prix »), jamais de cet écran.
// Cartes par défaut, dans l'ordre de la liste FORMULES de front/src/config/formules.ts (à garder identiques) : affichées
// tant qu'aucune publication ne dit le contraire (rien de publié, publication sans le champ « afficher », d'avant les
// cartes réglables). Leur nom court sert aux messages et au journal.
const FORMULES_VITRINE = {
  'ahi-essentiel': 'Essentiel',
  'ahi-equilibre': 'Équilibré',
  'ahi-confort': 'Confort',
};
const SLUGS_VITRINE = Object.keys(FORMULES_VITRINE);
const FOYERS = ['1', '2-3', '4-6', '']; // '' : carte proposée par aucun choix du comparateur « taille du foyer »
const COULEURS = ['savane', 'foret', 'marine']; // Thèmes prêts à l'emploi des cartes (front), sinon une couleur libre
const HEXA = /^#[0-9A-Fa-f]{6}$/;
const CHAMPS_FORMULE = [
  ['ordre', ['ordre']], ['emoji', ['emoji']], ['couleur', ['couleur']], ['niveau de confort', ['niveau']],
  ['cible', ['cible']], ['accroche', ['accroche']], ['repas', ['repas']], ['heures', ['heures']], ['taille de foyer', ['foyer']],
];

// Fourchettes « 20–30 » (repas) et « 2–4h » (heures) : au moins un chiffre ; tiret ou tiret demi-cadratin (U+2013)
const REPAS = /^(?=.*\d)[\d \-–]+$/;
const HEURES = /^(?=.*\d)[\d \-–h]+$/;

// Nom d'une carte dans les messages et le journal : nom court d'une carte par défaut, sinon nom du pack en base
const nomCarte = (slug, packs) => (Object.hasOwn(FORMULES_VITRINE, slug) ? FORMULES_VITRINE[slug] : packs?.find((p) => p.slug === slug)?.nom ?? slug);

// Carte voulue sur l'accueil : « afficher » publié ; sans ce champ, seulement les 3 cartes par défaut
const afficherCarte = (publication, slug) => publication?.[slug]?.afficher ?? Object.hasOwn(FORMULES_VITRINE, slug);

/**
 * Cartes affichées sur l'accueil, règle unique de GET /api/public/site et de llms.txt : pack actif et carte voulue
 * (afficherCarte), dans l'ordre publié, puis celui des cartes par défaut, puis celui des packs.
 * @param {object | null} publication valeurs publiées de « formules », déjà validées (null : rien de publié)
 * @param {{ slug, nom, statut, bientotDisponible }[]} packs packService.listerPacks()
 * @returns {object[]} les packs affichés, dans l'ordre d'affichage
 */
function cartesAffichees(publication, packs) {
  const rang = (slug) => (SLUGS_VITRINE.includes(slug) ? SLUGS_VITRINE.indexOf(slug) : SLUGS_VITRINE.length);
  const ordre = (slug) => publication?.[slug]?.ordre ?? rang(slug);
  return packs.filter((p) => p.statut === 'actif' && afficherCarte(publication, p.slug))
    .sort((a, b) => ordre(a.slug) - ordre(b.slug) || rang(a.slug) - rang(b.slug));
}

// `publication` : tous les champs sont obligatoires. À la relecture par le site, les réglages de la carte (afficher,
// ordre, emoji, couleur, niveau) peuvent manquer, dans une publication plus ancienne (textes seulement) : ils sont omis.
function validerFormule(v, nom, publication) {
  if (!objet(v)) refuser(`${nom} : valeurs manquantes.`);
  const carte = {};
  const reglage = (champ, controle) => { if (publication || v[champ] !== undefined) carte[champ] = controle(v[champ]); };
  reglage('afficher', (x) => (typeof x === 'boolean' ? x : refuser(`${nom} : afficher sur l'accueil, oui ou non.`)));
  reglage('ordre', (x) => (Number.isInteger(x) && x >= 0 && x <= 99 ? x : refuser(`${nom} : ordre, un nombre entier de 0 à 99.`)));
  reglage('emoji', (x) => {
    const emoji = texte(x, `${nom} : emoji`, 1, 8);
    return /\p{Cc}/u.test(emoji) ? refuser(`${nom} : emoji, caractère invalide.`) : emoji;
  });
  reglage('couleur', (x) => (COULEURS.includes(x) || (typeof x === 'string' && HEXA.test(x))
    ? x : refuser(`${nom} : couleur, savane, foret, marine ou un code #RRGGBB (ex. #1C2E4A).`)));
  reglage('niveau', (x) => ([1, 2, 3].includes(x) ? x : refuser(`${nom} : niveau de confort, 1, 2 ou 3.`)));
  const cible = texte(v.cible, `${nom} : cible`, 1, 60);
  const accroche = texte(v.accroche, `${nom} : accroche`, 1, 120);
  const repas = texte(v.repas, `${nom} : repas`, 1, 15);
  if (!REPAS.test(repas)) refuser(`${nom} : repas, chiffres et tiret seulement (ex. 20–30).`);
  const heures = texte(v.heures, `${nom} : heures`, 1, 15);
  if (!HEURES.test(heures)) refuser(`${nom} : heures, chiffres, tiret et « h » seulement (ex. 2–4h).`);
  if (!FOYERS.includes(v.foyer)) refuser(`${nom} : taille de foyer, 1, 2-3, 4-6 ou aucune.`);
  if (typeof v.recommandee !== 'boolean') refuser(`${nom} : recommandée, oui ou non.`);
  return { ...carte, cible, accroche, repas, heures, foyer: v.foyer, recommandee: v.recommandee };
}

// `packs` (chargés avant une publication) : seuls les packs de la base sont acceptés. Sans packs (relecture par le
// site) : slug au format d'un pack, même s'il n'existe plus (cartesAffichees l'écarte alors).
function validerFormules(v, packs) {
  const publication = Array.isArray(packs);
  const connu = (slug) => (publication ? packs.some((p) => p.slug === slug) : TYPE_PACK.test(typeDepuisSlug(slug)));
  const inconnue = Object.keys(v).find((slug) => !connu(slug));
  if (inconnue !== undefined) refuser(`Formule inconnue : ${inconnue.slice(0, 40)}.`);
  const formules = {};
  for (const slug of Object.keys(v)) formules[slug] = validerFormule(v[slug], nomCarte(slug, packs), publication);
  if (publication && !cartesAffichees(formules, packs).length) refuser("Cartes de l'accueil : au moins une carte doit être affichée (pack actif).");
  // Comparateur de l'accueil : sur les cartes voulues, pack actif ou non (sa réactivation ne crée pas de conflit)
  const affichees = Object.keys(formules).filter((slug) => afficherCarte(formules, slug));
  if (affichees.filter((slug) => formules[slug].recommandee).length > 1) refuser('Formule recommandée : une seule au plus parmi les cartes affichées.');
  // Une carte conseillée par taille de foyer : deux cartes affichées ne visent pas le même foyer
  const foyers = affichees.map((slug) => formules[slug].foyer).filter(Boolean);
  if (new Set(foyers).size !== foyers.length) refuser('Taille de foyer : une carte affichée différente pour chaque taille (1, 2-3, 4-6).');
  return formules;
}

// Phrase du journal, carte par carte : « Formules publiées : Essentiel (masquée), AHI Étudiant (affichée, emoji, cible),
// formule recommandée : Confort »
function resumerFormules(avant, apres, packs) {
  const slugs = [...new Set([...Object.keys(apres), ...Object.keys(objet(avant) ? avant : {})])];
  const liste = slugs.map((slug) => {
    const champs = changements(avant?.[slug], apres[slug], CHAMPS_FORMULE);
    if (afficherCarte(avant, slug) !== afficherCarte(apres, slug)) champs.unshift(afficherCarte(apres, slug) ? 'affichée' : 'masquée');
    return champs.length ? `${nomCarte(slug, packs)} (${champs.join(', ')})` : null;
  }).filter(Boolean);
  const recommandee = (valeurs) => Object.keys(objet(valeurs) ? valeurs : {})
    .find((slug) => afficherCarte(valeurs, slug) && valeurs[slug]?.recommandee) ?? null;
  const nouvelle = recommandee(apres);
  if (avant && recommandee(avant) !== nouvelle) {
    liste.push(nouvelle ? `formule recommandée : ${nomCarte(nouvelle, packs)}` : 'plus de formule recommandée');
  }
  return phrase('Formules publiées', avant, liste);
}

// ------------------------------------------------------------------
// Questions fréquentes et actualités (lot C, docs-internes/admin/CONTRAT-site-public-C.md)
// ------------------------------------------------------------------

// Variables des réponses de la FAQ et des résumés des actualités, remplacées à l'affichage par le site (et par l'aperçu
// de l'admin) avec les valeurs publiées : le texte reste juste quand le paiement, les jours de livraison ou les
// horaires changent. Liste à garder identique à celle du front.
const VARIABLES = ['paiement', 'livraison', 'jours_livraison', 'horaires', 'whatsapp', 'nb_produits'];
const LISTE_VARIABLES = VARIABLES.map((v) => `{${v}}`).join(', ');
const VARIABLE = /\{([^{}]*)\}/g;

// Texte qui accepte les variables : chaque accolade appartient à une variable connue (« {prix} » ou « { » seule : refus)
function texteAvecVariables(valeur, nom, min, max) {
  const propre = texte(valeur, nom, min, max);
  for (const [, variable] of propre.matchAll(VARIABLE)) {
    if (!VARIABLES.includes(variable)) {
      refuser(`${nom} : variable inconnue : {${Array.from(variable).slice(0, 30).join('')}}. Variables possibles : ${LISTE_VARIABLES}.`);
    }
  }
  if (/[{}]/.test(propre.replace(VARIABLE, ''))) refuser(`${nom} : accolade seule ; une variable s'écrit entre accolades, par exemple {paiement}.`);
  return propre;
}

// Texte sans variable (question, titre, catégorie, texte d'un lien) : aucune accolade, pour qu'aucune ne s'affiche telle quelle
function texteSansVariable(valeur, nom, min, max) {
  const propre = texte(valeur, nom, min, max);
  if (/[{}]/.test(propre)) refuser(`${nom} : les accolades ne sont acceptées que dans les réponses et les résumés, pour les variables.`);
  return propre;
}

// Identifiant stable d'un élément de liste (« paiement », « lancement-2026 »), unique dans la liste
const IDENTIFIANT = /^[a-z0-9-]{1,40}$/;
function identifiant(valeur, nom, vus, element) {
  if (typeof valeur !== 'string' || !IDENTIFIANT.test(valeur)) {
    refuser(`${nom} : identifiant invalide (1 à 40 caractères : lettres minuscules sans accent, chiffres, tiret).`);
  }
  if (vus.has(valeur)) refuser(`${nom} : identifiant « ${valeur} » déjà utilisé par ${element} ${vus.get(valeur)}.`);
  return valeur;
}

// Pages externes admises dans une carte d'actualité, chemin contrôlé comme au lot A (Facebook, TikTok « /@… », wa.me)
const DOMAINES_FACEBOOK = ['facebook.com', 'www.facebook.com', 'm.facebook.com'];
const DOMAINES_TIKTOK = ['tiktok.com', 'www.tiktok.com'];
const DOMAINES_EXTERNES = [...DOMAINES_FACEBOOK, ...DOMAINES_TIKTOK, 'wa.me'];
function cheminExterne(chemin, domaine) {
  if (DOMAINES_FACEBOOK.includes(domaine)) return chemin.length > 1;
  if (DOMAINES_TIKTOK.includes(domaine)) return /^\/@[^/]+/.test(chemin);
  return /^\/[\w/-]*$/.test(chemin); // wa.me
}

// Lien sous une question ou une carte : null, ou { texte, vers }. Absent, null ou deux champs vides : pas de lien.
// vers : chemin interne (« /… »), ancre (« #… ») ou, si `externe`, une page https:// Facebook, TikTok ou WhatsApp.
function lienContenu(valeur, nom, maxTexte, externe) {
  if (valeur === undefined || valeur === null) return null;
  if (!objet(valeur)) refuser(`${nom} : lien invalide.`);
  const vide = (v) => typeof v === 'string' && !v.trim();
  if (vide(valeur.texte) && vide(valeur.vers)) return null;
  const texteLien = texteSansVariable(valeur.texte, `${nom} : texte du lien`, 1, maxTexte);
  const nomVers = `${nom} : adresse du lien`;
  const vers = texte(valeur.vers, nomVers, 1, URL_MAX);
  const attendu = externe
    ? 'chemin du site (ex. /blog), ancre de l\'accueil (ex. #formules) ou page https:// Facebook, TikTok ou WhatsApp'
    : 'chemin du site (ex. /mentions-legales) ou ancre de l\'accueil (ex. #formules)';
  if (vers.startsWith('/')) {
    if (!CHEMIN_INTERNE.test(vers)) refuser(`${nomVers} : chemin du site invalide (${attendu}).`);
    return { texte: texteLien, vers };
  }
  if (vers.startsWith('#')) {
    if (!ANCRE.test(vers)) refuser(`${nomVers} : ancre invalide, lettres, chiffres et tiret seulement (ex. #formules).`);
    return { texte: texteLien, vers };
  }
  if (!externe) refuser(`${nomVers} : ${attendu}.`);
  return { texte: texteLien, vers: adresseHttps(vers, nomVers, DOMAINES_EXTERNES, cheminExterne, `adresse invalide (${attendu})`) };
}

const FAQ_MAX = 15;
const ACTUALITES_MAX = 3;
const ICONES = ['lancement', 'partenaire', 'communaute'];

// Liste de 1 à 15 questions, dans l'ordre d'affichage ; au moins une affichée sur le site
function validerFaq(liste) {
  if (!liste.length) refuser('Questions fréquentes : ajoutez au moins une question.');
  if (liste.length > FAQ_MAX) refuser(`Questions fréquentes : ${FAQ_MAX} questions au plus.`);
  const vus = new Map();
  const faq = liste.map((q, i) => {
    const nom = `Question ${i + 1}`;
    if (!objet(q)) refuser(`${nom} : valeurs manquantes.`);
    const id = identifiant(q.id, nom, vus, 'la question');
    vus.set(id, i + 1);
    const question = texteSansVariable(q.question, `${nom} : question`, 5, 140);
    const reponse = texteAvecVariables(q.reponse, `${nom} : réponse`, 10, 700);
    if (typeof q.visible !== 'boolean') refuser(`${nom} : « Afficher sur le site », oui ou non.`);
    return { id, question, reponse, visible: q.visible, lien: lienContenu(q.lien, nom, 50, false) };
  });
  if (!faq.some((q) => q.visible)) refuser('Questions fréquentes : au moins une question doit être affichée sur le site.');
  return faq;
}

// Liste de 0 à 3 cartes, dans l'ordre d'affichage (vide : section « Actualités » masquée)
function validerActualites(liste) {
  if (liste.length > ACTUALITES_MAX) refuser(`Actualités : ${ACTUALITES_MAX} cartes au plus.`);
  const vus = new Map();
  return liste.map((c, i) => {
    const nom = `Carte ${i + 1}`;
    if (!objet(c)) refuser(`${nom} : valeurs manquantes.`);
    const id = identifiant(c.id, nom, vus, 'la carte');
    vus.set(id, i + 1);
    const categorie = texteSansVariable(c.categorie, `${nom} : catégorie`, 2, 30);
    if (!ICONES.includes(c.icone)) refuser(`${nom} : icône, « lancement », « partenaire » ou « communaute ».`);
    const titre = texteSansVariable(c.titre, `${nom} : titre`, 5, 90);
    const resume = texteAvecVariables(c.resume, `${nom} : résumé`, 10, 300);
    return { id, categorie, icone: c.icone, titre, resume, lien: lienContenu(c.lien, nom, 40, true) };
  });
}

// Écarts entre deux listes, élément par élément (même identifiant) : positions (dans la nouvelle liste, à partir de 1)
// des ajoutés, modifiés (champs du contenu), masqués et affichés à nouveau ; nombre de supprimés ; ordre changé
function ecartsListe(avant, apres, champs) {
  const anciens = new Map((Array.isArray(avant) ? avant : []).filter(objet).map((e) => [e.id, e]));
  const ids = new Set(apres.map((e) => e.id));
  const e = { ajoutes: [], modifies: [], masques: [], affiches: [], supprimes: 0, ordre: false };
  apres.forEach((element, i) => {
    const ancien = anciens.get(element.id);
    if (!ancien) { e.ajoutes.push(i + 1); return; }
    if (champs.some((c) => !egal(ancien[c], element[c]))) e.modifies.push(i + 1);
    if ('visible' in element && !!ancien.visible !== element.visible) (element.visible ? e.affiches : e.masques).push(i + 1);
  });
  e.supprimes = [...anciens.keys()].filter((id) => !ids.has(id)).length;
  e.ordre = !egal([...anciens.keys()].filter((id) => ids.has(id)), apres.map((x) => x.id).filter((id) => anciens.has(id)));
  return e;
}

// « 1 et 3 », « 1, 2 et 3 »
const enumerer = (n) => (n.length > 1 ? `${n.slice(0, -1).join(', ')} et ${n[n.length - 1]}` : String(n[0]));

// Écarts d'une liste en clair : « 2 questions modifiées, 1 ajoutée, 1 masquée, ordre changé » (le nom seulement au
// premier groupe). `nom` : [singulier, pluriel] ; `feminin` accorde les participes (question modifiée, témoignage modifié).
function decompte(e, [singulier, pluriel], feminin) {
  const accord = (participe, n) => `${participe}${feminin ? 'e' : ''}${n > 1 ? 's' : ''}`;
  const liste = [];
  for (const [n, participe, suite] of [
    [e.modifies.length, 'modifié', ''], [e.ajoutes.length, 'ajouté', ''], [e.supprimes, 'supprimé', ''],
    [e.masques.length, 'masqué', ''], [e.affiches.length, 'affiché', ' à nouveau'],
  ]) {
    if (!n) continue;
    const nom = liste.length ? '' : ` ${n > 1 ? pluriel : singulier}`;
    liste.push(`${n}${nom} ${accord(participe, n)}${suite}`);
  }
  if (e.ordre) liste.push('ordre changé');
  return liste;
}

// « FAQ publiée : 2 questions modifiées, 1 ajoutée, 1 masquée, ordre changé »
function resumerFaq(avant, apres) {
  const e = ecartsListe(avant, apres, ['question', 'reponse', 'lien']);
  return phrase('FAQ publiée', avant, decompte(e, ['question', 'questions'], true));
}

// « Actualités publiées : carte 2 modifiée, carte 3 ajoutée, 1 carte supprimée, ordre changé »
function resumerActualites(avant, apres) {
  const e = ecartsListe(avant, apres, ['categorie', 'icone', 'titre', 'resume', 'lien']);
  const cartes = (positions, singulier, pluriel) => (positions.length > 1
    ? `cartes ${enumerer(positions)} ${pluriel}` : `carte ${positions[0]} ${singulier}`);
  const liste = [];
  if (e.modifies.length) liste.push(cartes(e.modifies, 'modifiée', 'modifiées'));
  if (e.ajoutes.length) liste.push(cartes(e.ajoutes, 'ajoutée', 'ajoutées'));
  if (e.supprimes) liste.push(`${e.supprimes} carte${e.supprimes > 1 ? 's supprimées' : ' supprimée'}`);
  if (e.ordre) liste.push('ordre changé');
  if (!apres.length && Array.isArray(avant) && avant.length) liste.push('section « Actualités » masquée');
  return phrase('Actualités publiées', avant, liste);
}

// Ce que reçoit le site : les questions affichées seulement, sans le champ `visible`
const faqPubliee = (faq) => faq.filter((q) => q.visible).map(({ id, question, reponse, lien }) => ({ id, question, reponse, lien }));

// ------------------------------------------------------------------
// Photos de la frise (lot D, docs-internes/admin/CONTRAT-site-public-D.md)
// ------------------------------------------------------------------

// Emplacements de la frise « De la ferme à vous » : clés de front/src/config/photos.ts et titres des étapes de
// components/sections/FermeAVous.vue (à garder identiques). La photo du haut de l'accueil (heroReception) reste dans le
// code : elle est rendue au build et chargée en priorité (vitesse sur téléphone).
const EMPLACEMENTS_PHOTOS = {
  fermeProduction: 'Production',
  fermeRecolte: 'Récolte et tri',
  fermePreparation: 'Préparation',
  fermeLivraison: 'Livraison',
  fermeReception: 'Réception',
};
// Adresse vide : l'emplacement garde la photo du code (« Revenir à la photo du code ») ; les autres champs sont alors vidés
const PHOTO_DU_CODE = { url: '', publicId: '', alt: '', droits: false };
// Identifiant Cloudinary d'une photo envoyée par POST /api/admin/site/photo (dossier « site »)
const PHOTO_ID = /^site\/[\w-]{1,200}$/;

/**
 * Contrôle une photo envoyée depuis l'écran : identifiant « site/… » et adresse
 * https://res.cloudinary.com/<CLOUDINARY_CLOUD_NAME>/image/upload/[v…/]<identifiant>.<jpg|jpeg|png|webp>, telle que
 * Cloudinary la renvoie (ni autre compte ou domaine, ni transformation, ni paramètre : le site ajoute les siennes).
 * Sert aussi à la route d'envoi, pour vérifier la réponse de Cloudinary.
 * @returns {string | null} motif du refus, ou null si la photo est valide
 */
function refusPhoto(url, publicId) {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloud) return "le stockage des photos n'est pas configuré sur le serveur";
  if (typeof publicId !== 'string' || !PHOTO_ID.test(publicId)) return 'identifiant de photo invalide ; envoyez la photo depuis cet écran';
  const attendue = new RegExp(`^https://res\\.cloudinary\\.com/${echapperRegex(cloud)}/image/upload/(?:v\\d{1,12}/)?${echapperRegex(publicId)}\\.(?:jpg|jpeg|png|webp)$`);
  if (typeof url !== 'string' || !attendue.test(url)) return 'adresse refusée ; envoyez la photo depuis cet écran';
  return null;
}

function validerPhoto(v, nom) {
  if (!objet(v)) refuser(`${nom} : valeurs manquantes.`);
  const url = texte(v.url, `${nom} : adresse`, 0, URL_MAX);
  if (!url) return { ...PHOTO_DU_CODE };
  const motif = refusPhoto(url, v.publicId);
  if (motif) refuser(`${nom} : ${motif}.`);
  const alt = texte(v.alt ?? '', `${nom} : description`, 0, 200);
  if (!alt) refuser(`${nom} : description obligatoire (ce que montre la photo, lue aux personnes malvoyantes).`);
  if (Array.from(alt).length < 10) refuser(`${nom} : description : 10 caractères au moins.`);
  if (v.droits !== true) {
    refuser(`${nom} : cochez la case des droits (photo prise par l'équipe Ahitché, ou fournie avec l'accord écrit de son auteur et des personnes visibles).`);
  }
  return { url, publicId: v.publicId, alt, droits: true };
}

// Les 5 emplacements, obligatoires ; aucune autre clé
function validerPhotos(v) {
  const inconnu = Object.keys(v).find((cle) => !Object.hasOwn(EMPLACEMENTS_PHOTOS, cle));
  if (inconnu !== undefined) refuser(`Emplacement de photo inconnu : ${inconnu.slice(0, 40)}.`);
  const photos = {};
  for (const [cle, titre] of Object.entries(EMPLACEMENTS_PHOTOS)) {
    const nom = `Photo « ${titre} »`;
    if (!Object.hasOwn(v, cle)) refuser(`${nom} : emplacement manquant.`);
    photos[cle] = validerPhoto(v[cle], nom);
  }
  return photos;
}

// « Photos de la frise publiées : Production (photo remplacée), Livraison (photo du code rétablie), Réception (description modifiée) »
function resumerPhotos(avant, apres) {
  const liste = Object.entries(EMPLACEMENTS_PHOTOS).map(([cle, titre]) => {
    const ancienne = objet(avant?.[cle]) && avant[cle].url ? avant[cle] : PHOTO_DU_CODE;
    const nouvelle = apres[cle];
    if (ancienne.url !== nouvelle.url) return `${titre} (${nouvelle.url ? 'photo remplacée' : 'photo du code rétablie'})`;
    if (nouvelle.url && ancienne.alt !== nouvelle.alt) return `${titre} (description modifiée)`;
    return null;
  }).filter(Boolean);
  if (!avant) return `Photos de la frise publiées pour la première fois${liste.length ? ` : ${liste.join(', ')}` : ''}`;
  return phrase('Photos de la frise publiées', avant, liste);
}

// ------------------------------------------------------------------
// Témoignages (lot D) : avis réels sans compte client (accord de la personne daté), affichés après les avis des clients
// ------------------------------------------------------------------

const TEMOIGNAGES_MAX = 6;
const ACCORD_MIN = '2026-01-01';
const dateFr = (j) => j.split('-').reverse().join('/'); // « 2026-10-04 » → « 04/10/2026 »

// Liste de 0 à 6 témoignages, dans l'ordre d'affichage. accordLe : jour où la personne a validé le texte et accepté sa
// publication, ni avant le 01/01/2026 ni après aujourd'hui (jour de Cotonou)
function validerTemoignages(liste, maintenant = new Date()) {
  if (liste.length > TEMOIGNAGES_MAX) refuser(`Témoignages : ${TEMOIGNAGES_MAX} au plus.`);
  const aujourdhui = jourCotonou(maintenant);
  const vus = new Map();
  return liste.map((t, i) => {
    const nom = `Témoignage ${i + 1}`;
    if (!objet(t)) refuser(`${nom} : valeurs manquantes.`);
    const id = identifiant(t.id, nom, vus, 'le témoignage');
    vus.set(id, i + 1);
    const prenom = texteSansVariable(t.prenom, `${nom} : prénom`, 2, 40);
    const quartier = texteSansVariable(t.quartier, `${nom} : quartier`, 0, 60);
    if (!Number.isInteger(t.note) || t.note < 1 || t.note > 5) refuser(`${nom} : note, un nombre entier de 1 à 5.`);
    const propos = texteSansVariable(t.texte, `${nom} : texte`, 20, 600);
    const accordLe = jour(t.accordLe, `${nom} : date de l'accord`);
    if (!accordLe) refuser(`${nom} : date de l'accord obligatoire (jour où la personne a validé le texte et accepté sa publication).`);
    if (accordLe < ACCORD_MIN) refuser(`${nom} : date de l'accord, pas avant le ${dateFr(ACCORD_MIN)}.`);
    if (accordLe > aujourdhui) refuser(`${nom} : date de l'accord dans le futur (nous sommes le ${dateFr(aujourdhui)} à Cotonou).`);
    if (typeof t.visible !== 'boolean') refuser(`${nom} : « Afficher sur le site », oui ou non.`);
    return { id, prenom, quartier, note: t.note, texte: propos, accordLe, visible: t.visible };
  });
}

// « Témoignages publiés : 1 témoignage modifié, 2 ajoutés, 1 masqué, ordre changé »
function resumerTemoignages(avant, apres) {
  const e = ecartsListe(avant, apres, ['prenom', 'quartier', 'note', 'texte', 'accordLe']);
  return phrase('Témoignages publiés', avant, decompte(e, ['témoignage', 'témoignages'], false));
}

// Ce que reçoit le site : les témoignages affichés seulement, comme GET /api/public/avis (ni accordLe, ni visible, ni id)
const temoignagesPublies = (liste) => liste.filter((t) => t.visible)
  .map((t) => ({ prenom: t.prenom, quartier: t.quartier, note: t.note, texte: t.texte }));

// ------------------------------------------------------------------

const CONTENUS = {
  infos: { libelle: 'Infos pratiques', valider: valider(validerInfos), resumer: resumerInfos },
  bandeau: {
    libelle: "Bandeau d'annonce", valider: valider(validerBandeau), resumer: resumerBandeau,
    publier: (valeurs, maintenant) => (bandeauVisible(valeurs, maintenant) ? valeurs : null),
  },
  formules: { libelle: 'Formules', valider: valider(validerFormules), resumer: resumerFormules, charger: () => listerPacks() },
  faq: { libelle: 'Questions fréquentes', valider: valider(validerFaq, true), resumer: resumerFaq, publier: faqPubliee },
  actualites: { libelle: 'Actualités', valider: valider(validerActualites, true), resumer: resumerActualites },
  photos: { libelle: 'Photos de la frise', valider: valider(validerPhotos), resumer: resumerPhotos },
  temoignages: {
    libelle: 'Témoignages', valider: valider(validerTemoignages, true), resumer: resumerTemoignages, publier: temoignagesPublies,
  },
};
const CLES = Object.keys(CONTENUS);

// Définition d'une clé, ou null (jamais une propriété héritée comme « constructor » ou « __proto__ »)
const contenu = (cle) => (typeof cle === 'string' && Object.hasOwn(CONTENUS, cle) ? CONTENUS[cle] : null);

module.exports = { CONTENUS, CLES, contenu, bandeauVisible, jourCotonou, egal, SLUGS_VITRINE, cartesAffichees, VARIABLES, refusPhoto };
