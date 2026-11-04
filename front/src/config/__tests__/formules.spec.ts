import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import {
  FORMULES, FORMULES_DU_CODE, PRIX_D_APPEL, PRIX_D_APPEL_DU_CODE, TEXTES_FORMULES_DU_CODE, appliquerFormules, composerFormules,
} from '../formules'
import { fusionnerTextesFormules, lirePrix } from '@/services/valeursSite'
import { donneesCommerce } from '@/services/referencement'
import { champDeLErreur, controlerFormules, formulesAEnvoyer } from '@/components/admin/site/champsSite'
import FormuleCard from '@/components/ui/FormuleCard.vue'
import HeroSection from '@/components/sections/HeroSection.vue'

const SLUGS = ['ahi-essentiel', 'ahi-equilibre', 'ahi-confort']
const recommandees = () => FORMULES.filter(f => f.recommandee).map(f => f.slug)

// Textes publiés valides (copie de ceux du code, à modifier dans chaque test)
const publies = () => structuredClone(TEXTES_FORMULES_DU_CODE)

afterEach(() => appliquerFormules(null, null)) // Retour aux valeurs du code

describe('textes des formules publiés', () => {
  it('reprend les valeurs du code tant que rien n’est publié', () => {
    expect(composerFormules(null, null)).toEqual(FORMULES_DU_CODE.map(f => ({ ...f, recommandee: !!f.recommandee })))
    expect(recommandees()).toEqual(['ahi-equilibre'])
  })

  it('remplace champ par champ et garde le code pour un champ mal formé ou une formule absente', () => {
    const recu: Record<string, unknown> = publies()
    recu['ahi-essentiel'] = { ...publies()['ahi-essentiel'], accroche: 'Votre mois organisé.', repas: 'beaucoup', heures: 42 }
    recu['ahi-equilibre'] = { ...publies()['ahi-equilibre'], cible: 'x'.repeat(61) }
    delete recu['ahi-confort']
    const v = fusionnerTextesFormules(TEXTES_FORMULES_DU_CODE, recu)
    expect(v['ahi-essentiel']).toMatchObject({ accroche: 'Votre mois organisé.', repas: '20–30', heures: '2–4h' })
    expect(v['ahi-equilibre']!.cible).toBe(TEXTES_FORMULES_DU_CODE['ahi-equilibre']!.cible)
    expect(v['ahi-confort']).toEqual(TEXTES_FORMULES_DU_CODE['ahi-confort'])
  })

  it('suit la formule recommandée publiée, ou aucune', () => {
    const confort = publies()
    confort['ahi-equilibre']!.recommandee = false
    confort['ahi-confort']!.recommandee = true
    appliquerFormules(confort, null)
    expect(recommandees()).toEqual(['ahi-confort'])

    const aucune = publies()
    aucune['ahi-equilibre']!.recommandee = false
    appliquerFormules(aucune, null)
    expect(recommandees()).toEqual([])
  })

  it('garde la recommandée du code si plusieurs sont publiées ou si une formule n’a pas de booléen', () => {
    const deux = publies()
    deux['ahi-confort']!.recommandee = true
    appliquerFormules(deux, null)
    expect(recommandees()).toEqual(['ahi-equilibre'])

    const incomplet: Record<string, unknown> = publies()
    incomplet['ahi-essentiel'] = { ...publies()['ahi-essentiel'], recommandee: 'oui' }
    appliquerFormules(incomplet, null)
    expect(recommandees()).toEqual(['ahi-equilibre'])
  })

  it('garde les foyers du code si deux formules visent la même taille', () => {
    const doublon = publies()
    doublon['ahi-confort']!.foyer = '2-3'
    expect(SLUGS.map(s => fusionnerTextesFormules(TEXTES_FORMULES_DU_CODE, doublon)[s]!.foyer)).toEqual(['1', '2-3', '4-6'])
    const echange = publies()
    echange['ahi-essentiel']!.foyer = '2-3'
    echange['ahi-equilibre']!.foyer = '1'
    expect(SLUGS.map(s => fusionnerTextesFormules(TEXTES_FORMULES_DU_CODE, echange)[s]!.foyer)).toEqual(['2-3', '1', '4-6'])
  })
})

