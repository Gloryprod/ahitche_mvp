import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import {
  FORMULES, FORMULES_DU_CODE, PRIX_D_APPEL, PRIX_D_APPEL_DU_CODE, TEXTES_FORMULES_DU_CODE, appliquerFormules, composerFormules,
} from '../formules'
import { fusionnerTextesFormules, lirePrix, type TexteFormule } from '@/services/valeursSite'
import { donneesCommerce } from '@/services/referencement'
import type { Pack } from '@/services/packs'
import {
  PACKS_DU_CODE, champDeLErreur, champsFormules, changements, controlerFormules, formulesAEnvoyer, formulesEnFormulaire, formulesPubliees,
} from '@/components/admin/site/champsSite'
import FormuleCard from '@/components/ui/FormuleCard.vue'
import HeroSection from '@/components/sections/HeroSection.vue'
import NosFormules from '@/components/sections/NosFormules.vue'

// Valeurs estimées (prix barrés) de la section des formules : aucune dans ces tests
vi.mock('@/stores/api', () => ({ default: { get: async () => ({ data: {} }) } }))

const SLUGS = ['ahi-essentiel', 'ahi-equilibre', 'ahi-confort']
const recommandees = () => FORMULES.filter(f => f.recommandee).map(f => f.slug)

// Textes publiés valides (copie de ceux du code, à modifier dans chaque test)
const publies = () => structuredClone(TEXTES_FORMULES_DU_CODE)

// Carte d'un pack créé dans l'admin (pack fictif)
const nouvelle = (reglages: Partial<Record<keyof TexteFormule, unknown>> = {}) => ({
  afficher: true, ordre: 3, emoji: '🎒', couleur: '#7A3E9D', niveau: 1, cible: 'Petit foyer · par mois',
  accroche: 'Une carte de démonstration.', repas: '10–15', heures: '1–2h', foyer: '', recommandee: false, ...reglages,
})
const PRIX = { 'ahi-essentiel': 10800, 'ahi-equilibre': 22500, 'ahi-confort': 50300, 'ahi-decouverte': 15000 }
const NOMS: Record<string, string> = {
  'ahi-essentiel': 'AHI ESSENTIEL', 'ahi-equilibre': 'AHI ÉQUILIBRÉ', 'ahi-confort': 'AHI CONFORT', 'ahi-decouverte': 'AHI Découverte',
}
const nomsSans = (slug: string) => Object.fromEntries(Object.entries(NOMS).filter(([s]) => s !== slug))
const slugs = (cartes: { slug: string }[]) => cartes.map(f => f.slug)
const PACKS: Pack[] = [
  ...PACKS_DU_CODE, { type: 'decouverte', slug: 'ahi-decouverte', nom: 'AHI Découverte', statut: 'actif', bientotDisponible: false, ordre: null },
]

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

