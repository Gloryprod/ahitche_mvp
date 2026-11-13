// Écran « Site public » : champs de chaque contenu, tels qu'affichés dans la confirmation, l'historique et les
// erreurs. Les libellés sont ceux des messages d'erreur du serveur (« Numéro WhatsApp : … »), ce qui permet
// d'afficher une erreur à côté du champ concerné.
import { INFOS_PAR_DEFAUT } from '@/config/contact'
import { FORMULES_DU_CODE, SLUGS_VITRINE, TAILLES_FOYER, TEXTES_FORMULES_DU_CODE } from '@/config/formules'
import {
  BANDEAU_VIDE, annonceLivraison, copierInfos, formaterHoraires, formaterNumero, fusionnerInfos, normaliserNumero,
  JOURS_SEMAINE, REGLES_FORMULE, fusionnerTextesFormules, lirePrix,
  type BandeauSite, type InfosSite, type PrixSite, type TextesFormules,
} from '@/services/valeursSite'

export type CleContenu = 'infos' | 'bandeau' | 'formules'

export interface Version { _id: string; publieLe: string; publiePar: { nom: string } }
export interface ContenuEcran<T> { valeurs: T; updatedAt: string; versions: Version[] }
export interface ContenusSite {
  infos: ContenuEcran<InfosSite> | null
  bandeau: ContenuEcran<BandeauSite> | null
  formules: ContenuEcran<TextesFormules> | null
}
// Réponse de GET /api/admin/site : contenus publiés et prix de vente de la base (lecture seule ici, lot B)
export interface ReponseSite { contenus: ContenusSite; prix: PrixSite }

export const lireReponseSite = (d: { contenus?: Partial<ContenusSite>; prix?: unknown } | undefined): ReponseSite => ({
  contenus: { infos: d?.contenus?.infos ?? null, bandeau: d?.contenus?.bandeau ?? null, formules: d?.contenus?.formules ?? null },
  prix: lirePrix(SLUGS_VITRINE, d?.prix),
})

export const TITRES_CONTENUS: Record<CleContenu, string> = { infos: 'Infos pratiques', bandeau: 'Bandeau d\'annonce', formules: 'Formules' }

interface Champ<T> { id: string; libelle: string; lire: (v: T) => string }

