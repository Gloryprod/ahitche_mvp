import { describe, expect, it } from 'vitest'
import { TYPE_PACK, estOuvert, identifiantDepuisNom, libelleCourt, nomPack, type Pack } from '../packs'
import { modeleReferentiel } from '../importReferentiel'

const pack = (type: string, statut: Pack['statut'], bientotDisponible: boolean): Pack => ({
  type, slug: `ahi-${type}`, nom: `AHI ${type}`, statut, bientotDisponible, ordre: null,
})

describe('identifiant proposé à partir du nom', () => {
  it('retire le préfixe AHI, les accents, les espaces et les signes', () => {
    expect(identifiantDepuisNom('AHI Étudiant')).toBe('etudiant')
    expect(identifiantDepuisNom('AHI Fraîcheur')).toBe('fraicheur')
    expect(identifiantDepuisNom('ahi  Petit foyer !')).toBe('petitfoyer')
    expect(identifiantDepuisNom('Famille XL')).toBe('famillexl')
  })
  it('commence par une lettre et tient en 20 caractères', () => {
    expect(identifiantDepuisNom('AHI 2 personnes')).toBe('personnes')
    expect(identifiantDepuisNom('AHI Un nom vraiment beaucoup trop long')).toHaveLength(20)
  })
  it('donne un identifiant accepté par le serveur, ou vide', () => {
    for (const nom of ['AHI Étudiant', 'AHI Équilibré plus', 'Pack 2026']) expect(TYPE_PACK.test(identifiantDepuisNom(nom))).toBe(true)
    expect(identifiantDepuisNom('AHI 123')).toBe('')
  })
})

describe('règle de l’identifiant (même que le serveur)', () => {
  it('accepte minuscules et chiffres, 2 à 20 caractères, une lettre en tête', () => {
    expect(TYPE_PACK.test('etudiant')).toBe(true)
    expect(TYPE_PACK.test('pack2')).toBe(true)
  })
  it('refuse majuscules, accents, espaces, tirets, chiffre en tête et longueurs hors bornes', () => {
    for (const t of ['Etudiant', 'étudiant', 'petit foyer', 'petit-foyer', '2pack', 'a', 'a'.repeat(21)]) expect(TYPE_PACK.test(t)).toBe(false)
  })
})

describe('packs ouverts', () => {
  it('actifs et pas bientôt disponibles', () => {
    const packs = [pack('essentiel', 'actif', false), pack('reserve', 'actif', true), pack('ancien', 'inactif', false), pack('etudiant', 'actif', false)]
    expect(packs.filter(estOuvert).map(p => p.type)).toEqual(['essentiel', 'etudiant'])
  })
})

describe('libellés et modèle du référentiel', () => {
  it('noms du référentiel en capitales affichés comme avant, nom saisi gardé', () => {
    expect(['AHI ESSENTIEL', 'AHI ÉQUILIBRÉ', 'AHI CONFORT', 'AHI RÉSERVE', 'AHI FRAÎCHEUR'].map(nomPack)).toEqual(
      ['AHI Essentiel', 'AHI Équilibré', 'AHI Confort', 'AHI Réserve', 'AHI Fraîcheur'],
    )
    expect(nomPack('AHI Étudiant')).toBe('AHI Étudiant')
    expect(nomPack('AHI grande Famille')).toBe('AHI grande Famille')
  })
  it('libellé court sans « AHI »', () => {
    expect(libelleCourt('AHI Équilibré')).toBe('Équilibré')
    expect(libelleCourt('Étudiant')).toBe('Étudiant')
  })
  it('une colonne quantite_<type> par pack, dans l’ordre des packs', () => {
    expect(modeleReferentiel(['essentiel', 'equilibre', 'confort', 'reserve', 'fraicheur'])).toBe(
      'reference;produit;type;unite;prix_unitaire_fcfa;quantite_essentiel;quantite_equilibre;quantite_confort;quantite_reserve;quantite_fraicheur;categorie;conversion',
    )
    expect(modeleReferentiel(['essentiel', 'etudiant'])).toContain(';quantite_essentiel;quantite_etudiant;categorie;')
  })
})
