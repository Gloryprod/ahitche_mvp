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
