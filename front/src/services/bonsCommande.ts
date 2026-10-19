import type { BonCommande, LigneBonFacture, ProduitLigneBon, StatutBon, TypeCommandeBon } from '@/type'

// Bons de commande fournisseurs : outils communs à la liste, au formulaire, à la réception et au PDF.
// Les contrôles reprennent ceux du serveur (back/src/controllers/admin/InventoryController.js) : le serveur fait foi
// et ses messages s'affichent tels quels.

export const MAX_LIGNES_BON = 100 // Comme le serveur (limite de 60 s des transactions Atlas)

// --- Lecture d'un bon ---

// Bon au format facture : il porte les lignes de la facture (l'ancien format n'a que des `items`)
export const estFormatFacture = (bon: BonCommande): boolean => (bon.lignes?.length ?? 0) > 0

export const ligneRecue = (l: LigneBonFacture): boolean =>
  !!l.lotId || (l.quantiteRecue !== null && l.quantiteRecue !== undefined)

export const produitDeLigne = (l: { productId: ProduitLigneBon | string | null }): ProduitLigneBon | null =>
  l.productId && typeof l.productId === 'object' ? l.productId : null

export const libelleProduit = (p: Pick<ProduitLigneBon, 'name' | 'reference'> | null): string =>
  p ? [p.reference, p.name].filter(Boolean).join(' · ') : 'Produit introuvable'

export const numeroDuLot = (l: LigneBonFacture): string =>
  l.numeroLot || (l.lotId && typeof l.lotId === 'object' ? l.lotId.numeroLot : '')

// Achat direct : son numéro (« Achat direct – facture n° … ») reprend celui de la facture
export const estAchatDirect = (bon: BonCommande): boolean =>
  estFormatFacture(bon) && bon.typeCommande === 'Achat direct' && !!bon.numeroFacture

// « le bon BC-12 » ou « l'achat direct (facture n° 34) », pour les titres et les confirmations
export const nomDuBon = (bon: BonCommande): string =>
  estAchatDirect(bon) ? `l'achat direct (facture n° ${bon.numeroFacture})` : `le bon ${bon.numeroBon}`

// Réceptionner : bon au format facture, en attente ou reçu en partie, avec au moins une ligne non reçue
export const peutReceptionner = (bon: BonCommande): boolean =>
  estFormatFacture(bon) && (bon.statut === 'En attente' || bon.statut === 'Reçu partiellement')
  && (bon.lignes ?? []).some(l => !ligneRecue(l))

// Bon au format facture dont une ligne au moins est entrée en stock : ses lignes ne se modifient plus, le bon ne se
// supprime plus (refusé par le serveur)
export const lignesFigees = (bon: BonCommande): boolean =>
  estFormatFacture(bon) && (bon.statut === 'Reçu' || bon.statut === 'Reçu partiellement' || (bon.lignes ?? []).some(ligneRecue))

// Modifier au format facture : tout bon sauf annulé ; une fois reçu, l'en-tête seulement (choix du porteur du 19/10/2026)
export const peutModifierFacture = (bon: BonCommande): boolean =>
  estFormatFacture(bon) && bon.statut !== 'Annulé'

export const CLASSES_STATUT_BON: Record<StatutBon, string> = {
  'En attente': 'bg-amber-50 text-amber-800 border border-amber-200',
  'Reçu partiellement': 'bg-or/20 text-noir border border-or/40',
  'Reçu': 'bg-green-50 text-green-800 border border-green-200',
  'Annulé': 'bg-creme2 text-gris border border-creme2',
}
export const classeStatutBon = (statut: string): string =>
  CLASSES_STATUT_BON[statut as StatutBon] ?? 'bg-creme2 text-gris border border-creme2'