describe('cartes réglables pour chaque pack', () => {
  it('ajoute la carte publiée d’un autre pack, avec son nom en base et son prix', () => {
    const cartes = composerFormules({ ...publies(), 'ahi-decouverte': nouvelle() }, PRIX, NOMS)
    expect(slugs(cartes)).toEqual([...SLUGS, 'ahi-decouverte'])
    expect(cartes[3]).toMatchObject({ nom: 'AHI DÉCOUVERTE', prix: 15000, couleur: '#7A3E9D', emoji: '🎒', foyer: '' })
  })

  it('ne montre pas une nouvelle carte sans nom, sans prix, sans ses textes ou sans « afficher »', () => {
    expect(slugs(composerFormules({ 'ahi-decouverte': nouvelle() }, PRIX, undefined))).toEqual(SLUGS)
    expect(slugs(composerFormules({ 'ahi-decouverte': nouvelle() }, { ...PRIX, 'ahi-decouverte': null }, NOMS))).toEqual(SLUGS)
    expect(slugs(composerFormules({ 'ahi-decouverte': nouvelle({ repas: '' }) }, PRIX, NOMS))).toEqual(SLUGS)
    expect(slugs(composerFormules({ 'ahi-decouverte': nouvelle({ afficher: undefined }) }, PRIX, NOMS))).toEqual(SLUGS)
  })

  it('retire une carte masquée, ou dont le pack manque aux noms du serveur (pack inactif)', () => {
    const p = publies()
    p['ahi-confort']!.afficher = false
    expect(slugs(composerFormules(p, PRIX, NOMS))).toEqual(['ahi-essentiel', 'ahi-equilibre'])
    expect(slugs(composerFormules(publies(), PRIX, nomsSans('ahi-equilibre')))).toEqual(['ahi-essentiel', 'ahi-confort'])
  })

  it('range les cartes dans l’ordre publié', () => {
    const p: Record<string, unknown> = publies()
    Object.assign(p['ahi-confort']!, { ordre: 0 })
    Object.assign(p['ahi-equilibre']!, { ordre: 2 })
    Object.assign(p['ahi-essentiel']!, { ordre: 3 })
    p['ahi-decouverte'] = nouvelle({ ordre: 1 })
    expect(slugs(composerFormules(p, PRIX, NOMS))).toEqual(['ahi-confort', 'ahi-decouverte', 'ahi-equilibre', 'ahi-essentiel'])
  })

  it('lit une ancienne publication (textes seulement) avec les réglages du code', () => {
    const ancienne = Object.fromEntries(SLUGS.map(s => {
      const { accroche, repas, heures, foyer, recommandee } = TEXTES_FORMULES_DU_CODE[s]!
      return [s, { cible: 'Ancienne cible', accroche, repas, heures, foyer, recommandee }]
    }))
    const cartes = composerFormules(ancienne, PRIX, NOMS)
    expect(cartes.map(f => [f.slug, f.nom, f.couleur, f.emoji, f.niveau]))
      .toEqual(FORMULES_DU_CODE.map(f => [f.slug, f.nom, f.couleur, f.emoji, f.niveau]))
    expect(cartes.every(f => f.cible === 'Ancienne cible')).toBe(true)
  })

  it('garde les réglages du code pour une couleur, un emoji, un niveau ou un ordre mal formés', () => {
    const p: Record<string, unknown> = publies()
    p['ahi-essentiel'] = { ...publies()['ahi-essentiel'], couleur: '#12345', emoji: 'x'.repeat(9), niveau: 4, ordre: 120 }
    expect(composerFormules(p, PRIX, NOMS)[0]).toMatchObject({ couleur: 'savane', emoji: '🌿', niveau: 1, ordre: 0 })
  })

  it('ne compte que les cartes affichées pour la recommandée et les foyers', () => {
    const masquee = { ...publies(), 'ahi-decouverte': nouvelle({ afficher: false, foyer: '2-3', recommandee: true }) }
    const v = fusionnerTextesFormules(TEXTES_FORMULES_DU_CODE, masquee)
    expect(v['ahi-equilibre']).toMatchObject({ recommandee: true, foyer: '2-3' })
    expect(v['ahi-decouverte']).toMatchObject({ recommandee: true, foyer: '2-3' })
    // Affichée, elle crée deux conflits : recommandée et foyers du code reviennent, la nouvelle carte n'a plus de foyer
    const affichee = fusionnerTextesFormules(TEXTES_FORMULES_DU_CODE, { ...masquee, 'ahi-decouverte': nouvelle({ foyer: '2-3', recommandee: true }) })
    expect(affichee['ahi-equilibre']).toMatchObject({ recommandee: true, foyer: '2-3' })
    expect(affichee['ahi-decouverte']).toMatchObject({ recommandee: false, foyer: '' })
  })

  it('garde les cartes du code si aucune carte ne reste affichée', () => {
    const p = publies()
    for (const s of SLUGS) p[s]!.afficher = false
    expect(slugs(composerFormules(p, PRIX, NOMS))).toEqual(SLUGS)
  })

  it('ajoute et retire des cartes du site ; une carte qui reste garde son objet', () => {
    const equilibre = FORMULES[1]
    appliquerFormules({ ...publies(), 'ahi-decouverte': nouvelle() }, PRIX, NOMS)
    expect(slugs(FORMULES)).toEqual([...SLUGS, 'ahi-decouverte'])
    expect(FORMULES[1]).toBe(equilibre)
    const p = publies()
    p['ahi-essentiel']!.afficher = false
    appliquerFormules(p, PRIX, NOMS)
    expect(slugs(FORMULES)).toEqual(['ahi-equilibre', 'ahi-confort'])
    expect(FORMULES[0]).toBe(equilibre)
    expect(PRIX_D_APPEL.value).toBe(22500)
    expect(PRIX_D_APPEL_DU_CODE).toBe(10800)
    expect(donneesCommerce().hasOfferCatalog.itemListElement.map(o => o.name)).toEqual(['AHI ÉQUILIBRÉ', 'AHI CONFORT'])
  })
})

