import { describe, expect, it } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import { formatStock } from '../bonsCommande'
import { lireManques } from '../erreurs'

const erreurHttp = (status: number, data: unknown) =>
  new AxiosError('refus', String(status), undefined, undefined, {
    status, statusText: '', data, headers: {}, config: { headers: new AxiosHeaders() },
  })

const manques = [{ productId: 'p1', nom: 'Riz local', unite: 'kg', manque: 3 }]

describe('stock négatif affiché', () => {
  it('écrit le vrai signe moins devant un stock négatif', () => {
    expect(formatStock(-3)).toBe('−3')
    expect(formatStock(-2.5)).toBe('−2,5')
  })
  it('laisse un stock positif, nul ou vide comme avant', () => {
    expect(formatStock(4)).toBe('4')
    expect(formatStock(0)).toBe('0')
    expect(formatStock(null)).toBe('—')
  })
})

describe('livraison refusée pour stock incomplet', () => {
  it("l'admin peut forcer sur un 409", () => {
    expect(lireManques(erreurHttp(409, { message: 'Stock insuffisant', manques }), true))
      .toEqual({ message: 'Stock insuffisant', manques, peutForcer: true })
  })
  it('le gestionnaire voit la liste sans pouvoir forcer', () => {
    expect(lireManques(erreurHttp(409, { message: 'Stock insuffisant', manques }), false)?.peutForcer).toBe(false)
  })
  it('un 403 (demande déjà forcée) ne propose jamais de forcer', () => {
    const refus = lireManques(erreurHttp(403, { message: "Stock incomplet : demandez à l'admin de valider cette livraison.", manques }), true)
    expect(refus?.peutForcer).toBe(false)
    expect(refus?.manques).toEqual(manques)
  })
  it('ignore les autres erreurs', () => {
    expect(lireManques(erreurHttp(409, { message: 'Passage interdit' }), true)).toBeNull()
    expect(lireManques(erreurHttp(500, { message: 'Erreur', manques: [] }), true)).toBeNull()
    expect(lireManques(new Error('réseau'), true)).toBeNull()
  })
})
