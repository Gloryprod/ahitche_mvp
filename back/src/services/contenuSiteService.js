// Contenus du site public modifiables depuis l'admin (écran « Site public », section « site »).
// Contrats : docs-internes/admin/CONTRAT-site-public-A.md (lot A : « infos », infos pratiques, et « bandeau »),
// CONTRAT-site-public-B.md (lot B : « formules », textes des cartes de la vitrine) et CONTRAT-site-public-C.md
// (lot C : « faq » et « actualites », des listes, avec des variables dans les réponses et les résumés).
// Les lots suivants (photos) s'ajoutent à la table CONTENUS, sans toucher au contrôleur :
//   cle → { libelle, valider(valeurs) → { valeurs } | { erreur }, resumer(avant, apres) → texte, publier?(valeurs, maintenant) }
//  - valider : contrôle complet, renvoie seulement les champs du contrat, nettoyés (jamais un champ inconnu) ;
//  - resumer : phrase du journal, ce qui change en clair (« Infos pratiques publiées : numéro WhatsApp, horaires ») ;
//  - publier : facultatif, ce que voit le site à cet instant (ex. bandeau hors de ses dates → null, questions masquées retirées).
// Aucune valeur par défaut ici : sans publication, le site garde celles du code (front/src/config/contact.ts,
// formules.ts, faq.ts, actualites.ts) ; seul llms.txt en garde une copie côté serveur (services/llmsService.js).

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
// `liste` : les valeurs sont une liste (faq, actualites), sinon un objet.
function valider(fn, liste = false) {
  return (valeurs) => {
    try {
      if (liste ? !Array.isArray(valeurs) : !objet(valeurs)) return { erreur: 'Valeurs manquantes ou invalides.' };
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

// « FAQ publiée : 2 questions modifiées, 1 ajoutée, 1 masquée, ordre changé »
function resumerFaq(avant, apres) {
  const e = ecartsListe(avant, apres, ['question', 'reponse', 'lien']);
  const liste = [];
  for (const [n, singulier, pluriel] of [
    [e.modifies.length, 'modifiée', 'modifiées'], [e.ajoutes.length, 'ajoutée', 'ajoutées'], [e.supprimes, 'supprimée', 'supprimées'],
    [e.masques.length, 'masquée', 'masquées'], [e.affiches.length, 'affichée à nouveau', 'affichées à nouveau'],
  ]) {
    if (!n) continue;
    const nom = liste.length ? '' : (n > 1 ? ' questions' : ' question'); // Le nom seulement au premier groupe
    liste.push(`${n}${nom} ${n > 1 ? pluriel : singulier}`);
  }
  if (e.ordre) liste.push('ordre changé');
  return phrase('FAQ publiée', avant, liste);
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

const CONTENUS = {
  infos: { libelle: 'Infos pratiques', valider: valider(validerInfos), resumer: resumerInfos },
  bandeau: {
    libelle: "Bandeau d'annonce", valider: valider(validerBandeau), resumer: resumerBandeau,
    publier: (valeurs, maintenant) => (bandeauVisible(valeurs, maintenant) ? valeurs : null),
  },
  formules: { libelle: 'Formules', valider: valider(validerFormules), resumer: resumerFormules },
  faq: { libelle: 'Questions fréquentes', valider: valider(validerFaq, true), resumer: resumerFaq, publier: faqPubliee },
  actualites: { libelle: 'Actualités', valider: valider(validerActualites, true), resumer: resumerActualites },
};
const CLES = Object.keys(CONTENUS);

// Définition d'une clé, ou null (jamais une propriété héritée comme « constructor » ou « __proto__ »)
const contenu = (cle) => (typeof cle === 'string' && Object.hasOwn(CONTENUS, cle) ? CONTENUS[cle] : null);

module.exports = { CONTENUS, CLES, contenu, bandeauVisible, jourCotonou, egal, SLUGS_VITRINE, VARIABLES };
