// Écran « Site public » : champs de chaque contenu, tels qu'affichés dans la confirmation, l'historique et les
// erreurs. Les libellés sont ceux des messages d'erreur du serveur (« Numéro WhatsApp : … »), ce qui permet
// d'afficher une erreur à côté du champ concerné.
import { INFOS_PAR_DEFAUT, reseauxDe } from '@/config/contact'
import { FORMULES_DU_CODE, SLUGS_VITRINE, TAILLES_FOYER, TEXTES_FORMULES_DU_CODE } from '@/config/formules'
import { FAQ_PAR_DEFAUT } from '@/config/faq'
import { cartesDuCode } from '@/config/actualites'
import { PHOTOS, TITRES_FRISE } from '@/config/photos'
import { TEMOIGNAGES_PAR_DEFAUT } from '@/config/temoignages'
import { adresseCloudinary } from '@/services/images'
import { nomPack, type Pack } from '@/services/packs'
import {
  BANDEAU_VIDE, annonceLivraison, copierInfos, formaterHoraires, formaterNumero, fusionnerInfos, normaliserNumero,
  JOURS_SEMAINE, REGLES_FORMULE, fusionnerTextesFormules, lirePrix,
  CARTE_NOUVELLE, emojiValide, estTheme, trierParOrdre, type CouleurFormule, type TexteFormule, type ThemeFormule,
  ICONES_ACTUALITE, ID_CONTENU, VARIABLES_TEXTE, REGLES_ACTUALITE, REGLES_FAQ, accoladeInconnue, fusionnerActualites, fusionnerFaq, lienActualiteValide,
  lienFaqValide,
  EMPLACEMENTS_FRISE, PUBLIC_ID_SITE, REGLES_PHOTO, REGLES_TEMOIGNAGE, fusionnerPhotos, fusionnerTemoignages, jourCotonou, noteValide,
  photoDuCode, urlPhotoValide,
  type BandeauSite, type CarteActualite, type EmplacementFrise, type IconeActualite, type InfosSite, type LienContenu, type PhotoSite,
  type PhotosSite, type PrixSite, type QuestionFaq, type TemoignageSite, type TextesFormules,
} from '@/services/valeursSite'

export type CleContenu = 'infos' | 'bandeau' | 'formules' | 'faq' | 'actualites' | 'photos' | 'temoignages'

export interface Version { _id: string; publieLe: string; publiePar: { nom: string } }
export interface ContenuEcran<T> { valeurs: T; updatedAt: string; versions: Version[] }
export interface ContenusSite {
  infos: ContenuEcran<InfosSite> | null
  bandeau: ContenuEcran<BandeauSite> | null
  formules: ContenuEcran<TextesFormules> | null
  faq: ContenuEcran<QuestionFaq[]> | null
  actualites: ContenuEcran<CarteActualite[]> | null
  photos: ContenuEcran<PhotosSite> | null
  temoignages: ContenuEcran<TemoignageSite[]> | null
}
// Réponse de GET /api/admin/site : contenus publiés et prix de vente de la base (lecture seule ici, lot B ; les trois
// cartes du code, et chaque autre pack dont le serveur donne le prix)
export interface ReponseSite { contenus: ContenusSite; prix: PrixSite }

export const lireReponseSite = (d: { contenus?: Partial<ContenusSite>; prix?: unknown } | undefined): ReponseSite => ({
  contenus: {
    infos: d?.contenus?.infos ?? null, bandeau: d?.contenus?.bandeau ?? null, formules: d?.contenus?.formules ?? null,
    faq: d?.contenus?.faq ?? null, actualites: d?.contenus?.actualites ?? null,
    photos: d?.contenus?.photos ?? null, temoignages: d?.contenus?.temoignages ?? null,
  },
  prix: lirePrix([...new Set([...SLUGS_VITRINE, ...Object.keys(typeof d?.prix === 'object' && d.prix ? d.prix : {})])], d?.prix),
})

export const TITRES_CONTENUS: Record<CleContenu, string> = {
  infos: 'Infos pratiques', bandeau: 'Bandeau d\'annonce', formules: 'Formules', faq: 'Questions fréquentes', actualites: 'Actualités',
  photos: 'Photos de la frise', temoignages: 'Témoignages',
}

