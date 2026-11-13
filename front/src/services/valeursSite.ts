// Valeurs du site modifiables depuis l'admin (écran « Site public », lot A) : types, formatage et lecture prudente
// des valeurs publiées. Fonctions pures, sans état : utilisées par config/contact.ts, le bandeau et l'écran admin.
// Le format est celui du contrat docs-internes/admin/CONTRAT-site-public-A.md ; le serveur valide, ici on affiche.

export const JOURS_SEMAINE = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const
export type JourSemaine = (typeof JOURS_SEMAINE)[number]

// Noms attendus par Google (schema.org, données structurées de l'accueil)
const JOURS_GOOGLE: Record<JourSemaine, string> = {
  lundi: 'Monday', mardi: 'Tuesday', mercredi: 'Wednesday', jeudi: 'Thursday',
  vendredi: 'Friday', samedi: 'Saturday', dimanche: 'Sunday',
}

export interface MessagesWhatsApp {
  commande: string
  premiereCommande: string
  complements: string
  fondateur: string
}

export interface Horaires {
  jours: JourSemaine[]
  ouverture: string // HH:MM
  fermeture: string // HH:MM
}

export interface InfosSite {
  whatsappNumero: string // 229 suivi de 8 ou 10 chiffres, sans « + »
  messages: MessagesWhatsApp
  facebook: string // vide : lien masqué
  tiktok: string // vide : lien masqué
  horaires: Horaires
  joursLivraison: string // vide : « Livraison à jour fixe »
  paiement: string
}

export type TonBandeau = 'info' | 'important'

export interface BandeauSite {
  actif: boolean
  message: string
  ton: TonBandeau
  lien: string // vide, chemin interne (/…) ou https://wa.me/…
  texteLien: string
  debut: string // AAAA-MM-JJ ou vide
  fin: string // AAAA-MM-JJ ou vide
}

export const BANDEAU_VIDE: BandeauSite = { actif: false, message: '', ton: 'info', lien: '', texteLien: '', debut: '', fin: '' }

// Copie indépendante (les formulaires de l'admin modifient leur copie sans toucher aux valeurs par défaut)
export const copierInfos = (infos: InfosSite): InfosSite => ({
  ...infos,
  messages: { ...infos.messages },
  horaires: { ...infos.horaires, jours: [...infos.horaires.jours] },
})

// « +229 98 13 66 35 » (8 chiffres) ou « +229 01 23 45 67 89 » (10 chiffres) : chiffres groupés par deux
export function formaterNumero(numero: string): string {
  const chiffres = numero.replace(/\D/g, '')
  if (!chiffres.startsWith('229') || chiffres.length <= 3) return chiffres ? `+${chiffres}` : ''
  const local = chiffres.slice(3).match(/.{1,2}/g) ?? []
  return ['+229', ...local].join(' ')
}

// Espaces et « + » saisis retirés, comme le fait le serveur
export const normaliserNumero = (saisie: string) => saisie.replace(/[\s+.-]/g, '')

// « 09:00 » -> « 9h00 »
export function formaterHeure(heure: string): string {
  const [h = '', m = '00'] = heure.split(':')
  return `${Number(h)}h${m.padStart(2, '0')}`
}

const majuscule = (texte: string) => texte.charAt(0).toUpperCase() + texte.slice(1)

// Jours rangés dans l'ordre de la semaine, en plages de jours consécutifs :
// lundi à samedi -> « Lundi – Samedi » ; lundi, mercredi, vendredi -> « Lundi, Mercredi et Vendredi » ;
// lundi à mercredi et samedi -> « Lundi – Mercredi et Samedi » ; deux jours qui se suivent -> « Samedi et Dimanche »
export function formaterJours(jours: readonly string[]): string {
  const rangs = [...new Set(jours)]
    .map(j => JOURS_SEMAINE.indexOf(j as JourSemaine))
    .filter(i => i >= 0)
    .sort((a, b) => a - b)
  const plages: number[][] = []
  for (const rang of rangs) {
    const derniere = plages[plages.length - 1]
    if (derniere && rang === derniere[derniere.length - 1]! + 1) derniere.push(rang)
    else plages.push([rang])
  }
  const nom = (rang: number) => majuscule(JOURS_SEMAINE[rang]!)
  const morceaux = plages.flatMap(p => (p.length >= 3 ? [`${nom(p[0]!)} – ${nom(p[p.length - 1]!)}`] : p.map(nom)))
  if (morceaux.length <= 1) return morceaux[0] ?? ''
  return `${morceaux.slice(0, -1).join(', ')} et ${morceaux[morceaux.length - 1]}`
}

