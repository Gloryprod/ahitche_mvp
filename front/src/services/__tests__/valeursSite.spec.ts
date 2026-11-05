import { describe, expect, it } from 'vitest'
import {
  formaterHoraires, formaterJours, formaterNumero, fusionnerInfos, horairesGoogle, lireBandeau, type JourSemaine,
} from '../valeursSite'
import { INFOS_PAR_DEFAUT, HORAIRES, LIVRAISON_ANNONCE, WHATSAPP_AFFICHAGE, appliquerInfos, infosSite, lienWhatsApp } from '@/config/contact'
import { FAQ } from '@/config/faq'

const horaires = (jours: JourSemaine[], ouverture = '09:00', fermeture = '18:00') => ({ jours, ouverture, fermeture })

describe('numéro WhatsApp affiché', () => {
  it('groupe par deux les 8 chiffres après 229', () => {
    expect(formaterNumero('22998136635')).toBe('+229 98 13 66 35')
  })
  it('groupe par deux les 10 chiffres après 229', () => {
    expect(formaterNumero('2290123456789')).toBe('+229 01 23 45 67 89')
  })
  it('ignore les espaces et le « + » saisis', () => {
    expect(formaterNumero('+229 01 23 45 67 89')).toBe('+229 01 23 45 67 89')
  })
})

describe('horaires affichés', () => {
  it('regroupe lundi à samedi en une plage', () => {
    expect(formaterHoraires(horaires(['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']))).toBe('Lundi – Samedi, 9h00 – 18h00')
  })
  it('liste les jours non consécutifs, dans l’ordre de la semaine', () => {
    expect(formaterJours(['vendredi', 'lundi', 'mercredi'])).toBe('Lundi, Mercredi et Vendredi')
    expect(formaterJours(['lundi', 'mardi', 'mercredi', 'samedi'])).toBe('Lundi – Mercredi et Samedi')
    expect(formaterJours(['lundi', 'mardi', 'mercredi', 'vendredi', 'samedi', 'dimanche'])).toBe('Lundi – Mercredi et Vendredi – Dimanche')
    expect(formaterJours(['samedi', 'dimanche'])).toBe('Samedi et Dimanche')
  })
  it('affiche un seul jour et des minutes', () => {
    expect(formaterHoraires(horaires(['samedi'], '08:30', '12:00'))).toBe('Samedi, 8h30 – 12h00')
  })
  it('donne les jours à Google dans l’ordre de la semaine', () => {
    expect(horairesGoogle(horaires(['samedi', 'lundi'])).jours).toEqual(['Monday', 'Saturday'])
  })
})

describe('valeurs publiées', () => {
  it('garde la valeur du code pour un champ absent ou mal formé', () => {
    const v = fusionnerInfos(INFOS_PAR_DEFAUT, { whatsappNumero: '123', paiement: 42, horaires: { jours: ['lundi'], ouverture: '9h' } })
    expect(v.whatsappNumero).toBe(INFOS_PAR_DEFAUT.whatsappNumero)
    expect(v.paiement).toBe(INFOS_PAR_DEFAUT.paiement)
    expect(v.horaires).toEqual({ jours: ['lundi'], ouverture: '09:00', fermeture: '18:00' })
  })

  it('remplace les valeurs affichées partout, puis revient à celles du code', () => {
    appliquerInfos({ ...INFOS_PAR_DEFAUT, whatsappNumero: '2290123456789', joursLivraison: 'le mardi', horaires: horaires(['samedi']) })
    expect(WHATSAPP_AFFICHAGE.value).toBe('+229 01 23 45 67 89')
    expect(lienWhatsApp()).toBe('https://wa.me/2290123456789')
    expect(LIVRAISON_ANNONCE.value).toBe('Livraison le mardi')
    expect(HORAIRES.value).toBe('Samedi, 9h00 – 18h00')
    expect(FAQ.value.some(q => q.reponse.includes('Samedi, 9h00 – 18h00'))).toBe(true)
    appliquerInfos(INFOS_PAR_DEFAUT)
    expect(infosSite.whatsappNumero).toBe('22998136635')
    expect(HORAIRES.value).toBe('Lundi – Samedi, 9h00 – 18h00')
  })

  it('n’affiche un bandeau que s’il est actif avec un message, et un lien seulement s’il est sûr', () => {
    expect(lireBandeau(null)).toBeNull()
    expect(lireBandeau({ actif: false, message: 'Bonjour' })).toBeNull()
    expect(lireBandeau({ actif: true, message: '  ' })).toBeNull()
    expect(lireBandeau({ actif: true, message: 'Promo', ton: 'important', lien: '//ailleurs.com', texteLien: 'Voir' }))
      .toMatchObject({ ton: 'important', lien: '', texteLien: '' })
    expect(lireBandeau({ actif: true, message: 'Promo', lien: '/blog', texteLien: 'Voir' })).toMatchObject({ ton: 'info', lien: '/blog' })
  })
})