describe('comparateur « taille du foyer »', () => {
  it('ne conseille jamais une carte sans foyer ; une taille sans carte ne met rien en avant', async () => {
    const p: Record<string, unknown> = publies()
    Object.assign(p['ahi-essentiel']!, { foyer: '' })
    p['ahi-decouverte'] = nouvelle()
    appliquerFormules(p, PRIX, NOMS)
    const section = mount(NosFormules, { global: { stubs: { ProduitsDeBase: true } } })
    expect(section.findAll('[role="listitem"]')).toHaveLength(4)
    await section.get('input[value="1"]').setValue()
    expect(section.text()).toContain('Pour 1 personne, comparez les formules ci-dessous.')
    expect(section.findAll('.carte-conseillee')).toHaveLength(0)
    await section.get('input[value="2-3"]').setValue()
    expect(section.text()).toContain('nous conseillons AHI ÉQUILIBRÉ')
    expect(section.findAll('.carte-conseillee')).toHaveLength(1)
  })
})

describe('carte à couleur libre', () => {
  const carte = (couleur: string) => mount(FormuleCard, { props: { formule: { ...FORMULES_DU_CODE[0]!, couleur: couleur as `#${string}` } } })

  it('foncée : bandeau de cette couleur, titre et cible en blanc, chiffres de cette couleur', () => {
    const c = carte('#4B1D6B')
    expect(c.get('.bandeau').attributes('style')).toContain('background-color')
    expect(c.get('h3').classes()).toContain('text-white')
    expect(c.get('h3 + p').classes()).toContain('text-white')
    expect(c.get('.text-3xl').attributes('style')).toContain('color')
  })

  it('claire : titre en noir et chiffres en noir de la charte (trop clairs sur le blanc de la carte)', () => {
    const c = carte('#F7E27A')
    expect(c.get('h3').classes()).toContain('text-noir')
    expect(c.get('.text-3xl').classes()).toContain('text-noir')
    expect(c.get('.text-3xl').attributes('style')).toBeUndefined()
  })

  it('laisse les trois thèmes tels quels', () => {
    const c = carte('foret')
    expect(c.get('.bandeau').classes()).toContain('bg-foret')
    expect(c.get('.bandeau').attributes('style')).toBeUndefined()
    expect(c.get('h3').classes()).toContain('text-white')
  })
})

