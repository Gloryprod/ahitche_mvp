import { describe, expect, it } from 'vitest'
import { BLANC, NOIR, contraste, contrasteTexte, couleurTexte, luminance } from '../couleurs'

describe('contraste des couleurs libres (WCAG)', () => {
  it('donne 21 : 1 entre le blanc et le noir pur, 1 : 1 entre deux couleurs identiques, dans les deux sens', () => {
    expect(luminance('#000000')).toBe(0)
    expect(luminance(BLANC)).toBeCloseTo(1)
    expect(contraste(BLANC, '#000000')).toBeCloseTo(21)
    expect(contraste('#000000', BLANC)).toBeCloseTo(21)
    expect(contraste('#1A5C38', '#1a5c38')).toBeCloseTo(1)
  })

  it('place le seuil de 4,5 : 1 sur le blanc entre #767676 et #777777', () => {
    expect(contraste('#767676', BLANC)).toBeGreaterThanOrEqual(4.5)
    expect(contraste('#777777', BLANC)).toBeLessThan(4.5)
  })

  it('choisit le texte le plus lisible : blanc sur un fond foncé, noir de la charte sur un fond clair', () => {
    expect(couleurTexte('#1A5C38')).toBe('blanc') // forêt
    expect(couleurTexte('#1C2E4A')).toBe('blanc') // marine
    expect(couleurTexte('#F2B705')).toBe('noir') // or
    expect(couleurTexte('#F8F5EF')).toBe('noir') // crème
    expect(contrasteTexte('#F2B705')).toBeCloseTo(contraste('#F2B705', NOIR))
  })
})