// « Lundi – Samedi, 9h00 – 18h00 »
export function formaterHoraires(horaires: Horaires): string {
  const jours = formaterJours(horaires.jours)
  const heures = `${formaterHeure(horaires.ouverture)} – ${formaterHeure(horaires.fermeture)}`
  return jours ? `${jours}, ${heures}` : heures
}

export function horairesGoogle(horaires: Horaires) {
  return {
    jours: JOURS_SEMAINE.filter(j => horaires.jours.includes(j)).map(j => JOURS_GOOGLE[j]),
    ouverture: horaires.ouverture,
    fermeture: horaires.fermeture,
  }
}

export const annonceLivraison = (joursLivraison: string) => (joursLivraison ? `Livraison ${joursLivraison}` : 'Livraison à jour fixe')

// --- Lecture prudente de la réponse du serveur : un champ absent ou mal formé garde la valeur par défaut ---
const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const texte = (v: unknown, defaut: string) => (typeof v === 'string' ? v : defaut)
const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/

export function fusionnerInfos(defaut: InfosSite, recu: unknown): InfosSite {
  if (!estObjet(recu)) return copierInfos(defaut)
  const messages = estObjet(recu.messages) ? recu.messages : {}
  const horaires = estObjet(recu.horaires) ? recu.horaires : {}
  const jours = Array.isArray(horaires.jours)
    ? JOURS_SEMAINE.filter(j => (horaires.jours as unknown[]).includes(j))
    : []
  const numero = texte(recu.whatsappNumero, '').replace(/\D/g, '')
  const lien = (v: unknown, d: string) => (typeof v === 'string' && (v === '' || v.startsWith('https://')) ? v : d)
  const message = (v: unknown, d: string) => (typeof v === 'string' && v.trim() ? v : d)
  return {
    whatsappNumero: /^229(\d{8}|\d{10})$/.test(numero) ? numero : defaut.whatsappNumero,
    messages: {
      commande: message(messages.commande, defaut.messages.commande),
      premiereCommande: message(messages.premiereCommande, defaut.messages.premiereCommande),
      complements: message(messages.complements, defaut.messages.complements),
      fondateur: message(messages.fondateur, defaut.messages.fondateur),
    },
    facebook: lien(recu.facebook, defaut.facebook),
    tiktok: lien(recu.tiktok, defaut.tiktok),
    horaires: {
      jours: jours.length ? jours : [...defaut.horaires.jours],
      ouverture: HEURE.test(texte(horaires.ouverture, '')) ? (horaires.ouverture as string) : defaut.horaires.ouverture,
      fermeture: HEURE.test(texte(horaires.fermeture, '')) ? (horaires.fermeture as string) : defaut.horaires.fermeture,
    },
    joursLivraison: texte(recu.joursLivraison, defaut.joursLivraison),
    paiement: message(recu.paiement, defaut.paiement),
  }
}

// --- Formules de la vitrine (lot B, docs-internes/admin/CONTRAT-site-public-B.md) ---
// Textes publiés de chaque carte ; nom, emoji, teinte, niveau, ordre et produits restent dans le code.
export const TAILLES_FOYER_VALIDES = ['1', '2-3', '4-6'] as const
export type Foyer = (typeof TAILLES_FOYER_VALIDES)[number]

export interface TexteFormule {
  cible: string
  accroche: string
  repas: string // « 20–30 »
  heures: string // « 2–4h »
  foyer: Foyer
  recommandee: boolean
}
export type TextesFormules = Record<string, TexteFormule> // Par slug de la vitrine
export type PrixSite = Record<string, number | null> // Prix de vente de la base par slug ; null : celui du code

// Règles du contrat, reprises pour lire prudemment ce que renvoie le serveur
export const REGLES_FORMULE = {
  cible: { max: 60 },
  accroche: { max: 120 },
  repas: { max: 15, motif: /^(?=.*\d)[\d \-–]+$/ }, // Au moins un chiffre, comme le serveur
  heures: { max: 15, motif: /^(?=.*\d)[\d \-–h]+$/ },
} as const
const longueur = (v: string) => Array.from(v).length

// Texte d'une carte accepté : chaîne non vide, assez courte, au bon format, sans < > ni retour à la ligne
export function texteFormuleValide(champ: keyof typeof REGLES_FORMULE, valeur: unknown): valeur is string {
  if (typeof valeur !== 'string' || /[<>\r\n]/.test(valeur)) return false
  const propre = valeur.trim()
  const regle: { max: number; motif?: RegExp } = REGLES_FORMULE[champ]
  return propre.length > 0 && longueur(propre) <= regle.max && (!regle.motif || regle.motif.test(propre))
}

