import axios from 'axios'

// Message d'erreur renvoyé par le serveur ({ message }) pour une requête échouée, sinon le message par défaut
export function messageErreur(erreur: unknown, parDefaut: string): string {
  if (axios.isAxiosError<{ message?: string }>(erreur)) return erreur.response?.data?.message || parDefaut
  return parDefaut
}

// Produit qui manque dans le stock pour livrer une commande (réponse 409 ou 403 du passage à « Livrée »)
export interface ManqueStock { productId: string; nom: string; unite: string; manque: number }

// Refus de livraison pour stock incomplet ; null pour une autre erreur.
// Seul l'admin peut forcer, et seulement sur le 409 (le 403 répond à une demande déjà forcée).
export function lireManques(erreur: unknown, estAdmin: boolean): { message: string; manques: ManqueStock[]; peutForcer: boolean } | null {
  if (!axios.isAxiosError<{ message?: string; manques?: ManqueStock[] }>(erreur)) return null
  const manques = erreur.response?.data?.manques
  if (!Array.isArray(manques) || !manques.length) return null
  return {
    message: erreur.response?.data?.message || 'Stock insuffisant pour livrer cette commande.',
    manques,
    peutForcer: estAdmin && erreur.response?.status === 409,
  }
}
