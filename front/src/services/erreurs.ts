import axios from 'axios'

// Message d'erreur renvoyé par le serveur ({ message }) pour une requête échouée, sinon le message par défaut
export function messageErreur(erreur: unknown, parDefaut: string): string {
  if (axios.isAxiosError<{ message?: string }>(erreur)) return erreur.response?.data?.message || parDefaut
  return parDefaut
}