// Textes publiés, champ par champ : un slug absent ou un champ mal formé garde la valeur du code. La formule
// recommandée n'est reprise que si chaque formule a un booléen et qu'il y en a au plus une ; sinon, celle du code.
// De même, une taille de foyer par formule : deux formules sur la même taille et les foyers du code reviennent.
export function fusionnerTextesFormules(defaut: TextesFormules, recu: unknown): TextesFormules {
  const publie = estObjet(recu) ? recu : {}
  const resultat: TextesFormules = {}
  for (const [slug, d] of Object.entries(defaut)) {
    const v = estObjet(publie[slug]) ? publie[slug] as Record<string, unknown> : {}
    const champ = (nom: keyof typeof REGLES_FORMULE) => (texteFormuleValide(nom, v[nom]) ? (v[nom] as string).trim() : d[nom])
    resultat[slug] = {
      cible: champ('cible'),
      accroche: champ('accroche'),
      repas: champ('repas'),
      heures: champ('heures'),
      foyer: TAILLES_FOYER_VALIDES.includes(v.foyer as Foyer) ? v.foyer as Foyer : d.foyer,
      recommandee: d.recommandee,
    }
  }
  const choix = Object.keys(defaut).map(slug => (estObjet(publie[slug]) ? (publie[slug] as Record<string, unknown>).recommandee : undefined))
  if (choix.every(c => typeof c === 'boolean') && choix.filter(Boolean).length <= 1) {
    Object.keys(defaut).forEach((slug, i) => { resultat[slug]!.recommandee = choix[i] === true })
  }
  const foyers = Object.values(resultat).map(t => t.foyer)
  if (new Set(foyers).size !== foyers.length) {
    for (const [slug, d] of Object.entries(defaut)) resultat[slug]!.foyer = d.foyer
  }
  return resultat
}

// Prix de vente accepté : nombre entier de FCFA, strictement positif
const prixValide = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 100_000_000

// Prix de la base par slug ; null (formule inactive, bientôt disponible, sans prix ou valeur mal formée) : celui du code
export function lirePrix(slugs: readonly string[], recu: unknown): PrixSite {
  const publie = estObjet(recu) ? recu : {}
  return Object.fromEntries(slugs.map(slug => [slug, prixValide(publie[slug]) ? publie[slug] as number : null]))
}

// Lien du bandeau accepté : chemin interne (pas « // ») ou adresse wa.me
export const lienBandeauValide = (lien: string) => (lien.startsWith('/') && !lien.startsWith('//')) || lien.startsWith('https://wa.me/')

// Bandeau à afficher, ou null (inactif, message vide ou réponse mal formée)
export function lireBandeau(recu: unknown): BandeauSite | null {
  if (!estObjet(recu) || recu.actif !== true) return null
  const message = texte(recu.message, '').trim()
  if (!message) return null
  const lien = texte(recu.lien, '')
  const texteLien = texte(recu.texteLien, '').trim()
  const lienAffiche = lien && texteLien && lienBandeauValide(lien)
  return {
    actif: true,
    message,
    ton: recu.ton === 'important' ? 'important' : 'info',
    lien: lienAffiche ? lien : '',
    texteLien: lienAffiche ? texteLien : '',
    debut: texte(recu.debut, ''),
    fin: texte(recu.fin, ''),
  }
}

// --- Questions fréquentes et actualités (lot C, docs-internes/admin/CONTRAT-site-public-C.md) ---

// Variables des réponses de la FAQ et des résumés des actualités, remplacées à l'affichage par les valeurs du site
export const VARIABLES_TEXTE = [
  { nom: 'paiement', description: 'moyens de paiement' },
  { nom: 'livraison', description: 'annonce de livraison, en minuscule au milieu d\'une phrase' },
  { nom: 'jours_livraison', description: 'jours de livraison publiés ; vide sinon, et la virgule qui le précède disparaît avec lui' },
  { nom: 'horaires', description: 'horaires de réponse' },
  { nom: 'whatsapp', description: 'numéro WhatsApp affiché' },
  { nom: 'nb_produits', description: 'nombre de produits de base' },
] as const
export type NomVariable = (typeof VARIABLES_TEXTE)[number]['nom']
export type ValeursVariables = Record<NomVariable, string>
const NOMS_VARIABLES: readonly string[] = VARIABLES_TEXTE.map(v => v.nom)