// Total d'un bon : somme de la facture, ou montant prévu (quantité × prix prévu) à l'ancien format
export const totalDuBon = (bon: BonCommande): number =>
  estFormatFacture(bon)
    ? bon.montantTotalFcfa ?? arrondi2((bon.lignes ?? []).reduce((s, l) => s + (l.montantFcfa || 0), 0))
    : (bon.items ?? []).reduce((s, i) => s + (i.quantiteCommandee || 0) * (i.prixUnitairePrevu || 0), 0)

// --- Nombres, montants et dates ---

export const arrondi2 = (n: number): number => Math.round(n * 100) / 100

// Nombre saisi, comme le serveur : un nombre ou un texte numérique, fini ; NaN sinon (champ vide compris)
export function nombreSaisi(v: unknown): number {
  if (typeof v !== 'number' && !(typeof v === 'string' && v.trim() !== '')) return NaN
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

export const formatFcfa = (n: number | null | undefined): string =>
  `${Number(n ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA`

export const formatQuantite = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : n.toLocaleString('fr-FR', { maximumFractionDigits: 3 })

// Date du serveur (ou saisie « AAAA-MM-JJ ») en « JJ/MM/AAAA », à l'heure du Bénin
export const dateFr = (d: string | null | undefined): string =>
  d ? new Date(d).toLocaleDateString('fr-FR', { timeZone: 'Africa/Porto-Novo' }) : ''

// Jour « AAAA-MM-JJ » d'une date du serveur (saisie au jour, enregistrée à minuit UTC), pour un champ date
export const jourIso = (d: string | null | undefined): string => (d ? String(d).slice(0, 10) : '')

// Date du jour à l'heure locale (toISOString donnerait la veille entre minuit et 1 h à Cotonou)
export const aujourdHui = (): string => new Date().toLocaleDateString('sv-SE')

// Jour « AAAA-MM-JJ » qui existe au calendrier (« 2026-02-30 » est refusée, comme par le serveur)
export function dateValide(valeur: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur.trim())
  if (!m) return false
  const [annee, mois, jour] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const d = new Date(Date.UTC(annee, mois - 1, jour))
  return d.getUTCFullYear() === annee && d.getUTCMonth() === mois - 1 && d.getUTCDate() === jour
}

// --- Saisie d'un bon au format facture (création et modification) ---

export interface LigneSaisie {
  cle: number // Clé d'affichage (v-for), jamais envoyée
  designation: string
  quantiteFacture: string
  productId: string
  quantite: number | string | null
  detailQuantite: string
  montantFcfa: number | string | null
  produitRetire: string // Produit d'origine absent du catalogue actif (modification) : à remplacer
}

export interface SaisieBon {
  typeCommande: TypeCommandeBon
  numeroBon: string
  numeroFacture: string
  dateFacture: string
  dateEmission: string
  fournisseurId: string
  ligneBudgetaire: string
  sousLigne: string
  commentaire: string
  totalFacture: number | string | null
  lignes: LigneSaisie[]
}

// Erreur de saisie : message (même règle que le serveur) et champ à atteindre
export interface ErreurSaisie {
  message: string
  champ?: string
}

export const idChampLigne = (cle: number, champ: string) => `bon-ligne-${cle}-${champ}`

// Somme des lignes, arrondie comme le serveur (chaque montant au centime, puis la somme)
export const sommeLignes = (lignes: LigneSaisie[]): number =>
  arrondi2(lignes.reduce((s, l) => {
    const m = nombreSaisi(l.montantFcfa)
    return s + (Number.isNaN(m) ? 0 : arrondi2(m))
  }, 0))