// Ligne d'une version (« Voir ») : libellé, valeur, et pour les photos une miniature
export interface LigneVersion { libelle: string; valeur: string; image?: string }

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
export const libelleFoyer = (foyer: string) => (foyer ? TAILLES_FOYER.find(t => t.valeur === foyer)?.libelle ?? foyer : 'aucune')

// Une carte par pack de la base (usePacks) ; avant l'arrivée de la liste, et dans les tests, les trois cartes du code
export const PACKS_DU_CODE: Pack[] = FORMULES_DU_CODE.map(f => ({
  type: f.slug.replace(/^ahi-/, ''), slug: f.slug, nom: nomPack(f.nom), statut: 'actif', bientotDisponible: false, ordre: null,
}))
export const estCarteDuCode = (slug: string) => SLUGS_VITRINE.includes(slug)
// Nom affiché sur la carte : celui du code pour les trois cartes par défaut, sinon celui du pack en capitales (comme le site)
export const nomSurLaCarte = (pack: Pick<Pack, 'slug' | 'nom'>) =>
  FORMULES_DU_CODE.find(f => f.slug === pack.slug)?.nom ?? pack.nom.toLocaleUpperCase('fr-FR')
const nomDuPack = (packs: readonly Pack[], slug: string) => packs.find(p => p.slug === slug)?.nom ?? slug

export const NOMS_THEMES: Record<ThemeFormule, string> = { savane: 'Savane clair', foret: 'Forêt', marine: 'Marine' }
const lireCouleur = (c: CouleurFormule) => (estTheme(c) ? NOMS_THEMES[c] : `couleur libre ${c.toUpperCase()}`)
const lireTexte = (t: string, suite = '') => (t ? `${t}${suite}` : '(vide)')

// Réglages d'une carte ; absente des valeurs : celle d'un pack sans publication
const reglagesDe = (v: TextesFormules, slug: string) => v[slug] ?? CARTE_NOUVELLE
// Place parmi les cartes affichées (« 2e place »), ou « masquée »
function place(v: TextesFormules, slug: string): string {
  if (!reglagesDe(v, slug).afficher) return 'masquée'
  const rang = trierParOrdre(v).filter(s => v[s]!.afficher).indexOf(slug) + 1
  return rang === 1 ? '1re place' : `${rang}e place`
}
function nomRecommandee(v: TextesFormules, packs: readonly Pack[]): string {
  const slug = trierParOrdre(v).find(s => v[s]!.afficher && v[s]!.recommandee)
  return slug ? nomSurLaCarte({ slug, nom: nomDuPack(packs, slug) }) : 'aucune'
}

// Champs des cartes, pour la confirmation et l'historique ; les libellés reprennent les messages du serveur
// (« Étudiant : niveau de confort, 1, 2 ou 3. »)
export function champsFormules(packs: readonly Pack[] = PACKS_DU_CODE): Champ<TextesFormules>[] {
  return [
    ...packs.flatMap((p): Champ<TextesFormules>[] => {
      const court = nomCourt(p.nom)
      const r = (v: TextesFormules) => reglagesDe(v, p.slug)
      return [
        { id: `${p.slug}.afficher`, libelle: `${court} : afficher`, lire: v => (r(v).afficher ? 'oui' : 'non') },
        { id: `${p.slug}.ordre`, libelle: `${court} : ordre`, lire: v => place(v, p.slug) },
        { id: `${p.slug}.emoji`, libelle: `${court} : emoji`, lire: v => r(v).emoji },
        { id: `${p.slug}.couleur`, libelle: `${court} : couleur`, lire: v => lireCouleur(r(v).couleur) },
        { id: `${p.slug}.niveau`, libelle: `${court} : niveau de confort`, lire: v => `${r(v).niveau} sur 3` },
        { id: `${p.slug}.cible`, libelle: `${court} : cible`, lire: v => lireTexte(r(v).cible) },
        { id: `${p.slug}.accroche`, libelle: `${court} : accroche`, lire: v => lireTexte(r(v).accroche) },
        { id: `${p.slug}.repas`, libelle: `${court} : repas`, lire: v => lireTexte(r(v).repas, ' repas possibles') },
        { id: `${p.slug}.heures`, libelle: `${court} : heures`, lire: v => lireTexte(r(v).heures, ' économisées') },
        { id: `${p.slug}.foyer`, libelle: `${court} : taille de foyer`, lire: v => libelleFoyer(r(v).foyer) },
      ]
    }),
    { id: 'recommandee', libelle: 'Formule recommandée', lire: v => nomRecommandee(v, packs) },
  ]
}

