import { describe, expect, it } from 'vitest'
import { ENTREES_MENU, filtrerMenu } from '../menuAdmin'
import { ACCES } from '../roles'

const noms = (recherche: string) => filtrerMenu('admin', recherche).flatMap(g => g.entrees.map(e => e.nom))

describe('menu du back-office', () => {
  it('garde les groupes dans l’ordre prévu', () => {
    expect(filtrerMenu('admin').map(g => g.titre)).toEqual([
      'Aujourd’hui', 'Clients', 'Vitrine du site', 'Stock et achats', 'Gestion', 'Réglages',
    ])
  })

  it('donne une icône différente à chaque entrée et des adresses uniques', () => {
    expect(new Set(ENTREES_MENU.map(e => e.icone)).size).toBe(ENTREES_MENU.length)
    expect(new Set(ENTREES_MENU.map(e => e.chemin)).size).toBe(ENTREES_MENU.length)
  })

  it('trouve un outil par son nom ou ses mots-clés, sans tenir compte des accents', () => {
    expect(noms('prix')).toEqual(['Formules et prix', 'Produits (catalogue)'])
    expect(noms('livreur')).toEqual(['Logistique', 'Équipe et accès'])
    expect(noms('fournisseur')).toEqual(['Bons de commande', 'Prestataires'])
    expect(noms('photo')).toEqual(['Compléments de la semaine', 'Fiches produits'])
    expect(noms('equipe')).toEqual(['Équipe et accès'])
    expect(noms('xyz')).toEqual([])
  })

  it('n’affiche que les sections que le rôle peut lire', () => {
    for (const groupe of filtrerMenu('gestionnaire')) {
      for (const entree of groupe.entrees) expect(ACCES[entree.section].lecture).toContain('gestionnaire')
    }
    expect(filtrerMenu('gestionnaire').flatMap(g => g.entrees.map(e => e.id))).not.toContain('finances')
    expect(filtrerMenu(undefined)).toEqual([])
  })
})
