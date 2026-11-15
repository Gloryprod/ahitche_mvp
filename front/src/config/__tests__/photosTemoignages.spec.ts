import { afterEach, describe, expect, it, vi } from 'vitest'
import { watch } from 'vue'
import { PHOTOS, PHOTOS_FRISE, TITRES_FRISE, appliquerPhotos, composerFrise } from '../photos'
import { TEMOIGNAGES, TEMOIGNAGES_PAR_DEFAUT, appliquerTemoignages } from '../temoignages'
import { adresseCloudinary, lireRatio, sourcesPhoto, srcsetCloudinary } from '@/services/images'
import {
  EMPLACEMENTS_FRISE, fusionnerPhotos, fusionnerTemoignages, jourCotonou, photoDuCode, urlPhotoValide,
  type PhotosSite, type TemoignageSite,
} from '@/services/valeursSite'
import {
  champDeLErreur, controlerPhotos, controlerTemoignages, ecartsPhotos, ecartsTemoignages, photosAEnvoyer, temoignagesAEnvoyer,
} from '@/components/admin/site/champsSite'

const URL = 'https://res.cloudinary.com/ahitche/image/upload/v1731400000/site/abc123.webp'
const photo = (n: string, autre = {}) => ({
  url: `https://res.cloudinary.com/ahitche/image/upload/v1731400000/site/${n}.jpg`, publicId: `site/${n}`,
  alt: 'Une productrice dans son champ de maïs', droits: true, ...autre,
})
const toutesDuCode = (): PhotosSite => Object.fromEntries(EMPLACEMENTS_FRISE.map(c => [c, photoDuCode()])) as PhotosSite

afterEach(() => {
  appliquerPhotos(null)
  appliquerTemoignages(null)
})

describe('adresses Cloudinary de la frise', () => {
  it('ajoute f_auto,q_auto,c_fill et la taille au rapport de l’emplacement', () => {
    expect(adresseCloudinary(URL, 400, '4 / 3')).toBe('https://res.cloudinary.com/ahitche/image/upload/f_auto,q_auto,c_fill,w_400,h_300/v1731400000/site/abc123.webp')
    expect(adresseCloudinary(URL, 800, '4 / 5')).toContain('/upload/f_auto,q_auto,c_fill,w_800,h_1000/')
  })
  it('srcset en 400, 800 et 1200 px', () => {
    expect(srcsetCloudinary(URL, '4 / 3').split(', ')).toEqual([
      `${adresseCloudinary(URL, 400, '4 / 3')} 400w`, `${adresseCloudinary(URL, 800, '4 / 3')} 800w`, `${adresseCloudinary(URL, 1200, '4 / 3')} 1200w`,
    ])
    expect(srcsetCloudinary(URL, '4 / 3')).toContain('w_1200,h_900')
  })
  it('lit le rapport, 4:3 s’il est illisible', () => {
    expect(lireRatio('4 / 3')).toEqual([4, 3])
    expect(lireRatio('16/9')).toEqual([16, 9])
    expect(lireRatio('abc')).toEqual([4, 3])
  })
  it('sources : la photo publiée d’abord, sinon les fichiers du code, sinon rien', () => {
    expect(sourcesPhoto({ ...PHOTOS.fermeLivraison, url: URL })).toEqual({ src: adresseCloudinary(URL, 800, '4 / 3'), srcset: srcsetCloudinary(URL, '4 / 3') })
    expect(sourcesPhoto(PHOTOS.fermeLivraison)).toEqual({
      src: '/photos/livreur-800.webp', srcset: '/photos/livreur-400.webp 400w, /photos/livreur-800.webp 800w, /photos/livreur-1200.webp 1200w',
    })
    expect(sourcesPhoto({ ...PHOTOS.fermeLivraison, url: 'https://exemple.com/x.jpg' })?.src).toBe('/photos/livreur-800.webp')
    expect(sourcesPhoto({ ratio: '4 / 3' })).toBeNull()
  })
  it('n’accepte que les adresses Cloudinary du dossier « site », sans transformation', () => {
    expect(urlPhotoValide(URL)).toBe(true)
    expect(urlPhotoValide(URL, 'site/abc123')).toBe(true)
    expect(urlPhotoValide(URL, 'site/autre')).toBe(false)
    for (const u of [
      'https://res.cloudinary.com/ahitche/image/upload/site/a.gif', 'https://res.cloudinary.com/ahitche/image/upload/w_10/site/a.jpg',
      'https://res.cloudinary.com/ahitche/image/upload/v1/complements/a.jpg', 'http://res.cloudinary.com/ahitche/image/upload/site/a.jpg',
      'https://evil.com/ahitche/image/upload/site/a.jpg', 'https://res.cloudinary.com/ahitche/image/upload/site/a.jpg?x=1',
    ]) expect([u, urlPhotoValide(u)]).toEqual([u, false])
  })
})

