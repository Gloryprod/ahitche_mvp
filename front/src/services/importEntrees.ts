// Import groupé des entrées de stock : réponse de POST /api/admin/stock/lots/import
export interface LigneImport {
  ligne: number
  statut: 'ok' | 'erreur' | 'avertissement'
  messages: string[]
  produit: string | null
  quantite: number | null // Vide : lot « à compter »
  prixAchat: number | null
  valeur: number | null
  numeroLot: string | null
}

export interface ReponseImport {
  message?: string
  lignes: LigneImport[]
  resume: { lignes: number; totalFcfa: number; lotsCrees: number }
}

// « Valider l'import » : seulement sur un aperçu sans erreur, obtenu avec le texte tel qu'il est maintenant
export function peutValiderImport(apercu: ReponseImport | null, texte: string, texteVerifie: string | null): boolean {
  if (!apercu || texteVerifie === null || texte !== texteVerifie) return false
  return apercu.lignes.length > 0 && apercu.lignes.every((l) => l.statut !== 'erreur')
}
