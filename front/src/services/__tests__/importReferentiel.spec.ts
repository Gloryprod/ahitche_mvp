import { describe, expect, it } from 'vitest'
import { lignesAffichees, peutAppliquerReferentiel, type LigneReferentiel, type ReponseReferentiel } from '../importReferentiel'

const ligne = (statut: LigneReferentiel['statut'], numero = 2): LigneReferentiel => ({
  ligne: numero, reference: 'X01', produit: 'Produit test', statut, changements: [], messages: [],
})
const apercu = (...statuts: LigneReferentiel['statut'][]): ReponseReferentiel => {
  const compte = (s: LigneReferentiel['statut']) => statuts.filter((x) => x === s).length
  return {
    message: '',
    lignes: statuts.map((s, i) => ligne(s, i + 2)),
    resume: { lignes: statuts.length, creations: compte('creation'), modifications: compte('modification'), inchanges: compte('inchange'), erreurs: compte('erreur') },
  }
}

describe('bouton « Appliquer » du référentiel', () => {
  it('actif sans erreur, avec une création ou une modification, sur le texte vérifié', () => {
    expect(peutAppliquerReferentiel(apercu('creation', 'inchange'), 'a;b', 'a;b')).toBe(true)
    expect(peutAppliquerReferentiel(apercu('modification'), 'a;b', 'a;b')).toBe(true)
  })
  it('désactivé tant qu’une ligne est en erreur', () => {
    expect(peutAppliquerReferentiel(apercu('creation', 'erreur'), 'a;b', 'a;b')).toBe(false)
  })
  it('désactivé si rien ne change', () => {
    expect(peutAppliquerReferentiel(apercu('inchange', 'inchange'), 'a;b', 'a;b')).toBe(false)
  })
  it('désactivé si le texte a changé depuis la vérification, ou sans vérification', () => {
    expect(peutAppliquerReferentiel(apercu('creation'), 'a;b;c', 'a;b')).toBe(false)
    expect(peutAppliquerReferentiel(null, 'a;b', null)).toBe(false)
  })
})

describe('lignes affichées dans l’aperçu', () => {
  const lignes = apercu('creation', 'inchange', 'erreur', 'inchange').lignes
  it('masque les lignes inchangées sur demande', () => {
    expect(lignesAffichees(lignes, true).map((l) => l.statut)).toEqual(['creation', 'erreur'])
  })
  it('montre tout sinon', () => {
    expect(lignesAffichees(lignes, false)).toHaveLength(4)
  })
})