// Mots des messages du serveur après le nom de la carte (« Étudiant : niveau de confort, 1, 2 ou 3. ») -> champ
const CHAMPS_ERREUR_FORMULE: [string, string][] = [
  ['afficher', 'afficher'], ['ordre', 'ordre'], ['emoji', 'emoji'], ['couleur', 'couleur'], ['niveau', 'niveau'],
  ['cible', 'cible'], ['accroche', 'accroche'], ['repas', 'repas'], ['heures', 'heures'], ['taille de foyer', 'foyer'],
]
// Le serveur nomme une carte du code par son nom court (« Essentiel ») et les autres par le nom du pack
// (« AHI Étudiant ») : les deux sont reconnus, sans tenir compte des majuscules
function champErreurFormule(message: string, packs: readonly Pack[]): string {
  const m = message.toLocaleLowerCase('fr-FR')
  if (m.startsWith('formule recommandée')) return 'recommandee'
  for (const p of packs) {
    for (const nom of [p.nom, nomCourt(p.nom)]) {
      const debut = `${nom.toLocaleLowerCase('fr-FR')} : `
      if (!m.startsWith(debut)) continue
      const reste = m.slice(debut.length)
      if (reste.startsWith('recommandée')) return 'recommandee'
      const champ = CHAMPS_ERREUR_FORMULE.find(([mot]) => reste.startsWith(mot))?.[1]
      return champ ? `${p.slug}.${champ}` : ''
    }
  }
  return ''
}

// Libellés d'erreur du serveur qui ne sont pas des champs de la liste ci-dessus
const AUTRES_ERREURS: Record<string, string> = {
  'Jours d\'ouverture': 'horaires.jours',
  'Heure d\'ouverture': 'horaires.ouverture',
  'Heure de fermeture': 'horaires.fermeture',
}

