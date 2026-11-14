// Écran « Site public » : champs de chaque contenu, tels qu'affichés dans la confirmation, l'historique et les
// erreurs. Les libellés sont ceux des messages d'erreur du serveur (« Numéro WhatsApp : … »), ce qui permet
// d'afficher une erreur à côté du champ concerné.
import { INFOS_PAR_DEFAUT, reseauxDe } from '@/config/contact'
import { FORMULES_DU_CODE, SLUGS_VITRINE, TAILLES_FOYER, TEXTES_FORMULES_DU_CODE } from '@/config/formules'
import { FAQ_PAR_DEFAUT } from '@/config/faq'
import { cartesDuCode } from '@/config/actualites'
import {
  BANDEAU_VIDE, annonceLivraison, copierInfos, formaterHoraires, formaterNumero, fusionnerInfos, normaliserNumero,
  JOURS_SEMAINE, REGLES_FORMULE, fusionnerTextesFormules, lirePrix,
  ICONES_ACTUALITE, ID_CONTENU, VARIABLES_TEXTE, REGLES_ACTUALITE, REGLES_FAQ, accoladeInconnue, fusionnerActualites, fusionnerFaq, lienActualiteValide,
  lienFaqValide,
  type BandeauSite, type CarteActualite, type IconeActualite, type InfosSite, type LienContenu, type PrixSite,
  type QuestionFaq, type TextesFormules,
} from '@/services/valeursSite'

export type CleContenu = 'infos' | 'bandeau' | 'formules' | 'faq' | 'actualites'

export interface Version { _id: string; publieLe: string; publiePar: { nom: string } }
export interface ContenuEcran<T> { valeurs: T; updatedAt: string; versions: Version[] }
export interface ContenusSite {
  infos: ContenuEcran<InfosSite> | null
  bandeau: ContenuEcran<BandeauSite> | null
  formules: ContenuEcran<TextesFormules> | null
  faq: ContenuEcran<QuestionFaq[]> | null
  actualites: ContenuEcran<CarteActualite[]> | null
}
// Réponse de GET /api/admin/site : contenus publiés et prix de vente de la base (lecture seule ici, lot B)
export interface ReponseSite { contenus: ContenusSite; prix: PrixSite }

export const lireReponseSite = (d: { contenus?: Partial<ContenusSite>; prix?: unknown } | undefined): ReponseSite => ({
  contenus: {
    infos: d?.contenus?.infos ?? null, bandeau: d?.contenus?.bandeau ?? null, formules: d?.contenus?.formules ?? null,
    faq: d?.contenus?.faq ?? null, actualites: d?.contenus?.actualites ?? null,
  },
  prix: lirePrix(SLUGS_VITRINE, d?.prix),
})

export const TITRES_CONTENUS: Record<CleContenu, string> = {
  infos: 'Infos pratiques', bandeau: 'Bandeau d\'annonce', formules: 'Formules', faq: 'Questions fréquentes', actualites: 'Actualités',
}

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

// Champ nommé au début du message d'erreur (« Facebook : adresse invalide… »), sinon '' (erreur en haut du formulaire).
// FAQ et actualités : « Question 3 : réponse : … » ou « Carte 2 : titre : … », d'après les identifiants du formulaire.
export function champDeLErreur(cle: CleContenu, message: string, ids: readonly string[] = []): string {
  if (cle === 'faq' || cle === 'actualites') return champErreurListe(cle, message, ids)
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

// Classes et identifiants communs aux champs des listes (questions, cartes)
export const CLASSES_FORMULAIRE = {
  champ: 'mt-1 w-full min-h-11 px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm text-noir font-normal disabled:opacity-80 aria-invalid:border-red-400',
  etiquette: 'block text-xs font-bold text-noir',
  erreur: 'mt-1 text-xs font-semibold text-red-700',
}
export const idChamp = (id: string) => `champ-site-${id.replace(/\./g, '-')}`

// Date et heure de Cotonou, dans l'historique
export const dateHeure = (d: string) => new Date(d).toLocaleString('fr-FR', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Porto-Novo',
})

// Fenêtres de confirmation de l'écran
export const STYLE_SWAL = { confirmButtonColor: 'var(--color-foret)', cancelButtonColor: 'var(--color-gris)', customClass: { popup: 'rounded-2xl font-body' } }