// Contrôles du serveur, dans le même ordre ; la ligne budgétaire (qui doit exister) est vérifiée par le serveur seul
// figees : bon réceptionné, seul l'en-tête est contrôlé (les lignes et le total restent ceux du bon)
export function verifierSaisieBon(s: SaisieBon, uniteDuProduit: (id: string) => string | null, figees = false): ErreurSaisie | null {
  const achatDirect = s.typeCommande === 'Achat direct'
  if (achatDirect && !s.numeroFacture.trim()) return { message: 'Achat direct : indiquez le numéro de la facture.', champ: 'bon-facture' }
  if (!achatDirect && !s.numeroBon.trim()) return { message: 'Indiquez la référence du bon de commande signé.', champ: 'bon-numero' }
  if (s.dateFacture && !dateValide(s.dateFacture)) return { message: 'Date de la facture invalide (AAAA-MM-JJ).', champ: 'bon-date-facture' }
  if (achatDirect ? !dateValide(s.dateFacture) : !dateValide(s.dateEmission)) {
    return achatDirect
      ? { message: 'Indiquez la date de la facture (AAAA-MM-JJ).', champ: 'bon-date-facture' }
      : { message: 'Indiquez la date du bon de commande (AAAA-MM-JJ).', champ: 'bon-date' }
  }
  if (!s.fournisseurId) return { message: 'Choisissez le fournisseur (fiche Prestataires active).', champ: 'bon-fournisseur' }
  if (figees) return null
  if (!s.lignes.length) return { message: 'Ajoutez au moins une ligne de facture.' }
  if (s.lignes.length > MAX_LIGNES_BON) return { message: `${MAX_LIGNES_BON} lignes au plus par bon.` }

  for (const [i, l] of s.lignes.entries()) {
    const designation = l.designation.trim()
    if (!designation) return { message: `Ligne ${i + 1} : désignation obligatoire (telle qu'écrite sur la facture).`, champ: idChampLigne(l.cle, 'designation') }
    const nom = `Ligne ${i + 1} (« ${designation} »)`
    if (!(nombreSaisi(l.montantFcfa) >= 0)) return { message: `${nom} : montant invalide.`, champ: idChampLigne(l.cle, 'montant') }
    const unite = l.productId ? uniteDuProduit(l.productId) : null
    if (unite === null) return { message: `${nom} : choisissez le produit dans le catalogue.`, champ: idChampLigne(l.cle, 'produit') }
    if (!(nombreSaisi(l.quantite) > 0)) return { message: `${nom} : quantité invalide (supérieure à 0, en ${unite}).`, champ: idChampLigne(l.cle, 'quantite') }
  }

  const total = nombreSaisi(s.totalFacture)
  if (!(total >= 0)) return { message: 'Indiquez le total de la facture (FCFA), tel qu\'il est écrit sur la facture.', champ: 'bon-total' }
  const somme = sommeLignes(s.lignes)
  if (arrondi2(total) !== somme) {
    return { message: `Le total de la facture (${formatFcfa(total)}) ne correspond pas à la somme des lignes (${formatFcfa(somme)}).`, champ: 'bon-total' }
  }
  return null
}

// Corps envoyé au serveur (POST ou PUT /api/admin/bons-commande), format facture.
// figees : bon réceptionné, sans lignes ni total (le serveur garde ceux du bon)
export function corpsDuBon(s: SaisieBon, figees = false) {
  const achatDirect = s.typeCommande === 'Achat direct'
  const enTete = {
    typeCommande: s.typeCommande,
    numeroBon: achatDirect ? '' : s.numeroBon.trim(), // Achat direct : numéro donné par le serveur
    numeroFacture: s.numeroFacture.trim(),
    dateFacture: s.dateFacture,
    dateEmission: achatDirect ? s.dateFacture : s.dateEmission, // Une seule date pour un achat direct
    fournisseurId: s.fournisseurId,
    ligneBudgetaire: s.ligneBudgetaire.trim(),
    sousLigne: s.sousLigne.trim(),
    commentaire: s.commentaire.trim(),
  }
  if (figees) return enTete
  return {
    ...enTete,
    lignes: s.lignes.map(l => ({
      designation: l.designation.trim(),
      quantiteFacture: l.quantiteFacture.trim(),
      montantFcfa: nombreSaisi(l.montantFcfa),
      productId: l.productId,
      quantite: nombreSaisi(l.quantite),
      detailQuantite: l.detailQuantite.trim(),
    })),
    totalFacture: nombreSaisi(s.totalFacture),
  }
}