// Champ nommé au début du message d'erreur (« Facebook : adresse invalide… »), sinon '' (erreur en haut du formulaire).
// FAQ et actualités : « Question 3 : réponse : … » ou « Carte 2 : titre : … », d'après les identifiants du formulaire.
// Formules : d'après les packs de l'écran (`packs`).
export function champDeLErreur(cle: CleContenu, message: string, ids: readonly string[] = [], packs: readonly Pack[] = PACKS_DU_CODE): string {
  if (cle === 'faq' || cle === 'actualites') return champErreurListe(cle, message, ids)
  if (cle === 'temoignages') return champErreurTemoignage(message, ids)
  if (cle === 'photos') return champErreurPhoto(message)
  if (cle === 'formules') return champErreurFormule(message, packs)
  const champs: { id: string; libelle: string }[] = cle === 'infos' ? CHAMPS_INFOS : CHAMPS_BANDEAU
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

// Réglages du site pour chaque pack (`packs` : ceux de la base ; sans packs, les cartes du code puis les autres publiées)
export const formulesPubliees = (contenu: ContenusSite['formules'] | undefined, packs?: readonly Pack[]): TextesFormules =>
  fusionnerTextesFormules(TEXTES_FORMULES_DU_CODE, contenu?.valeurs, packs?.map(p => p.slug))

// Formulaire : cartes rangées et numérotées 0, 1, 2… (les flèches échangent deux places)
export const formulesEnFormulaire = (t: TextesFormules): TextesFormules =>
  Object.fromEntries(trierParOrdre(t).map((slug, i) => [slug, { ...t[slug]!, ordre: i }]))

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

const sansTexte = (t: TexteFormule) => ![t.cible, t.accroche, t.repas, t.heures].some(x => nettoyer(x))

// Réglages complets de chaque carte, dans l'ordre (numérotée 0, 1, 2…), textes nettoyés et couleur libre en capitales.
// Le serveur exige les quatre textes de chaque carte envoyée : la carte masquée d'un pack créé, encore sans aucun
// texte, n'est pas envoyée (elle reste sans publication). Une carte masquée n'est jamais la recommandée.
export function formulesAEnvoyer(f: TextesFormules): TextesFormules {
  const envoyees = trierParOrdre(f).filter(slug => estCarteDuCode(slug) || f[slug]!.afficher || !sansTexte(f[slug]!))
  return Object.fromEntries(envoyees.map((slug, ordre) => {
    const t = f[slug]!
    return [slug, {
      afficher: t.afficher, ordre, emoji: t.emoji.trim(), couleur: (estTheme(t.couleur) ? t.couleur : t.couleur.toUpperCase()) as CouleurFormule,
      niveau: t.niveau, cible: nettoyer(t.cible), accroche: nettoyer(t.accroche), repas: nettoyer(t.repas), heures: nettoyer(t.heures),
      foyer: t.foyer, recommandee: t.recommandee && t.afficher,
    } satisfies TexteFormule]
  }))
}

// Contrôle simple avant l'envoi, avec les messages du serveur (« Essentiel : accroche : 120 caractères au plus. »)
const FORMATS: Record<'repas' | 'heures', string> = {
  repas: 'repas, chiffres et tiret seulement (ex. 20–30).',
  heures: 'heures, chiffres, tiret et « h » seulement (ex. 2–4h).',
}

// Taille de foyer déjà choisie par une carte affichée placée avant (le serveur veut une carte affichée différente par
// taille ; « Aucune » ne compte pas) : slug -> nom de la carte qui l'a déjà
export function doublonsFoyer(f: TextesFormules, packs: readonly Pack[] = PACKS_DU_CODE): Record<string, string> {
  const vus = new Map<string, string>()
  const doublons: Record<string, string> = {}
  for (const slug of trierParOrdre(f)) {
    const { afficher, foyer } = f[slug]!
    if (!afficher || !foyer) continue
    const deja = vus.get(foyer)
    if (deja) doublons[slug] = deja
    else vus.set(foyer, nomSurLaCarte({ slug, nom: nomDuPack(packs, slug) }))
  }
  return doublons
}
export const messageDoublonFoyer = (deja: string) => `Taille de foyer : déjà choisie pour ${deja}. Une formule différente pour chaque taille (1, 2-3, 4-6).`

// Mêmes règles que le serveur, sur les valeurs à envoyer (formulesAEnvoyer), carte par carte dans l'ordre
export function controlerFormules(f: TextesFormules, packs: readonly Pack[] = PACKS_DU_CODE): { champ: string; message: string } | null {
  for (const slug of trierParOrdre(f)) {
    const t = f[slug]!
    const court = nomCourt(nomDuPack(packs, slug))
    if (!emojiValide(t.emoji)) return { champ: `${slug}.emoji`, message: `${court} : emoji : 1 à 8 caractères (ex. 🎓), sans < ni >.` }
    for (const nom of ['cible', 'accroche', 'repas', 'heures'] as const) {
      const valeur = t[nom]
      const champ = `${slug}.${nom}`
      const erreur = (texte: string) => ({ champ, message: `${court} : ${nom} : ${texte}` })
      if (/[<>]/.test(valeur)) return erreur('les caractères < et > ne sont pas acceptés.')
      if (!valeur) return erreur(t.afficher || estCarteDuCode(slug) ? 'obligatoire.' : 'obligatoire. Carte masquée : remplissez ses quatre textes, ou videz-les tous.')
      if (Array.from(valeur).length > REGLES_FORMULE[nom].max) return erreur(`${REGLES_FORMULE[nom].max} caractères au plus.`)
      if ((nom === 'repas' || nom === 'heures') && !REGLES_FORMULE[nom].motif.test(valeur)) {
        return { champ, message: `${court} : ${FORMATS[nom]}` }
      }
    }
  }
  const actif = (slug: string) => packs.find(p => p.slug === slug)?.statut !== 'inactif'
  if (!Object.keys(f).some(s => f[s]!.afficher && actif(s))) {
    return { champ: '', message: 'Cartes de l\'accueil : affichez au moins une carte d\'un pack actif.' }
  }
  const doublon = Object.entries(doublonsFoyer(f, packs))[0]
  if (doublon) return { champ: `${doublon[0]}.foyer`, message: messageDoublonFoyer(doublon[1]) }
  if (Object.values(f).filter(t => t.afficher && t.recommandee).length > 1) {
    return { champ: 'recommandee', message: 'Formule recommandée : une seule au plus parmi les cartes affichées.' }
  }
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

// Ce qui change entre deux listes, élément par élément (même identifiant) : ajouts, champs modifiés, suppressions, ordre.
// `masculin` accorde « ajouté », « supprimé » (témoignage) ; sinon « ajoutée », « supprimée » (question, carte).
function changementsListe<T extends { id: string }>(
  avant: T[], apres: T[], element: string, titre: (e: T) => string, champs: ChampElement<T>[], masculin = false,
): Changement[] {
  const liste: Changement[] = []
  const accord = masculin ? '' : 'e'
  const anciens = new Map(avant.map(e => [e.id, e]))
  apres.forEach((e, i) => {
    const ancien = anciens.get(e.id)
    if (!ancien) {
      liste.push({ libelle: `${element} ${i + 1} ajouté${accord}`, avant: '—', apres: titre(e) })
      return
    }
    for (const c of champs) {
      const a = c.lire(ancien)
      const b = c.lire(e)
      if (a !== b) liste.push({ libelle: `${element} ${i + 1} : ${c.libelle}`, avant: a, apres: b })
    }
  })
  const ids = new Set(apres.map(e => e.id))
  for (const e of avant) if (!ids.has(e.id)) liste.push({ libelle: `${element} supprimé${accord}`, avant: titre(e), apres: '—' })
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
export const idElement = (cle: 'faq' | 'actualites' | 'temoignages', id: string, champ: string) => `${cle}.${id}.${champ}`

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

// ------------------------------------------------------------------
// Photos de la frise et témoignages (lot D, docs-internes/admin/CONTRAT-site-public-D.md)
// Messages repris du serveur : « Photo « Production » : description : 10 caractères au moins. »,
// « Témoignage 2 : date de l'accord, pas avant le 01/01/2026. »
// ------------------------------------------------------------------

const dateCourte = (jour: string) => jour.split('-').reverse().join('/') // « 2026-10-04 » -> « 04/10/2026 »
export const nomPhoto = (cle: EmplacementFrise) => `Photo « ${TITRES_FRISE[cle]} »`
export const idPhoto = (cle: EmplacementFrise, champ: 'url' | 'alt' | 'droits') => `photos.${cle}.${champ}`

// --- Photos ---
export const photosPubliees = (contenu: ContenusSite['photos'] | undefined): PhotosSite => fusionnerPhotos(contenu?.valeurs)
export const copierPhotos = (p: PhotosSite): PhotosSite =>
  Object.fromEntries(EMPLACEMENTS_FRISE.map(cle => [cle, { ...p[cle] }])) as PhotosSite

// Valeurs envoyées : les 5 emplacements ; sans photo envoyée, les champs vides (l'emplacement garde la photo du code)
export const photosAEnvoyer = (f: PhotosSite): PhotosSite => Object.fromEntries(EMPLACEMENTS_FRISE.map(cle => {
  const p = f[cle]
  return [cle, p.url ? { url: p.url, publicId: p.publicId, alt: nettoyer(p.alt), droits: p.droits === true } : photoDuCode()]
})) as PhotosSite

const MESSAGE_DROITS = 'cochez la case des droits (photo prise par l\'équipe Ahitché, ou fournie avec l\'accord écrit de son auteur et des personnes visibles).'
export function controlerPhotos(f: PhotosSite): Probleme {
  for (const cle of EMPLACEMENTS_FRISE) {
    const p = f[cle]
    if (!p.url) continue
    const nom = nomPhoto(cle)
    if (!PUBLIC_ID_SITE.test(p.publicId) || !urlPhotoValide(p.url, p.publicId)) {
      return { champ: idPhoto(cle, 'url'), message: `${nom} : adresse refusée ; envoyez la photo depuis cet écran.` }
    }
    const alt = idPhoto(cle, 'alt')
    if (/[<>]/.test(p.alt)) return { champ: alt, message: `${nom} : description : les caractères < et > ne sont pas acceptés.` }
    const n = Array.from(p.alt).length
    if (!n) return { champ: alt, message: `${nom} : description obligatoire (ce que montre la photo, lue aux personnes malvoyantes).` }
    if (n < REGLES_PHOTO.alt.min) return { champ: alt, message: `${nom} : description : ${REGLES_PHOTO.alt.min} caractères au moins.` }
    if (n > REGLES_PHOTO.alt.max) return { champ: alt, message: `${nom} : description : ${REGLES_PHOTO.alt.max} caractères au plus.` }
    if (!p.droits) return { champ: idPhoto(cle, 'droits'), message: `${nom} : ${MESSAGE_DROITS}` }
  }
  return null
}

// Erreur du serveur : « Photo « Livraison » : … » -> champ de cet emplacement (description, droits, sinon la photo elle-même)
function champErreurPhoto(message: string): string {
  const trouve = /^Photo « ([^»]+) » : (.*)$/s.exec(message)
  const cle = trouve ? EMPLACEMENTS_FRISE.find(c => TITRES_FRISE[c] === trouve[1]) : undefined
  if (!trouve || !cle) return ''
  const suite = trouve[2]!
  return idPhoto(cle, suite.startsWith('description') ? 'alt' : suite.startsWith('cochez la case des droits') ? 'droits' : 'url')
}

// Ce qui change, emplacement par emplacement (la photo elle-même, puis sa description)
const lirePhotoChange = (p: PhotoSite, cote: 'avant' | 'apres') =>
  (!p.url ? 'photo du code' : cote === 'avant' ? 'photo publiée' : 'autre photo, envoyée depuis l\'admin')
export function ecartsPhotos(avant: PhotosSite, apres: PhotosSite): Changement[] {
  const liste: Changement[] = []
  for (const cle of EMPLACEMENTS_FRISE) {
    const a = avant[cle]
    const b = apres[cle]
    if (a.url !== b.url) liste.push({ libelle: `${nomPhoto(cle)} : photo`, avant: lirePhotoChange(a, 'avant'), apres: lirePhotoChange(b, 'apres') })
    const altAvant = a.url ? a.alt : '—'
    const altApres = b.url ? b.alt : '—'
    if (altAvant !== altApres) liste.push({ libelle: `${nomPhoto(cle)} : description`, avant: altAvant, apres: altApres })
  }
  return liste
}

// Lignes d'une version (« Voir »), avec la miniature de chaque emplacement
export const lignesPhotos = (v: PhotosSite): LigneVersion[] => EMPLACEMENTS_FRISE.map((cle, i) => {
  const p = v[cle]
  const code = PHOTOS[cle]
  return {
    libelle: `Étape ${i + 1} · ${TITRES_FRISE[cle]}`,
    valeur: p.url ? `Photo envoyée depuis l'admin. Description : ${p.alt}` : 'Photo du code',
    image: p.url ? adresseCloudinary(p.url, 400, code.ratio) : code.fichier ? `${code.fichier}-400.webp` : undefined,
  }
})

// --- Témoignages ---
export const temoignagesPublies = (contenu: ContenusSite['temoignages'] | undefined): TemoignageSite[] =>
  fusionnerTemoignages(TEMOIGNAGES_PAR_DEFAUT, contenu ? contenu.valeurs : null)
export const copierTemoignages = (liste: TemoignageSite[]): TemoignageSite[] => liste.map(t => ({ ...t }))

export const temoignagesAEnvoyer = (liste: TemoignageSite[]): TemoignageSite[] => liste.map(t => ({
  id: t.id, prenom: nettoyer(t.prenom), quartier: nettoyer(t.quartier), note: t.note, texte: nettoyer(t.texte),
  accordLe: t.accordLe, visible: t.visible === true,
}))

// Jour « AAAA-MM-JJ » qui existe au calendrier
function jourValide(jour: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return false
  const [a, m, j] = jour.split('-').map(Number) as [number, number, number]
  const d = new Date(Date.UTC(a, m - 1, j))
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j
}

const CHAMPS_TEXTE_TEMOIGNAGE = [['prenom', 'prénom'], ['quartier', 'quartier']] as const
export function controlerTemoignages(liste: TemoignageSite[], aujourdhui = jourCotonou()): Probleme {
  if (liste.length > REGLES_TEMOIGNAGE.max) return { champ: '', message: `Témoignages : ${REGLES_TEMOIGNAGE.max} au plus.` }
  const ids = controlerIds(liste, 'Témoignage')
  if (ids) return ids
  for (const [i, t] of liste.entries()) {
    const nom = `Témoignage ${i + 1}`
    const champ = (c: string) => idElement('temoignages', t.id, c)
    for (const [c, libelle] of CHAMPS_TEXTE_TEMOIGNAGE) {
      const erreur = controlerTexte(t[c], REGLES_TEMOIGNAGE[c], false)
      if (erreur) return { champ: champ(c), message: `${nom} : ${libelle} : ${erreur}` }
    }
    if (!noteValide(t.note)) return { champ: champ('note'), message: `${nom} : note : choisissez de 1 à 5 étoiles.` }
    const texte = controlerTexte(t.texte, REGLES_TEMOIGNAGE.texte, false)
    if (texte) return { champ: champ('texte'), message: `${nom} : texte : ${texte}` }
    const accord = champ('accordLe')
    if (!t.accordLe) return { champ: accord, message: `${nom} : date de l'accord obligatoire (jour où la personne a validé le texte et accepté sa publication).` }
    if (!jourValide(t.accordLe)) return { champ: accord, message: `${nom} : date de l'accord : date au format AAAA-MM-JJ attendue.` }
    if (t.accordLe < REGLES_TEMOIGNAGE.accordMin) return { champ: accord, message: `${nom} : date de l'accord, pas avant le ${dateCourte(REGLES_TEMOIGNAGE.accordMin)}.` }
    if (t.accordLe > aujourdhui) return { champ: accord, message: `${nom} : date de l'accord dans le futur (nous sommes le ${dateCourte(aujourdhui)} à Cotonou).` }
  }
  return null
}

// Erreur du serveur : « Témoignage 2 : date de l'accord, pas avant… » -> temoignages.<id du 2e>.accordLe ;
// champ non reconnu : le prénom (sa carte s'ouvre) ; sans numéro : en haut du formulaire
const CHAMPS_TEMOIGNAGE_MESSAGE: [string, string][] = [
  ['date de l\'accord', 'accordLe'], ['prénom', 'prenom'], ['quartier', 'quartier'], ['note', 'note'], ['texte', 'texte'],
  ['« afficher sur le site »', 'visible'],
]
function champErreurTemoignage(message: string, ids: readonly string[]): string {
  const trouve = /^Témoignage (\d+) : (.*)$/s.exec(message)
  const id = trouve ? ids[Number(trouve[1]) - 1] : undefined
  if (!trouve || !id) return ''
  const suite = trouve[2]!.toLocaleLowerCase('fr-FR')
  const champ = CHAMPS_TEMOIGNAGE_MESSAGE.find(([libelle]) => suite.startsWith(libelle))?.[1] ?? 'prenom'
  return idElement('temoignages', id, champ)
}

const CHAMPS_TEMOIGNAGE: ChampElement<TemoignageSite>[] = [
  { libelle: 'prénom', lire: t => t.prenom },
  { libelle: 'quartier', lire: t => t.quartier || 'aucun' },
  { libelle: 'note', lire: t => `${t.note} sur 5` },
  { libelle: 'texte', lire: t => t.texte },
  { libelle: 'date de l\'accord', lire: t => dateLisible(t.accordLe) },
  { libelle: 'affiché sur le site', lire: t => (t.visible ? 'oui' : 'non (masqué)') },
]
export const ecartsTemoignages = (avant: TemoignageSite[], apres: TemoignageSite[]) =>
  changementsListe(avant, apres, 'Témoignage', t => t.prenom || 'sans prénom', CHAMPS_TEMOIGNAGE, true)

export const lignesTemoignages = (liste: TemoignageSite[]): LigneVersion[] => (liste.length
  ? liste.map((t, i) => ({
      libelle: `Témoignage ${i + 1}${t.visible ? '' : ' (masqué)'}`,
      valeur: `${t.prenom}${t.quartier ? `, ${t.quartier}` : ''} · ${t.note} sur 5 · accord du ${dateLisible(t.accordLe)} — « ${t.texte} »`,
    }))
  : [{ libelle: 'Témoignages', valeur: 'aucun témoignage (seuls les avis des clients s\'affichent)' }])
