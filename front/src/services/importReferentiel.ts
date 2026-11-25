// Import du référentiel produits : réponse de POST /api/admin/products/referentiel/import
export interface LigneReferentiel {
  ligne: number // Numéro de ligne dans le texte collé (en-tête = 1)
  reference: string
  produit: string
  statut: 'creation' | 'modification' | 'inchange' | 'erreur'
  changements: string[]
  messages: string[] // Motifs d'erreur
}

export interface ReponseReferentiel {
  message: string
  resume: { lignes: number; creations: number; modifications: number; inchanges: number; erreurs: number }
  lignes: LigneReferentiel[]
}

// Ligne d'en-têtes copiée par « Copier le modèle »
export const MODELE_REFERENTIEL = 'reference;produit;type;unite;prix_unitaire_fcfa;quantite_essentiel;quantite_equilibre;quantite_confort;quantite_reserve;quantite_fraicheur;categorie;conversion'

// « Appliquer » : aperçu sans erreur, obtenu avec le texte tel qu'il est maintenant, et qui change au moins un produit
export function peutAppliquerReferentiel(apercu: ReponseReferentiel | null, texte: string, texteVerifie: string | null): boolean {
  if (!apercu || texteVerifie === null || texte !== texteVerifie) return false
  const { creations, modifications, erreurs } = apercu.resume
  return erreurs === 0 && apercu.lignes.every((l) => l.statut !== 'erreur') && creations + modifications > 0
}

export function lignesAffichees(lignes: LigneReferentiel[], masquerInchangees: boolean): LigneReferentiel[] {
  return masquerInchangees ? lignes.filter((l) => l.statut !== 'inchange') : lignes
}