describe('fusion des photos publiées', () => {
  it('rien de publié : les 5 photos du code', () => {
    expect(Object.values(PHOTOS_FRISE.value).map(p => p.url)).toEqual([undefined, undefined, undefined, undefined, undefined])
    expect(PHOTOS_FRISE.value.fermeProduction).toEqual(PHOTOS.fermeProduction)
  })
  it('deux photos publiées remplacent leur emplacement ; les autres gardent le fichier du code', () => {
    appliquerPhotos({ ...toutesDuCode(), fermeProduction: photo('a'), fermeReception: photo('b', { alt: 'Déballage du pack dans une cuisine de Calavi' }) })
    const frise = PHOTOS_FRISE.value
    expect(frise.fermeProduction).toMatchObject({ url: photo('a').url, alt: photo('a').alt, fichier: undefined, ratio: '4 / 3' })
    expect(frise.fermeReception.alt).toBe('Déballage du pack dans une cuisine de Calavi')
    expect(frise.fermeRecolte).toEqual(PHOTOS.fermeRecolte)
    expect(EMPLACEMENTS_FRISE.filter(c => sourcesPhoto(frise[c])!.src.startsWith('https://res.cloudinary.com/'))).toEqual(['fermeProduction', 'fermeReception'])
  })
  it('adresse invalide ou description manquante : la photo du code reste', () => {
    const v = fusionnerPhotos({
      fermeProduction: photo('a', { url: 'https://exemple.com/a.jpg' }),
      fermeRecolte: photo('b', { alt: 'court' }),
      fermePreparation: photo('c', { alt: 'Avec <b>balise</b> dedans, assez long' }),
      fermeLivraison: photo('d'),
      inconnu: photo('e'),
    })
    expect(Object.keys(v)).toEqual([...EMPLACEMENTS_FRISE])
    expect(EMPLACEMENTS_FRISE.filter(c => v[c].url)).toEqual(['fermeLivraison'])
    expect(fusionnerPhotos('nope').fermeProduction).toEqual(photoDuCode())
  })
  it('composerFrise : les titres des étapes restent ceux du serveur', () => {
    expect(Object.values(TITRES_FRISE)).toEqual(['Production', 'Récolte et tri', 'Préparation', 'Livraison', 'Réception'])
    expect(composerFrise(null).fermeLivraison).toBe(PHOTOS.fermeLivraison)
  })
})

const t = (id: string, autre: Partial<TemoignageSite> = {}): TemoignageSite => ({
  id, prenom: 'Awa', quartier: 'Fidjrossè', note: 5, texte: 'Un témoignage réel assez long.', accordLe: '2026-10-04', visible: true, ...autre,
})

