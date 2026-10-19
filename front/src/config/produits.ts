import type { TypeProduit } from '@/type'

// Familles du catalogue, en miroir de back/src/models/product.js (TYPES_PRODUIT, FAMILLES, TYPES_VENDUS).
// Le serveur fait foi : il refuse un type inconnu, vide les quantités par pack d'une matière première ou d'une
// fourniture et refuse ces deux familles dans une commande.

export type CodeFamille = 'P' | 'V' | 'MP' | 'EMB'

export interface FamilleProduit {
  type: TypeProduit
  code: CodeFamille
  libelle: string
}

// Dans l'ordre de l'inventaire : P, V, MP, EMB
export const FAMILLES_PRODUIT: readonly FamilleProduit[] = [
  { type: 'base fixe', code: 'P', libelle: 'Produit fixe (packs)' },
  { type: 'extra', code: 'V', libelle: 'Produit variable' },
  { type: 'matière première', code: 'MP', libelle: 'Matière première' },
  { type: 'fourniture', code: 'EMB', libelle: 'Fourniture (emballage)' },
]

// Seuls les produits fixes et variables se vendent (packs, extras d'une commande, site). Matières premières et
// fournitures sont achetées et stockées, jamais vendues.
export const TYPES_VENDUS: readonly TypeProduit[] = ['base fixe', 'extra']

export const estVendu = (type: string | null | undefined): boolean =>
  TYPES_VENDUS.some(t => t === type)

// Famille d'un type de produit ; null pour un type inconnu
export function familleDe(type: string | null | undefined): FamilleProduit | null {
  return FAMILLES_PRODUIT.find(f => f.type === type) ?? null
}