// Valeurs des variables d'après les infos pratiques (celles du site, ou celles publiées pour l'aperçu de l'admin)
export const valeursVariables = (infos: InfosSite, nbProduits: number): ValeursVariables => ({
  paiement: infos.paiement,
  livraison: annonceLivraison(infos.joursLivraison),
  jours_livraison: infos.joursLivraison,
  horaires: formaterHoraires(infos.horaires),
  whatsapp: formaterNumero(infos.whatsappNumero),
  nb_produits: String(nbProduits),
})

// Texte affiché : chaque {variable} remplacée par sa valeur.
// - Une variable vide disparaît avec la virgule et les espaces qui la précèdent (« à jour fixe, {jours_livraison} : »
//   devient « à jour fixe : »).
// - {livraison} garde sa majuscule en début de texte ou de phrase, et passe en minuscule ailleurs
//   (« 17 produits de base, livraison à jour fixe et… »).
// - Une accolade qui n'est pas une variable connue reste telle quelle (le serveur la refuse à la publication).
export function remplacerVariables(texte: string, valeurs: ValeursVariables): string {
  const remplace = texte.replace(/(,?[ \t]*)\{([a-z_]+)\}/g, (tout: string, avant: string, nom: string, position: number) => {
    if (!NOMS_VARIABLES.includes(nom)) return tout
    const valeur = valeurs[nom as NomVariable].trim()
    if (!valeur) return ''
    if (nom !== 'livraison') return avant + valeur
    const precedent = texte.slice(0, position).replace(/[ \t]+$/, '')
    const debutDePhrase = !avant.includes(',') && (precedent === '' || /[.!?…]$/.test(precedent))
    return avant + (debutDePhrase ? majuscule(valeur) : valeur.charAt(0).toLocaleLowerCase('fr-FR') + valeur.slice(1))
  })
  return remplace.replace(/[ \t]{2,}/g, ' ').trim()
}

// Première accolade qui n'est pas une variable connue (« {prix} », ou « { » seule), sinon null
export function accoladeInconnue(texte: string): string | null {
  const reste = texte.replace(/\{([a-z_]+)\}/g, (tout: string, nom: string) => (NOMS_VARIABLES.includes(nom) ? '' : tout))
  return reste.match(/\{[^{}]*\}|[{}]/)?.[0] ?? null
}

export const ICONES_ACTUALITE = ['lancement', 'partenaire', 'communaute'] as const
export type IconeActualite = (typeof ICONES_ACTUALITE)[number]

export interface LienContenu { texte: string; vers: string }

export interface QuestionFaq {
  id: string // a-z, 0-9 et -, stable d'une publication à l'autre
  question: string
  reponse: string // Peut contenir des {variables}
  visible: boolean // Masquée : gardée dans la liste, ni affichée ni donnée à Google
  lien: LienContenu | null // Chemin interne (/…) ou ancre (#…)
}

export interface CarteActualite {
  id: string
  categorie: string
  icone: IconeActualite
  titre: string
  resume: string // Peut contenir des {variables}
  lien: LienContenu | null // Chemin interne, ancre ou adresse https:// Facebook, TikTok ou wa.me (nouvel onglet)
}

// Règles du contrat (longueurs en caractères), reprises pour lire prudemment et contrôler avant l'envoi
export const REGLES_FAQ = {
  max: 15,
  question: { min: 5, max: 140 },
  reponse: { min: 10, max: 700 },
  texteLien: { min: 1, max: 50 },
} as const
export const REGLES_ACTUALITE = {
  max: 3,
  categorie: { min: 2, max: 30 },
  titre: { min: 5, max: 90 },
  resume: { min: 10, max: 300 },
  texteLien: { min: 1, max: 40 },
} as const
export const ID_CONTENU = /^[a-z0-9-]{1,40}$/