describe('fusion des témoignages publiés', () => {
  it('rien de publié : ceux du code, affichés tels quels', () => {
    expect(TEMOIGNAGES.value.map(x => x.prenom)).toEqual(['David', 'Nadine', 'Boniface'])
    expect(Object.keys(TEMOIGNAGES.value[0]!)).toEqual(['prenom', 'quartier', 'note', 'texte'])
  })
  it('site public : liste sans id, date ni « visible » ; clés d’affichage générées', () => {
    const liste = fusionnerTemoignages(TEMOIGNAGES_PAR_DEFAUT, [
      { prenom: 'Awa', quartier: 'Fidjrossè', note: 4, texte: 'Un témoignage réel assez long.' },
      { prenom: 'Koffi', quartier: '', note: 5, texte: 'Un autre témoignage assez long.' },
    ])
    expect(liste.map(x => [x.id, x.visible, x.accordLe])).toEqual([['temoignage-1', true, ''], ['temoignage-2', true, '']])
  })
  it('liste publiée vide : aucun témoignage (seuls les avis des clients) ; masqué : retiré du site', () => {
    appliquerTemoignages([])
    expect(TEMOIGNAGES.value).toEqual([])
    appliquerTemoignages([t('a'), t('b', { prenom: 'Koffi', visible: false }), t('c', { prenom: 'Rachidi' })])
    expect(TEMOIGNAGES.value.map(x => x.prenom)).toEqual(['Awa', 'Rachidi'])
    appliquerTemoignages(null)
    expect(TEMOIGNAGES.value).toHaveLength(3)
  })
  it('ignore les témoignages mal formés et garde 6 au plus', () => {
    const liste = fusionnerTemoignages(TEMOIGNAGES_PAR_DEFAUT, [
      t('a'), t('a'), t('b', { note: 6 }), t('c', { note: 4.5 }), t('d', { texte: 'Trop court' }), t('e', { prenom: 'A' }), t('f', { texte: 'Avec <script> dedans, assez long.' }), 42,
    ])
    expect(liste.map(x => x.id)).toEqual(['a'])
    expect(fusionnerTemoignages(TEMOIGNAGES_PAR_DEFAUT, Array.from({ length: 8 }, (_, i) => t(`t${i}`)))).toHaveLength(6)
  })
})