// Période d'affichage, en clair
export function periodeBandeau(b: BandeauSite): string {
  if (!b.actif) return 'Bandeau masqué : rien ne s\'affiche sur le site.'
  if (b.debut && b.fin) return `Affiché du ${dateLisible(b.debut)} au ${dateLisible(b.fin)} inclus (heure de Cotonou).`
  if (b.debut) return `Affiché à partir du ${dateLisible(b.debut)} (heure de Cotonou), sans date de fin.`
  if (b.fin) return `Affiché dès la publication, jusqu'au ${dateLisible(b.fin)} inclus (heure de Cotonou).`
  return 'Affiché dès la publication, sans date de fin.'
}

// ------------------------------------------------------------------
// Questions fréquentes et actualités (lot C, docs-internes/admin/CONTRAT-site-public-C.md)
// ------------------------------------------------------------------

// Formulaires : le lien est toujours un objet (deux champs vides : pas de lien)
export interface QuestionFormulaire extends Omit<QuestionFaq, 'lien'> { lien: LienContenu }
export interface CarteFormulaire extends Omit<CarteActualite, 'lien'> { lien: LienContenu }

export const NOMS_ICONES: Record<IconeActualite, string> = {
  lancement: 'Livraison (scooter)',
  partenaire: 'Partenaire (bâtiment)',
  communaute: 'Communauté (groupe)',
}

// Valeurs du site : publiées, sinon celles du code (la carte « Suivez-nous » d'après les réseaux des infos données)
export const faqPubliee = (contenu: ContenusSite['faq'] | undefined): QuestionFaq[] => fusionnerFaq(FAQ_PAR_DEFAUT, contenu?.valeurs)
export const actualitesPubliees = (contenu: ContenusSite['actualites'] | undefined, infos: InfosSite): CarteActualite[] =>
  (contenu ? fusionnerActualites([], contenu.valeurs) : cartesDuCode(reseauxDe(infos)))

const versFormulaire = <T extends { lien: LienContenu | null }>(e: T) => ({ ...e, lien: e.lien ? { ...e.lien } : { texte: '', vers: '' } })
export const faqEnFormulaire = (liste: QuestionFaq[]): QuestionFormulaire[] => liste.map(versFormulaire)
export const actualitesEnFormulaire = (liste: CarteActualite[]): CarteFormulaire[] => liste.map(versFormulaire)

// Lien envoyé : null si ses deux champs sont vides
function lienAEnvoyer(lien: LienContenu): LienContenu | null {
  const texte = nettoyer(lien.texte)
  const vers = lien.vers.trim()
  return texte || vers ? { texte, vers } : null
}
export const faqAEnvoyer = (liste: QuestionFormulaire[]): QuestionFaq[] => liste.map(q => ({
  id: q.id, question: nettoyer(q.question), reponse: nettoyer(q.reponse), visible: q.visible === true, lien: lienAEnvoyer(q.lien),
}))
export const actualitesAEnvoyer = (liste: CarteFormulaire[]): CarteActualite[] => liste.map(c => ({
  id: c.id, categorie: nettoyer(c.categorie), icone: c.icone, titre: nettoyer(c.titre), resume: nettoyer(c.resume), lien: lienAEnvoyer(c.lien),
}))

// Champs d'un élément, tels que nommés dans la confirmation et les messages du serveur
interface ChampElement<T> { libelle: string; lire: (e: T) => string }
const lireLien = (lien: LienContenu | null) => (lien ? `${lien.texte} (${lien.vers})` : 'aucun')
const CHAMPS_QUESTION: ChampElement<QuestionFaq>[] = [
  { libelle: 'question', lire: q => q.question },
  { libelle: 'réponse', lire: q => q.reponse },
  { libelle: 'affichée sur le site', lire: q => (q.visible ? 'oui' : 'non (masquée)') },
  { libelle: 'lien', lire: q => lireLien(q.lien) },
]
const CHAMPS_CARTE: ChampElement<CarteActualite>[] = [
  { libelle: 'catégorie', lire: c => c.categorie },
  { libelle: 'icône', lire: c => NOMS_ICONES[c.icone] },
  { libelle: 'titre', lire: c => c.titre },
  { libelle: 'résumé', lire: c => c.resume },
  { libelle: 'lien', lire: c => lireLien(c.lien) },
]

