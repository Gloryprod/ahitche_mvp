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
    expect(noms('prix')).toEqual(['Site public', 'Formules et prix', 'Produits (catalogue)'])
    expect(noms('livreur')).toEqual(['Logistique', 'Équipe et accès'])
    expect(noms('fournisseur')).toEqual(['Bons de commande', 'Prestataires'])
    expect(noms('photo')).toEqual(['Compléments de la semaine', 'Fiches produits'])
    expect(noms('equipe')).toEqual(['Équipe et accès'])
    expect(noms('xyz')).toEqual([])
  })

  it('met « Site public » en tête de la vitrine, lisible par l’admin et le coordinateur seulement', () => {
    expect(filtrerMenu('admin').find(g => g.id === 'vitrine')?.entrees[0]?.nom).toBe('Site public')
    expect(noms('bandeau')).toEqual(['Site public'])
    expect(noms('horaires')).toEqual(['Site public'])
    expect(noms('tiktok')).toEqual(['Site public'])
    expect(noms('accroche')).toEqual(['Site public'])
    expect(noms('faq')).toEqual(['Site public'])
    expect(noms('questions')).toEqual(['Site public'])
    expect(noms('actualités')).toEqual(['Site public'])
    expect(noms('actualité')).toEqual(['Site public', 'Articles du blog'])
    expect(noms('formules')).toEqual(['Site public', 'Formules et prix'])
    expect(noms('whatsapp')).toEqual(['Commandes', 'Site public'])
    const ids = (role: Parameters<typeof filtrerMenu>[0]) => filtrerMenu(role).flatMap(g => g.entrees.map(e => e.id))
    expect(ids('coordinateur')).toContain('site')
    expect(ids('gestionnaire')).not.toContain('site')
  })

  it('n’affiche que les sections que le rôle peut lire', () => {
    for (const groupe of filtrerMenu('gestionnaire')) {
      for (const entree of groupe.entrees) expect(ACCES[entree.section].lecture).toContain('gestionnaire')
    }
    expect(filtrerMenu('gestionnaire').flatMap(g => g.entrees.map(e => e.id))).not.toContain('finances')
    expect(filtrerMenu(undefined)).toEqual([])
  })
})
