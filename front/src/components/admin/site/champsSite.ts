// Écran « Site public » : champs de chaque contenu, tels qu'affichés dans la confirmation, l'historique et les
// erreurs. Les libellés sont ceux des messages d'erreur du serveur (« Numéro WhatsApp : … »), ce qui permet
// d'afficher une erreur à côté du champ concerné.
import { INFOS_PAR_DEFAUT } from '@/config/contact'
import {
  BANDEAU_VIDE, annonceLivraison, copierInfos, formaterHoraires, formaterNumero, fusionnerInfos, normaliserNumero,
  JOURS_SEMAINE, type BandeauSite, type InfosSite,
} from '@/services/valeursSite'

export type CleContenu = 'infos' | 'bandeau'

export interface Version { _id: string; publieLe: string; publiePar: { nom: string } }
export interface ContenuEcran<T> { valeurs: T; updatedAt: string; versions: Version[] }
export interface ContenusSite {
  infos: ContenuEcran<InfosSite> | null
  bandeau: ContenuEcran<BandeauSite> | null
}

export const TITRES_CONTENUS: Record<CleContenu, string> = { infos: 'Infos pratiques', bandeau: 'Bandeau d\'annonce' }

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

// Libellés d'erreur du serveur qui ne sont pas des champs de la liste ci-dessus
const AUTRES_ERREURS: Record<string, string> = {
  'Jours d\'ouverture': 'horaires.jours',
  'Heure d\'ouverture': 'horaires.ouverture',
  'Heure de fermeture': 'horaires.fermeture',
}

// Champ nommé au début du message d'erreur (« Facebook : adresse invalide… »), sinon '' (erreur en haut du formulaire)
export function champDeLErreur(cle: CleContenu, message: string): string {
  const champs: { id: string; libelle: string }[] = cle === 'infos' ? CHAMPS_INFOS : CHAMPS_BANDEAU
  const libelles = [...champs, ...(cle === 'infos' ? Object.entries(AUTRES_ERREURS).map(([libelle, id]) => ({ id, libelle })) : [])]
  const trouve = libelles.find(c => message.startsWith(`${c.libelle} :`))
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

// Période d'affichage, en clair
export function periodeBandeau(b: BandeauSite): string {
  if (!b.actif) return 'Bandeau masqué : rien ne s\'affiche sur le site.'
  if (b.debut && b.fin) return `Affiché du ${dateLisible(b.debut)} au ${dateLisible(b.fin)} inclus (heure de Cotonou).`
  if (b.debut) return `Affiché à partir du ${dateLisible(b.debut)} (heure de Cotonou), sans date de fin.`
  if (b.fin) return `Affiché dès la publication, jusqu'au ${dateLisible(b.fin)} inclus (heure de Cotonou).`
  return 'Affiché dès la publication, sans date de fin.'
}