// Lien de la FAQ : chemin interne (pas « // » ni « /\ », sans espace ni guillemet) ou ancre (« #formules »)
const CHEMIN_INTERNE = /^\/(?![/\\])[^\s\\"'`<>]*$/
const ANCRE = /^#[A-Za-z0-9-]+$/
export const lienFaqValide = (vers: string) => CHEMIN_INTERNE.test(vers) || ANCRE.test(vers)

// Lien d'une actualité : celui de la FAQ, ou https:// vers une page Facebook, TikTok (/@…) ou wa.me (nom exact, sans
// identifiant ni port) : mêmes règles que le serveur (back/src/services/contenuSiteService.js)
const DOMAINES_FACEBOOK = ['facebook.com', 'www.facebook.com', 'm.facebook.com']
const DOMAINES_TIKTOK = ['tiktok.com', 'www.tiktok.com']
function cheminExterneValide(chemin: string, domaine: string): boolean {
  if (DOMAINES_FACEBOOK.includes(domaine)) return chemin.length > 1
  if (DOMAINES_TIKTOK.includes(domaine)) return /^\/@[^/]+/.test(chemin)
  return domaine === 'wa.me' && /^\/[\w/-]*$/.test(chemin)
}
export const lienExterne = (vers: string) => vers.startsWith('https://')
export function lienActualiteValide(vers: string): boolean {
  if (vers.startsWith('/') || vers.startsWith('#')) return lienFaqValide(vers)
  if (!/^https:\/\/[^/]/i.test(vers) || /[\\"'`<>]/.test(vers)) return false
  try {
    const url = new URL(vers)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && cheminExterneValide(url.pathname, url.hostname)
  } catch {
    return false
  }
}

// Texte publié accepté : chaîne de la bonne longueur, sans < > ni retour à la ligne
function texteValide(v: unknown, regle: { min: number; max: number }): v is string {
  if (typeof v !== 'string' || /[<>\r\n]/.test(v)) return false
  const n = longueur(v.trim())
  return n >= regle.min && n <= regle.max
}
function lireLien(v: unknown, max: number, valide: (vers: string) => boolean): LienContenu | null {
  if (!estObjet(v) || !texteValide(v.texte, { min: 1, max }) || typeof v.vers !== 'string' || !valide(v.vers)) return null
  return { texte: v.texte.trim(), vers: v.vers }
}
const lireId = (v: unknown) => (typeof v === 'string' && ID_CONTENU.test(v) ? v : null)
const copierLien = (lien: LienContenu | null) => (lien ? { ...lien } : null)

// Questions publiées : une question mal formée est ignorée ; sans question visible lisible, celles du code restent.
// Le site public ne reçoit que les questions visibles, sans « visible » : un champ absent vaut « affichée ».
export function fusionnerFaq(defaut: readonly QuestionFaq[], recu: unknown): QuestionFaq[] {
  if (!Array.isArray(recu)) return defaut.map(q => ({ ...q, lien: copierLien(q.lien) }))
  const ids = new Set<string>()
  const liste: QuestionFaq[] = []
  for (const q of recu.slice(0, REGLES_FAQ.max)) {
    if (!estObjet(q)) continue
    const id = lireId(q.id)
    if (!id || ids.has(id) || !texteValide(q.question, REGLES_FAQ.question) || !texteValide(q.reponse, REGLES_FAQ.reponse)) continue
    ids.add(id)
    liste.push({
      id,
      question: q.question.trim(),
      reponse: q.reponse.trim(),
      visible: q.visible !== false,
      lien: lireLien(q.lien, REGLES_FAQ.texteLien.max, lienFaqValide),
    })
  }
  return liste.some(q => q.visible) ? liste : defaut.map(q => ({ ...q, lien: copierLien(q.lien) }))
}

// Cartes publiées : null ou absent, celles du code ; une liste vide masque la section ; une carte mal formée est ignorée
export function fusionnerActualites(defaut: readonly CarteActualite[], recu: unknown): CarteActualite[] {
  if (!Array.isArray(recu)) return defaut.map(c => ({ ...c, lien: copierLien(c.lien) }))
  const ids = new Set<string>()
  const liste: CarteActualite[] = []
  for (const c of recu.slice(0, REGLES_ACTUALITE.max)) {
    if (!estObjet(c)) continue
    const id = lireId(c.id)
    if (!id || ids.has(id) || !ICONES_ACTUALITE.includes(c.icone as IconeActualite)) continue
    if (!texteValide(c.categorie, REGLES_ACTUALITE.categorie) || !texteValide(c.titre, REGLES_ACTUALITE.titre)
      || !texteValide(c.resume, REGLES_ACTUALITE.resume)) continue
    ids.add(id)
    liste.push({
      id,
      categorie: c.categorie.trim(),
      icone: c.icone as IconeActualite,
      titre: c.titre.trim(),
      resume: c.resume.trim(),
      lien: lireLien(c.lien, REGLES_ACTUALITE.texteLien.max, lienActualiteValide),
    })
  }
  return liste
}

// Identifiant d'un nouvel élément : préfixe et horodatage en base 36 (jamais réutilisé après une suppression),
// suffixé « -2 », « -3 »… s'il est déjà pris
export function nouvelId(prefixe: string, existants: readonly string[], graine = Date.now()): string {
  const base = `${prefixe}-${Math.abs(Math.trunc(graine)).toString(36)}`.slice(0, 36)
  let id = base
  for (let n = 2; existants.includes(id); n++) id = `${base}-${n}`
  return id
}
