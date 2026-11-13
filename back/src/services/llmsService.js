// llms.txt : résumé public du site pour les assistants IA, servi par GET /api/public/llms.txt et sur
// https://ahitchebj.com/llms.txt (réécriture de front/vercel.json). Contrat : docs-internes/admin/CONTRAT-site-public-B.md.
// Même structure que l'ancien front/public/llms.txt, à partir des mêmes données que la vitrine :
//  - prix par mois : prix de vente de la base (formuleService.prixVitrine) ;
//  - cible : textes des cartes publiés depuis l'admin (clé « formules ») ;
//  - WhatsApp, horaires, paiement et jours de livraison : infos pratiques publiées (clé « infos »).
// Fonction pure : le contrôleur lit la base, ici on compose le texte.

// ------------------------------------------------------------------
// Valeurs du code, seule copie côté serveur admise par le contrat (lot B). Elles servent tant que rien n'est publié,
// pour une formule sans prix en base, et quand la base ne répond pas. À garder identiques à :
//  - front/src/config/contact.ts (INFOS_PAR_DEFAUT) pour le numéro, les horaires, les jours de livraison et le paiement ;
//  - front/src/config/formules.ts (FORMULES) pour les cibles et les prix publics des packs (déjà publiés sur l'accueil).
// ------------------------------------------------------------------
const DEFAUTS = {
  infos: {
    whatsappNumero: '22998136635',
    horaires: { jours: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'], ouverture: '09:00', fermeture: '18:00' },
    joursLivraison: '',
    paiement: 'MTN MoMo, Moov Money ou espèces',
  },
  formules: {
    'ahi-essentiel': { cible: '1 personne · par mois', prix: 10800 },
    'ahi-equilibre': { cible: 'Couples et familles actives · par mois', prix: 22500 },
    'ahi-confort': { cible: 'Familles établies · par mois', prix: 50300 },
  },
};

// Restent dans le code, comme sur la vitrine : noms, ordre des cartes, produit exclu de l'Essentiel (EXCLUS_ESSENTIEL)
const FORMULES = [
  { slug: 'ahi-essentiel', nom: 'AHI Essentiel', precision: ' (sans huile de palme)' },
  { slug: 'ahi-equilibre', nom: 'AHI Équilibré', precision: '' },
  { slug: 'ahi-confort', nom: 'AHI Confort', precision: '' },
];

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

// « 10 800 »
const montant = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// « 09:00 » -> « 9h00 »
const heure = (hhmm) => { const [h, m] = hhmm.split(':'); return `${Number(h)}h${m}`; };

// « a », « a et b », « a, b et c »
const enumerer = (liste) => (liste.length <= 1 ? (liste[0] ?? '') : `${liste.slice(0, -1).join(', ')} et ${liste[liste.length - 1]}`);

// Jours en plages consécutives, comme sur le site : lundi à samedi -> « lundi au samedi » ;
// lundi, mercredi, vendredi -> « lundi, mercredi et vendredi » ; samedi et dimanche -> « samedi et dimanche »
function jours(liste) {
  const rangs = [...new Set(liste)].map((j) => JOURS.indexOf(j)).filter((i) => i >= 0).sort((a, b) => a - b);
  const plages = [];
  for (const rang of rangs) {
    const derniere = plages[plages.length - 1];
    if (derniere && rang === derniere[derniere.length - 1] + 1) derniere.push(rang);
    else plages.push([rang]);
  }
  return enumerer(plages.flatMap((p) => (p.length >= 3 ? [`${JOURS[p[0]]} au ${JOURS[p[p.length - 1]]}`] : p.map((r) => JOURS[r]))));
}

// Cible d'une carte dans la phrase de la formule : « Couples et familles actives · par mois » -> « couples et familles
// actives » (« par mois » suit déjà le prix ; majuscule initiale retirée sauf sigle, ex. « AHI »)
function cibleDansPhrase(cible) {
  const sansMois = cible.replace(/\s*·\s*par mois\s*$/i, '').replace(/[\s.,;:·]+$/, '');
  return /^\p{Lu}\p{Ll}/u.test(sansMois) ? sansMois.charAt(0).toLowerCase() + sansMois.slice(1) : sansMois;
}

const sansPointFinal = (t) => t.replace(/[\s.]+$/, '');

/**
 * Texte de llms.txt.
 * @param {{ infos?: object | null, formules?: object | null, prix?: Record<string, number | null> | null }} [publie]
 *   valeurs publiées (déjà validées) ; null ou absent : valeurs du code
 * @returns {string}
 */
function texteLlms({ infos = null, formules = null, prix = null } = {}) {
  const i = infos || DEFAUTS.infos;
  const lignesFormules = FORMULES.map(({ slug, nom, precision }) => {
    const cible = cibleDansPhrase(formules?.[slug]?.cible ?? DEFAUTS.formules[slug].cible);
    const montantMois = prix?.[slug] ?? DEFAUTS.formules[slug].prix;
    return `- ${nom} : ${cible ? `${cible}, ` : ''}${montant(montantMois)} FCFA par mois${precision}.`;
  });
  const horaires = `${jours(i.horaires.jours)}, ${heure(i.horaires.ouverture)} à ${heure(i.horaires.fermeture)}`;
  const livraison = i.joursLivraison ? `Livraison ${sansPointFinal(i.joursLivraison)}` : 'Livraison à jour fixe';

  return [
    '# Ahitché',
    '',
    "> Service d'approvisionnement et de livraison alimentaire à domicile à Cotonou et Abomey-Calavi (Bénin) : des packs de produits de base pour le mois, commandés par WhatsApp et payés à la livraison.",
    '',
    "Informations publiques, reprises de l'accueil du site. Les prix et les conditions de l'accueil font foi.",
    '',
    '## Formules (prix par mois)',
    '',
    ...lignesFormules,
    '- AHI Réserve et AHI Fraîcheur : bientôt disponibles.',
    '',
    'Chaque pack contient 17 produits de base (riz local, haricots, pâtes, gari, huile, tomates, oignons…), en quantités adaptées à la formule.',
    '',
    '## Commander',
    '',
    `- Par WhatsApp : https://wa.me/${i.whatsappNumero} (${horaires}).`,
    `- Paiement à la livraison : ${sansPointFinal(i.paiement)}.`,
    `- ${livraison}, dans 22 zones de Cotonou et d'Abomey-Calavi.`,
    '- Produit manquant ou abîmé : remplacé à l\'identique à la livraison suivante.',
    '',
    '## Pages',
    '',
    '- [Accueil](https://ahitchebj.com/) : formules, fonctionnement, questions fréquentes.',
    '- [Actualités et médias](https://ahitchebj.com/blog)',
    '- [Mentions légales](https://ahitchebj.com/mentions-legales)',
    '',
  ].join('\n');
}

module.exports = { texteLlms };