describe('contrôles avant l’envoi : messages du serveur', () => {
  it('photos : description, droits et adresse, nommés par l’étape', () => {
    const base = toutesDuCode()
    expect(controlerPhotos(base)).toBeNull()
    expect(controlerPhotos({ ...base, fermeLivraison: photo('a', { alt: '' }) }))
      .toEqual({ champ: 'photos.fermeLivraison.alt', message: 'Photo « Livraison » : description obligatoire (ce que montre la photo, lue aux personnes malvoyantes).' })
    expect(controlerPhotos({ ...base, fermeLivraison: photo('a', { alt: 'Trop bref' }) })?.message).toBe('Photo « Livraison » : description : 10 caractères au moins.')
    expect(controlerPhotos({ ...base, fermeLivraison: photo('a', { alt: 'x'.repeat(201) }) })?.message).toBe('Photo « Livraison » : description : 200 caractères au plus.')
    expect(controlerPhotos({ ...base, fermeRecolte: photo('a', { droits: false }) })?.champ).toBe('photos.fermeRecolte.droits')
    expect(controlerPhotos({ ...base, fermeRecolte: photo('a', { publicId: 'site/autre' }) })?.champ).toBe('photos.fermeRecolte.url')
  })
  it('photos : un emplacement revenu au code part vide', () => {
    const envoi = photosAEnvoyer({ ...toutesDuCode(), fermeProduction: { url: '', publicId: 'site/x', alt: 'reste', droits: true }, fermeRecolte: photo('a', { alt: '  Mains   qui trient  ' }) })
    expect(envoi.fermeProduction).toEqual(photoDuCode())
    expect(envoi.fermeRecolte.alt).toBe('Mains qui trient')
  })
  it('témoignages : nomme le témoignage et le champ', () => {
    const aujourdhui = '2026-11-13'
    expect(controlerTemoignages([t('a')], aujourdhui)).toBeNull()
    expect(controlerTemoignages([t('a'), t('b', { prenom: 'A' })], aujourdhui)).toEqual({ champ: 'temoignages.b.prenom', message: 'Témoignage 2 : prénom : 2 caractères au moins.' })
    expect(controlerTemoignages([t('a', { note: 0 })], aujourdhui)?.champ).toBe('temoignages.a.note')
    expect(controlerTemoignages([t('a', { texte: 'Court' })], aujourdhui)?.message).toBe('Témoignage 1 : texte : 20 caractères au moins.')
    expect(controlerTemoignages([t('a', { texte: 'Avec {accolade} dans le texte.' })], aujourdhui)?.message)
      .toBe('Témoignage 1 : texte : les accolades ne sont acceptées que dans les réponses et les résumés, pour les variables.')
    expect(controlerTemoignages([t('a', { quartier: 'x'.repeat(61) })], aujourdhui)?.message).toBe('Témoignage 1 : quartier : 60 caractères au plus.')
  })
  it('témoignages : date de l’accord obligatoire, ni avant 2026 ni dans le futur', () => {
    const aujourdhui = '2026-11-13'
    expect(controlerTemoignages([t('a', { accordLe: '' })], aujourdhui)?.champ).toBe('temoignages.a.accordLe')
    expect(controlerTemoignages([t('a', { accordLe: '2026-02-30' })], aujourdhui)?.message).toBe('Témoignage 1 : date de l\'accord : date au format AAAA-MM-JJ attendue.')
    expect(controlerTemoignages([t('a', { accordLe: '2025-12-31' })], aujourdhui)?.message).toBe('Témoignage 1 : date de l\'accord, pas avant le 01/01/2026.')
    expect(controlerTemoignages([t('a', { accordLe: '2026-11-14' })], aujourdhui)?.message).toBe('Témoignage 1 : date de l\'accord dans le futur (nous sommes le 13/11/2026 à Cotonou).')
    expect(controlerTemoignages([t('a', { accordLe: '2026-11-13' })], aujourdhui)).toBeNull()
    expect(controlerTemoignages(Array.from({ length: 7 }, (_, i) => t(`t${i}`)), aujourdhui)?.message).toBe('Témoignages : 6 au plus.')
  })
  it('jour de Cotonou : UTC+1', () => {
    expect(jourCotonou(new Date('2026-11-13T23:30:00Z'))).toBe('2026-11-14')
    expect(jourCotonou(new Date('2026-11-13T22:59:00Z'))).toBe('2026-11-13')
  })
  it('les témoignages du code respectent les règles du serveur', () => {
    expect(controlerTemoignages(temoignagesAEnvoyer(TEMOIGNAGES_PAR_DEFAUT.map(x => ({ ...x }))), '2026-11-13')).toBeNull()
  })
  it('une erreur du serveur désigne le bon champ', () => {
    const ids = ['a', 'b']
    expect(champDeLErreur('photos', 'Photo « Récolte et tri » : description : 10 caractères au moins.')).toBe('photos.fermeRecolte.alt')
    expect(champDeLErreur('photos', 'Photo « Livraison » : cochez la case des droits (photo prise…).')).toBe('photos.fermeLivraison.droits')
    expect(champDeLErreur('photos', 'Photo « Production » : adresse refusée ; envoyez la photo depuis cet écran.')).toBe('photos.fermeProduction.url')
    expect(champDeLErreur('photos', 'Emplacement de photo inconnu : x.')).toBe('')
    expect(champDeLErreur('temoignages', 'Témoignage 2 : date de l\'accord dans le futur (nous sommes le 13/11/2026 à Cotonou).', ids)).toBe('temoignages.b.accordLe')
    expect(champDeLErreur('temoignages', 'Témoignage 1 : note, un nombre entier de 1 à 5.', ids)).toBe('temoignages.a.note')
    expect(champDeLErreur('temoignages', 'Témoignage 2 : « Afficher sur le site », oui ou non.', ids)).toBe('temoignages.b.visible')
    expect(champDeLErreur('temoignages', 'Témoignage 1 : identifiant invalide (…).', ids)).toBe('temoignages.a.prenom')
    expect(champDeLErreur('temoignages', 'Témoignages : 6 au plus.', ids)).toBe('')
  })
})