describe('onglet Formules de l’admin : une carte par pack', () => {
  const formulaire = () => formulesEnFormulaire(formulesPubliees(undefined, PACKS))
  const textesComplets = { cible: 'Petit foyer', accroche: 'Une carte.', repas: '10–15', heures: '1–2h' }

  it('propose un pack créé masqué, avec les réglages de départ', () => {
    const f = formulaire()
    expect(Object.keys(f)).toEqual([...SLUGS, 'ahi-decouverte'])
    expect(f['ahi-decouverte']).toMatchObject({ afficher: false, ordre: 3, emoji: '🌾', couleur: 'savane', niveau: 1, cible: '', repas: '', heures: '', foyer: '' })
    expect(f['ahi-confort']).toMatchObject({ afficher: true, couleur: 'marine', emoji: '👑', niveau: 3 })
  })

  it('envoie toutes les cartes, sauf celle d’un pack créé, masquée et encore sans texte', () => {
    const f = formulaire()
    expect(Object.keys(formulesAEnvoyer(f))).toEqual(SLUGS)
    f['ahi-decouverte']!.cible = 'Petit foyer'
    const envoi = formulesAEnvoyer(f)
    expect(Object.keys(envoi)).toEqual([...SLUGS, 'ahi-decouverte'])
    expect(controlerFormules(envoi, PACKS)).toEqual({
      champ: 'ahi-decouverte.accroche',
      message: 'Découverte : accroche : obligatoire. Carte masquée : remplissez ses quatre textes, ou videz-les tous.',
    })
  })

  it('numérote les cartes envoyées, met une couleur libre en capitales et retire la recommandée masquée', () => {
    const f = formulaire()
    f['ahi-equilibre']!.afficher = false
    f['ahi-essentiel']!.couleur = '#7a3e9d'
    const envoi = formulesAEnvoyer(f)
    expect(envoi['ahi-equilibre']!.recommandee).toBe(false)
    expect(envoi['ahi-essentiel']!.couleur).toBe('#7A3E9D')
    expect(Object.values(envoi).map(t => t.ordre)).toEqual([0, 1, 2])
  })

  it('contrôle les foyers des cartes affichées seulement, et exige une carte affichée', () => {
    const f = formulaire()
    Object.assign(f['ahi-decouverte']!, textesComplets, { foyer: '1' })
    expect(controlerFormules(formulesAEnvoyer(f), PACKS)).toBeNull() // Masquée : son foyer ne compte pas
    f['ahi-decouverte']!.afficher = true
    expect(controlerFormules(formulesAEnvoyer(f), PACKS)).toEqual({
      champ: 'ahi-decouverte.foyer',
      message: 'Taille de foyer : déjà choisie pour AHI ESSENTIEL. Une formule différente pour chaque taille (1, 2-3, 4-6).',
    })
    f['ahi-decouverte']!.foyer = ''
    expect(controlerFormules(formulesAEnvoyer(f), PACKS)).toBeNull()
    f['ahi-decouverte']!.emoji = ' '
    expect(controlerFormules(formulesAEnvoyer(f), PACKS)?.champ).toBe('ahi-decouverte.emoji')
    f['ahi-decouverte']!.emoji = '🎒'
    for (const t of Object.values(f)) t.afficher = false
    expect(controlerFormules(formulesAEnvoyer(f), PACKS)).toEqual({ champ: '', message: 'Cartes de l\'accueil : affichez au moins une carte d\'un pack actif.' })
  })

  it('liste ce qui change sur l’accueil : carte affichée, place, couleur', () => {
    const avant = formulesPubliees(undefined, PACKS)
    const f = formulesEnFormulaire(avant)
    Object.assign(f['ahi-decouverte']!, textesComplets, { afficher: true, couleur: '#7A3E9D' })
    const liste = changements(champsFormules(PACKS), avant, formulesAEnvoyer(f))
    expect(liste.find(c => c.libelle === 'Découverte : afficher')).toMatchObject({ avant: 'non', apres: 'oui' })
    expect(liste.find(c => c.libelle === 'Découverte : ordre')).toMatchObject({ avant: 'masquée', apres: '4e place' })
    expect(liste.find(c => c.libelle === 'Découverte : couleur')).toMatchObject({ avant: 'Savane clair', apres: 'couleur libre #7A3E9D' })
    expect(changements(champsFormules(PACKS), avant, formulesAEnvoyer(formulesEnFormulaire(avant)))).toEqual([])
  })

  it('place les erreurs du serveur d’une carte créée sous le bon champ', () => {
    expect(champDeLErreur('formules', 'AHI DÉCOUVERTE : emoji : 8 caractères au plus.', [], PACKS)).toBe('ahi-decouverte.emoji')
    expect(champDeLErreur('formules', 'AHI Découverte : niveau de confort, 1, 2 ou 3.', [], PACKS)).toBe('ahi-decouverte.niveau')
    expect(champDeLErreur('formules', 'Essentiel : couleur, savane, foret, marine ou un code #RRGGBB (ex. #1C2E4A).', [], PACKS)).toBe('ahi-essentiel.couleur')
    expect(champDeLErreur('formules', 'Cartes de l\'accueil : au moins une carte doit être affichée (pack actif).', [], PACKS)).toBe('')
  })
})