describe('prix de vente de la base', () => {
  it('n’accepte qu’un nombre entier positif ; sinon le prix du code reste', () => {
    expect(lirePrix(SLUGS, { 'ahi-essentiel': 12000, 'ahi-equilibre': null, 'ahi-confort': '50300' }))
      .toEqual({ 'ahi-essentiel': 12000, 'ahi-equilibre': null, 'ahi-confort': null })
    expect(lirePrix(SLUGS, { 'ahi-essentiel': 0, 'ahi-equilibre': -5, 'ahi-confort': 10.5 }))
      .toEqual({ 'ahi-essentiel': null, 'ahi-equilibre': null, 'ahi-confort': null })
    expect(lirePrix(SLUGS, undefined)).toEqual({ 'ahi-essentiel': null, 'ahi-equilibre': null, 'ahi-confort': null })
  })

  it('met à jour les cartes, le prix d’appel et les offres pour Google', () => {
    appliquerFormules(null, { 'ahi-essentiel': 12000, 'ahi-equilibre': 25000, 'ahi-confort': null })
    expect(FORMULES.map(f => f.prix)).toEqual([12000, 25000, 50300])
    expect(PRIX_D_APPEL.value).toBe(12000)
    expect(PRIX_D_APPEL_DU_CODE).toBe(10800)
    const offres = donneesCommerce().hasOfferCatalog.itemListElement
    expect(offres.map(o => o.price)).toEqual([12000, 25000, 50300])
    appliquerFormules(null, null)
    expect(PRIX_D_APPEL.value).toBe(10800)
  })

  it('met le prix publié dans le message WhatsApp de la carte', () => {
    appliquerFormules(null, { 'ahi-essentiel': 12000 })
    const carte = mount(FormuleCard, { props: { formule: FORMULES[0]! } })
    const lien = decodeURIComponent(carte.get('a').attributes('href')!)
    expect(lien).toContain('la formule AHI ESSENTIEL (12 000 FCFA)')
    expect(carte.text()).toContain('12 000')
  })
})

describe('prix d’appel du haut de l’accueil', () => {
  const monter = async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
    await router.push('/')
    return mount(HeroSection, { global: { plugins: [router] } })
  }

  it('affiche le prix du code, puis le plus petit prix publié sans changer de case', async () => {
    const hero = await monter()
    const prix = () => hero.findAll('strong span').map(s => s.text())
    expect(prix()).toEqual(['10 800 FCFA', '10 800 FCFA'])
    appliquerFormules(null, { 'ahi-essentiel': 9500, 'ahi-equilibre': 22500, 'ahi-confort': 50300 })
    await hero.vm.$nextTick()
    // Le prix du code, invisible, garde la largeur ; le prix affiché est celui de la base
    expect(prix()).toEqual(['10 800 FCFA', '9 500 FCFA'])
    expect(hero.findAll('strong span')[0]!.classes()).toContain('invisible')
    expect(hero.find('strong').classes()).toEqual(expect.arrayContaining(['inline-grid', 'tabular-nums']))
  })
})

describe('onglet Formules de l’admin', () => {
  it('refuse deux formules sur la même taille de foyer, sous le champ concerné', () => {
    const f = publies()
    f['ahi-confort']!.foyer = '1'
    expect(controlerFormules(formulesAEnvoyer(f))).toEqual({
      champ: 'ahi-confort.foyer',
      message: 'Taille de foyer : déjà choisie pour AHI ESSENTIEL. Une formule différente pour chaque taille (1, 2-3, 4-6).',
    })
  })

  it('contrôle les textes avec les messages du serveur', () => {
    const f = publies()
    f['ahi-equilibre']!.repas = '--'
    expect(controlerFormules(formulesAEnvoyer(f))).toEqual({ champ: 'ahi-equilibre.repas', message: 'Équilibré : repas, chiffres et tiret seulement (ex. 20–30).' })
    f['ahi-equilibre']!.repas = '35–50'
    f['ahi-essentiel']!.accroche = '   '
    expect(controlerFormules(formulesAEnvoyer(f))?.champ).toBe('ahi-essentiel.accroche')
    expect(controlerFormules(formulesAEnvoyer(publies()))).toBeNull()
  })

  it('place l’erreur du serveur sous le bon champ', () => {
    expect(champDeLErreur('formules', 'Confort : accroche : 120 caractères au plus.')).toBe('ahi-confort.accroche')
    expect(champDeLErreur('formules', 'Essentiel : heures, chiffres, tiret et « h » seulement (ex. 2–4h).')).toBe('ahi-essentiel.heures')
    expect(champDeLErreur('formules', 'Équilibré : taille de foyer, 1, 2-3 ou 4-6.')).toBe('ahi-equilibre.foyer')
    expect(champDeLErreur('formules', 'Formule recommandée : une seule au plus.')).toBe('recommandee')
    expect(champDeLErreur('formules', 'Taille de foyer : une formule différente pour chaque taille (1, 2-3, 4-6).')).toBe('')
  })
})