describe('ce qui change', () => {
  it('photos : remplacée, rétablie, description modifiée', () => {
    const avant = { ...toutesDuCode(), fermeLivraison: photo('a'), fermeReception: photo('b') }
    const apres = { ...toutesDuCode(), fermeProduction: photo('c'), fermeReception: photo('b', { alt: 'Une autre description longue' }) }
    expect(ecartsPhotos(avant, apres).map(c => `${c.libelle} : ${c.avant} -> ${c.apres}`)).toEqual([
      'Photo « Production » : photo : photo du code -> autre photo, envoyée depuis l\'admin',
      `Photo « Production » : description : — -> ${photo('c').alt}`,
      'Photo « Livraison » : photo : photo publiée -> photo du code',
      `Photo « Livraison » : description : ${photo('a').alt} -> —`,
      `Photo « Réception » : description : ${photo('b').alt} -> Une autre description longue`,
    ])
    expect(ecartsPhotos(avant, avant)).toEqual([])
  })
  it('témoignages : accords au masculin', () => {
    const libelles = ecartsTemoignages([t('a'), t('b')], [t('b', { note: 4 }), t('n', { prenom: 'Koffi' })]).map(c => c.libelle)
    expect(libelles).toEqual(['Témoignage 1 : note', 'Témoignage 2 ajouté', 'Témoignage supprimé'])
    expect(ecartsTemoignages([t('a'), t('b')], [t('b'), t('a', { visible: false })]).map(c => c.libelle))
      .toEqual(['Témoignage 2 : affiché sur le site', 'Ordre'])
  })
})

describe('chargement des valeurs du site : une seule photo par emplacement', () => {
  const reponse = (corps: unknown) => Promise.resolve(new Response(JSON.stringify(corps), { status: 200 }))
  const charger = async () => {
    vi.resetModules()
    const site = await import('@/services/contenuSite')
    const photos = await import('@/config/photos')
    return { site, photos }
  }
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('les photos publiées sont appliquées avant le signal : la frise ne demande jamais celles du code', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reponse({ photos: { ...toutesDuCode(), fermeProduction: photo('a'), fermeLivraison: photo('b') } })))
    const { site, photos } = await charger()
    const vuAuSignal: string[] = []
    watch(site.valeursSiteConnues, () => {
      vuAuSignal.push(...EMPLACEMENTS_FRISE.map(c => sourcesPhoto(photos.PHOTOS_FRISE.value[c])!.src))
    }, { flush: 'sync' })
    expect(site.valeursSiteConnues.value).toBe(false)
    await site.chargerContenuSite()
    expect(site.valeursSiteConnues.value).toBe(true)
    expect(vuAuSignal.filter(s => s.startsWith('https://res.cloudinary.com/'))).toHaveLength(2)
    expect(vuAuSignal).toContain('/photos/trie_legumes-800.webp')
    expect(vuAuSignal).not.toContain('/photos/producteur_partenaire-800.webp')
  })

  it('API en échec : le signal arrive, les photos du code restent', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('hors ligne'))))
    const { site, photos } = await charger()
    await site.chargerContenuSite()
    expect(site.valeursSiteConnues.value).toBe(true)
    expect(photos.PHOTOS_FRISE.value.fermeProduction.url).toBeUndefined()
  })

  it('API muette : le signal arrive au bout de 5 s', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => new Promise((_ok, echec) => {
      options.signal?.addEventListener('abort', () => echec(new DOMException('délai', 'AbortError')))
    })))
    const { site } = await charger()
    const fin = site.chargerContenuSite()
    await vi.advanceTimersByTimeAsync(4999)
    expect(site.valeursSiteConnues.value).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(site.valeursSiteConnues.value).toBe(true)
    await fin
  })
})