// Ce qui change entre deux listes, élément par élément (même identifiant) : ajouts, champs modifiés, suppressions, ordre
function changementsListe<T extends { id: string }>(
  avant: T[], apres: T[], element: string, titre: (e: T) => string, champs: ChampElement<T>[],
): Changement[] {
  const liste: Changement[] = []
  const anciens = new Map(avant.map(e => [e.id, e]))
  apres.forEach((e, i) => {
    const ancien = anciens.get(e.id)
    if (!ancien) {
      liste.push({ libelle: `${element} ${i + 1} ajoutée`, avant: '—', apres: titre(e) })
      return
    }
    for (const c of champs) {
      const a = c.lire(ancien)
      const b = c.lire(e)
      if (a !== b) liste.push({ libelle: `${element} ${i + 1} : ${c.libelle}`, avant: a, apres: b })
    }
  })
  const ids = new Set(apres.map(e => e.id))
  for (const e of avant) if (!ids.has(e.id)) liste.push({ libelle: `${element} supprimée`, avant: titre(e), apres: '—' })
  const communs = (l: T[]) => l.filter(e => anciens.has(e.id) && ids.has(e.id)).map(e => e.id).join('|')
  if (communs(avant) !== communs(apres)) {
    const ordre = (l: T[]) => l.map((e, i) => `${i + 1}. ${titre(e)}`).join(' · ')
    liste.push({ libelle: 'Ordre', avant: ordre(avant), apres: ordre(apres) })
  }
  return liste
}
export const ecartsFaq = (avant: QuestionFaq[], apres: QuestionFaq[]) =>
  changementsListe(avant, apres, 'Question', q => q.question, CHAMPS_QUESTION)
export const ecartsActualites = (avant: CarteActualite[], apres: CarteActualite[]) =>
  changementsListe(avant, apres, 'Carte', c => c.titre, CHAMPS_CARTE)

// Lignes d'une version (« Voir ») : un élément par ligne, textes tels qu'enregistrés (variables comprises)
export const lignesFaq = (liste: QuestionFaq[]) => liste.map((q, i) => ({
  libelle: `Question ${i + 1}${q.visible ? '' : ' (masquée)'}`,
  valeur: `${q.question} — ${q.reponse}${q.lien ? ` Lien : ${lireLien(q.lien)}.` : ''}`,
}))
export const lignesActualites = (liste: CarteActualite[]) => (liste.length
  ? liste.map((c, i) => ({
      libelle: `Carte ${i + 1} : ${c.categorie} (${NOMS_ICONES[c.icone]})`,
      valeur: `${c.titre} — ${c.resume}${c.lien ? ` Lien : ${lireLien(c.lien)}.` : ''}`,
    }))
  : [{ libelle: 'Actualités', valeur: 'aucune carte (section masquée)' }])

// --- Contrôles avant l'envoi, avec les messages du serveur (« Question 3 : réponse : 700 caractères au plus. ») ---
type Probleme = { champ: string; message: string } | null
const LISTE_VARIABLES = VARIABLES_TEXTE.map(v => `{${v.nom}}`).join(', ')
export const idElement = (cle: 'faq' | 'actualites', id: string, champ: string) => `${cle}.${id}.${champ}`

// Variables acceptées dans les réponses et les résumés seulement ; ailleurs, aucune accolade
function controlerTexte(valeur: string, regle: { min: number; max: number }, variables: boolean): string | null {
  if (/[<>]/.test(valeur)) return 'les caractères < et > ne sont pas acceptés.'
  const n = Array.from(valeur).length
  if (n < regle.min) return regle.min === 1 ? 'obligatoire.' : `${regle.min} caractères au moins.`
  if (n > regle.max) return `${regle.max} caractères au plus.`
  if (variables) {
    const accolade = accoladeInconnue(valeur)
    if (accolade) {
      return accolade.length > 1
        ? `variable inconnue : ${accolade}. Variables possibles : ${LISTE_VARIABLES}.`
        : 'accolade seule ; une variable s\'écrit entre accolades, par exemple {paiement}.'
    }
  } else if (/[{}]/.test(valeur)) {
    return 'les accolades ne sont acceptées que dans les réponses et les résumés, pour les variables.'
  }
  return null
}

function controlerLien(lien: LienContenu | null, max: number, valide: (vers: string) => boolean, aide: string): { champ: string; texte: string } | null {
  if (!lien) return null
  const erreur = controlerTexte(lien.texte, { min: 1, max }, false)
  if (erreur) return { champ: 'lien.texte', texte: `texte du lien : ${erreur}` }
  if (!lien.vers) return { champ: 'lien.vers', texte: 'adresse du lien : obligatoire.' }
  if (!valide(lien.vers)) return { champ: 'lien.vers', texte: `adresse du lien : ${aide}` }
  return null
}