const masque = (url: string) => url || 'aucun (lien masqué)'
const dateLisible = (jour: string) => (jour
  ? new Date(`${jour}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  : 'aucune')

export const CHAMPS_INFOS: Champ<InfosSite>[] = [
  { id: 'whatsappNumero', libelle: 'Numéro WhatsApp', lire: v => formaterNumero(v.whatsappNumero) },
  { id: 'messages.commande', libelle: 'Message WhatsApp « Commander une formule »', lire: v => v.messages.commande },
  { id: 'messages.premiereCommande', libelle: 'Message WhatsApp « Première commande »', lire: v => v.messages.premiereCommande },
  { id: 'messages.complements', libelle: 'Message WhatsApp « Produits de la semaine »', lire: v => v.messages.complements },
  { id: 'messages.fondateur', libelle: 'Message WhatsApp « Client fondateur »', lire: v => v.messages.fondateur },
  { id: 'facebook', libelle: 'Facebook', lire: v => masque(v.facebook) },
  { id: 'tiktok', libelle: 'TikTok', lire: v => masque(v.tiktok) },
  { id: 'horaires', libelle: 'Horaires', lire: v => formaterHoraires(v.horaires) },
  { id: 'joursLivraison', libelle: 'Jours de livraison', lire: v => annonceLivraison(v.joursLivraison) },
  { id: 'paiement', libelle: 'Moyens de paiement', lire: v => v.paiement },
]

export const CHAMPS_BANDEAU: Champ<BandeauSite>[] = [
  { id: 'actif', libelle: 'Bandeau affiché', lire: v => (v.actif ? 'oui' : 'non') },
  { id: 'message', libelle: 'Message du bandeau', lire: v => v.message || 'aucun' },
  { id: 'ton', libelle: 'Ton du bandeau', lire: v => (v.ton === 'important' ? 'important (fond or)' : 'info (fond vert forêt)') },
  { id: 'lien', libelle: 'Lien du bandeau', lire: v => v.lien || 'aucun' },
  { id: 'texteLien', libelle: 'Texte du lien', lire: v => v.texteLien || 'aucun' },
  { id: 'debut', libelle: 'Début du bandeau', lire: v => dateLisible(v.debut) },
  { id: 'fin', libelle: 'Fin du bandeau', lire: v => dateLisible(v.fin) },
]

// Formules : « AHI ÉQUILIBRÉ » -> « Équilibré », le nom des messages d'erreur du serveur (« Équilibré : accroche : … »)
export const nomCourt = (nom: string) => {
  const mot = nom.replace(/^AHI\s+/i, '').toLocaleLowerCase('fr-FR')
  return mot.charAt(0).toLocaleUpperCase('fr-FR') + mot.slice(1)
}
export const libelleFoyer = (foyer: string) => TAILLES_FOYER.find(t => t.valeur === foyer)?.libelle ?? foyer
const nomRecommandee = (v: TextesFormules) => FORMULES_DU_CODE.find(f => v[f.slug]?.recommandee)?.nom ?? 'aucune'

export const CHAMPS_FORMULES: Champ<TextesFormules>[] = [
  ...FORMULES_DU_CODE.flatMap(f => {
    const court = nomCourt(f.nom)
    return [
      { id: `${f.slug}.cible`, libelle: `${court} : cible`, lire: (v: TextesFormules) => v[f.slug]!.cible },
      { id: `${f.slug}.accroche`, libelle: `${court} : accroche`, lire: (v: TextesFormules) => v[f.slug]!.accroche },
      { id: `${f.slug}.repas`, libelle: `${court} : repas`, lire: (v: TextesFormules) => `${v[f.slug]!.repas} repas possibles` },
      { id: `${f.slug}.heures`, libelle: `${court} : heures`, lire: (v: TextesFormules) => `${v[f.slug]!.heures} économisées` },
      { id: `${f.slug}.foyer`, libelle: `${court} : taille de foyer`, lire: (v: TextesFormules) => libelleFoyer(v[f.slug]!.foyer) },
    ]
  }),
  { id: 'recommandee', libelle: 'Formule recommandée', lire: nomRecommandee },
]

// Libellés d'erreur du serveur qui ne sont pas des champs de la liste ci-dessus
const AUTRES_ERREURS: Record<string, string> = {
  'Jours d\'ouverture': 'horaires.jours',
  'Heure d\'ouverture': 'horaires.ouverture',
  'Heure de fermeture': 'horaires.fermeture',
}

// Champ nommé au début du message d'erreur (« Facebook : adresse invalide… »), sinon '' (erreur en haut du formulaire)
export function champDeLErreur(cle: CleContenu, message: string): string {
  const champs: { id: string; libelle: string }[] = cle === 'infos' ? CHAMPS_INFOS : cle === 'bandeau' ? CHAMPS_BANDEAU : CHAMPS_FORMULES
  const libelles = [...champs, ...(cle === 'infos' ? Object.entries(AUTRES_ERREURS).map(([libelle, id]) => ({ id, libelle })) : [])]
  // « Essentiel : accroche : … », ou « Essentiel : repas, chiffres… » pour les formats des formules
  const trouve = libelles.find(c => message.startsWith(`${c.libelle} :`) || message.startsWith(`${c.libelle},`))
  // « Horaires : l'heure d'ouverture doit précéder… » : affichée sous l'heure de fermeture
  return trouve?.id === 'horaires' ? 'horaires.fermeture' : (trouve?.id ?? '')
}

export interface Changement { libelle: string; avant: string; apres: string }

export function changements<T>(champs: Champ<T>[], avant: T, apres: T): Changement[] {
  return champs
    .map(c => ({ libelle: c.libelle, avant: c.lire(avant), apres: c.lire(apres) }))
    .filter(c => c.avant !== c.apres)
}

// Valeurs du site pour un contenu jamais publié, ou lecture prudente des valeurs publiées
export const infosPubliees = (contenu: ContenusSite['infos'] | undefined): InfosSite =>
  (contenu ? fusionnerInfos(INFOS_PAR_DEFAUT, contenu.valeurs) : copierInfos(INFOS_PAR_DEFAUT))

export function bandeauPublie(contenu: ContenusSite['bandeau'] | undefined): BandeauSite {
  const v: Partial<BandeauSite> = contenu?.valeurs ?? {}
  const texte = (x: unknown) => (typeof x === 'string' ? x : '')
  return {
    actif: v.actif === true,
    message: texte(v.message),
    ton: v.ton === 'important' ? 'important' : BANDEAU_VIDE.ton,
    lien: texte(v.lien),
    texteLien: texte(v.texteLien),
    debut: texte(v.debut),
    fin: texte(v.fin),
  }
}

export const formulesPubliees = (contenu: ContenusSite['formules'] | undefined): TextesFormules =>
  fusionnerTextesFormules(TEXTES_FORMULES_DU_CODE, contenu?.valeurs)

// Retours à la ligne remplacés par une espace (le serveur les refuse) et espaces en trop retirées
const nettoyer = (texte: string) => texte.replace(/\s*[\r\n]+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()

// Valeurs envoyées au serveur, nettoyées comme il le ferait (même comparaison pour « ce qui change »)
export function infosAEnvoyer(f: InfosSite): InfosSite {
  return {
    whatsappNumero: normaliserNumero(f.whatsappNumero),
    messages: {
      commande: nettoyer(f.messages.commande),
      premiereCommande: nettoyer(f.messages.premiereCommande),
      complements: nettoyer(f.messages.complements),
      fondateur: nettoyer(f.messages.fondateur),
    },
    facebook: nettoyer(f.facebook),
    tiktok: nettoyer(f.tiktok),
    horaires: { jours: JOURS_SEMAINE.filter(j => f.horaires.jours.includes(j)), ouverture: f.horaires.ouverture, fermeture: f.horaires.fermeture },
    joursLivraison: nettoyer(f.joursLivraison),
    paiement: nettoyer(f.paiement),
  }
}

export function bandeauAEnvoyer(f: BandeauSite): BandeauSite {
  return { ...f, message: nettoyer(f.message), lien: nettoyer(f.lien), texteLien: nettoyer(f.texteLien) }
}

// Les trois slugs de la vitrine, dans l'ordre des cartes, textes nettoyés
export function formulesAEnvoyer(f: TextesFormules): TextesFormules {
  return Object.fromEntries(SLUGS_VITRINE.map(slug => {
    const t = f[slug] ?? TEXTES_FORMULES_DU_CODE[slug]!
    return [slug, {
      cible: nettoyer(t.cible), accroche: nettoyer(t.accroche), repas: nettoyer(t.repas), heures: nettoyer(t.heures),
      foyer: t.foyer, recommandee: t.recommandee === true,
    }]
  }))
}

// Contrôle simple avant l'envoi, avec les messages du serveur (« Essentiel : accroche : 120 caractères au plus. »)
const FORMATS: Record<'repas' | 'heures', string> = {
  repas: 'repas, chiffres et tiret seulement (ex. 20–30).',
  heures: 'heures, chiffres, tiret et « h » seulement (ex. 2–4h).',
}

// Taille de foyer déjà choisie par une formule précédente (le serveur veut une formule différente par taille) :
// slug -> nom de la formule qui l'a déjà
export function doublonsFoyer(f: TextesFormules): Record<string, string> {
  const vus = new Map<string, string>()
  const doublons: Record<string, string> = {}
  for (const formule of FORMULES_DU_CODE) {
    const foyer = f[formule.slug]?.foyer
    if (!foyer) continue
    const deja = vus.get(foyer)
    if (deja) doublons[formule.slug] = deja
    else vus.set(foyer, formule.nom)
  }
  return doublons
}
export const messageDoublonFoyer = (deja: string) => `Taille de foyer : déjà choisie pour ${deja}. Une formule différente pour chaque taille (1, 2-3, 4-6).`

export function controlerFormules(f: TextesFormules): { champ: string; message: string } | null {
  for (const formule of FORMULES_DU_CODE) {
    const t = f[formule.slug]
    if (!t) continue
    for (const nom of ['cible', 'accroche', 'repas', 'heures'] as const) {
      const valeur = t[nom]
      const champ = `${formule.slug}.${nom}`
      const erreur = (texte: string) => ({ champ, message: `${nomCourt(formule.nom)} : ${nom} : ${texte}` })
      if (/[<>]/.test(valeur)) return erreur('les caractères < et > ne sont pas acceptés.')
      if (!valeur) return erreur('obligatoire.')
      if (Array.from(valeur).length > REGLES_FORMULE[nom].max) return erreur(`${REGLES_FORMULE[nom].max} caractères au plus.`)
      if ((nom === 'repas' || nom === 'heures') && !REGLES_FORMULE[nom].motif.test(valeur)) {
        return { champ, message: `${nomCourt(formule.nom)} : ${FORMATS[nom]}` }
      }
    }
  }
  const doublon = Object.entries(doublonsFoyer(f))[0]
  if (doublon) return { champ: `${doublon[0]}.foyer`, message: messageDoublonFoyer(doublon[1]) }
  if (SLUGS_VITRINE.filter(s => f[s]?.recommandee).length > 1) return { champ: 'recommandee', message: 'Formule recommandée : une seule au plus.' }
  return null
}

// Période d'affichage, en clair
export function periodeBandeau(b: BandeauSite): string {
  if (!b.actif) return 'Bandeau masqué : rien ne s\'affiche sur le site.'
  if (b.debut && b.fin) return `Affiché du ${dateLisible(b.debut)} au ${dateLisible(b.fin)} inclus (heure de Cotonou).`
  if (b.debut) return `Affiché à partir du ${dateLisible(b.debut)} (heure de Cotonou), sans date de fin.`
  if (b.fin) return `Affiché dès la publication, jusqu'au ${dateLisible(b.fin)} inclus (heure de Cotonou).`
  return 'Affiché dès la publication, sans date de fin.'
}
