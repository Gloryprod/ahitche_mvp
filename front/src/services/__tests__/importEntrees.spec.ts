import { describe, expect, it } from 'vitest'
import { peutValiderImport, type LigneImport, type ReponseImport } from '../importEntrees'

const ligne = (statut: LigneImport['statut']): LigneImport => ({
  ligne: 2, statut, messages: [], produit: 'P03', quantite: 80, prixAchat: 1200, valeur: 96000, numeroLot: 'LOT-P03-20261110-01',
})
const apercu = (...statuts: LigneImport['statut'][]): ReponseImport => ({
  lignes: statuts.map(ligne), resume: { lignes: statuts.length, totalFcfa: 96000, lotsCrees: statuts.length },
})

describe("bouton « Valider l'import »", () => {
  it('actif sur un aperçu sans erreur, avec le texte vérifié', () => {
    expect(peutValiderImport(apercu('ok', 'avertissement'), 'a;b', 'a;b')).toBe(true)
  })
  it('désactivé tant qu’une ligne est en erreur', () => {
    expect(peutValiderImport(apercu('ok', 'erreur'), 'a;b', 'a;b')).toBe(false)
  })
  it('désactivé si le texte a changé depuis la vérification', () => {
    expect(peutValiderImport(apercu('ok'), 'a;b;c', 'a;b')).toBe(false)
  })
  it('désactivé sans vérification ou sans ligne', () => {
    expect(peutValiderImport(null, 'a;b', null)).toBe(false)
    expect(peutValiderImport(apercu(), 'a;b', 'a;b')).toBe(false)
  })
})