function controlerIds(liste: { id: string }[], element: string): Probleme {
  const vus = new Set<string>()
  for (const [i, e] of liste.entries()) {
    if (!ID_CONTENU.test(e.id) || vus.has(e.id)) return { champ: '', message: `${element} ${i + 1} : identifiant invalide ou déjà utilisé. Rechargez la page.` }
    vus.add(e.id)
  }
  return null
}

export const AIDE_LIEN_FAQ = 'chemin du site (ex. /mentions-legales) ou ancre de l\'accueil (ex. #formules).'
export const AIDE_LIEN_ACTUALITE = 'chemin du site (ex. /blog), ancre de l\'accueil (ex. #formules) ou page https:// Facebook, TikTok ou WhatsApp.'

export function controlerFaq(liste: QuestionFaq[]): Probleme {
  if (!liste.length) return { champ: '', message: 'Questions fréquentes : ajoutez au moins une question.' }
  if (liste.length > REGLES_FAQ.max) return { champ: '', message: `Questions fréquentes : ${REGLES_FAQ.max} questions au plus.` }
  const ids = controlerIds(liste, 'Question')
  if (ids) return ids
  for (const [i, q] of liste.entries()) {
    const nom = `Question ${i + 1}`
    for (const [champ, libelle] of [['question', 'question'], ['reponse', 'réponse']] as const) {
      const erreur = controlerTexte(q[champ], REGLES_FAQ[champ], champ === 'reponse')
      if (erreur) return { champ: idElement('faq', q.id, champ), message: `${nom} : ${libelle} : ${erreur}` }
    }
    const lien = controlerLien(q.lien, REGLES_FAQ.texteLien.max, lienFaqValide, AIDE_LIEN_FAQ)
    if (lien) return { champ: idElement('faq', q.id, lien.champ), message: `${nom} : ${lien.texte}` }
  }
  if (!liste.some(q => q.visible)) return { champ: '', message: 'Questions fréquentes : au moins une question doit être affichée sur le site.' }
  return null
}

const CHAMPS_TEXTE_CARTE = [['categorie', 'catégorie'], ['titre', 'titre'], ['resume', 'résumé']] as const
export function controlerActualites(liste: CarteActualite[]): Probleme {
  if (liste.length > REGLES_ACTUALITE.max) return { champ: '', message: `Actualités : ${REGLES_ACTUALITE.max} cartes au plus.` }
  const ids = controlerIds(liste, 'Carte')
  if (ids) return ids
  for (const [i, c] of liste.entries()) {
    const nom = `Carte ${i + 1}`
    for (const [champ, libelle] of CHAMPS_TEXTE_CARTE) {
      const erreur = controlerTexte(c[champ], REGLES_ACTUALITE[champ], champ === 'resume')
      if (erreur) return { champ: idElement('actualites', c.id, champ), message: `${nom} : ${libelle} : ${erreur}` }
    }
    if (!ICONES_ACTUALITE.includes(c.icone)) return { champ: idElement('actualites', c.id, 'icone'), message: `${nom} : icône, « lancement », « partenaire » ou « communaute ».` }
    const lien = controlerLien(c.lien, REGLES_ACTUALITE.texteLien.max, lienActualiteValide, AIDE_LIEN_ACTUALITE)
    if (lien) return { champ: idElement('actualites', c.id, lien.champ), message: `${nom} : ${lien.texte}` }
  }
  return null
}

// Champ d'une erreur du serveur : « Question 3 : réponse : … » -> faq.<id de la 3e question>.reponse ;
// champ non reconnu : la question elle-même (sa carte s'ouvre) ; sans numéro : en haut du formulaire
const CHAMPS_MESSAGE: Record<string, string> = {
  question: 'question', réponse: 'reponse', catégorie: 'categorie', icône: 'icone', titre: 'titre', résumé: 'resume',
  'texte du lien': 'lien.texte', 'adresse du lien': 'lien.vers',
}
function champErreurListe(cle: 'faq' | 'actualites', message: string, ids: readonly string[]): string {
  const element = cle === 'faq' ? 'Question' : 'Carte'
  const trouve = new RegExp(`^${element} (\\d+) : ([^:,.]+?)\\s*[:,.]`, 'i').exec(message)
  const id = trouve ? ids[Number(trouve[1]) - 1] : undefined
  if (!trouve || !id) return ''
  const champ = CHAMPS_MESSAGE[trouve[2]!.trim().toLocaleLowerCase('fr-FR')] ?? (cle === 'faq' ? 'question' : 'titre')
  return idElement(cle, id, champ)
}
