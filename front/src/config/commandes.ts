// Statuts de commande et passages autorisés, en miroir de back/src/services/commandeService.js

export type StatutCommande = 'En attente' | 'Confirmée' | 'En préparation' | 'En livraison' | 'Livrée' | 'Échec' | 'Annulée'

export const STATUTS: StatutCommande[] = ['En attente', 'Confirmée', 'En préparation', 'En livraison', 'Livrée', 'Échec', 'Annulée']

export const TRANSITIONS: Record<StatutCommande, StatutCommande[]> = {
  'En attente': ['Confirmée', 'Annulée'],
  'Confirmée': ['En préparation', 'Annulée'],
  'En préparation': ['En livraison', 'Annulée'],
  'En livraison': ['Livrée', 'Échec'],
  'Échec': ['Confirmée', 'Annulée'],
  'Livrée': [],
  'Annulée': [],
}

// Étape suivante du parcours normal (bouton principal)
export const ETAPE_SUIVANTE: Partial<Record<StatutCommande, StatutCommande>> = {
  'En attente': 'Confirmée',
  'Confirmée': 'En préparation',
  'En préparation': 'En livraison',
  'En livraison': 'Livrée',
  'Échec': 'Confirmée',
}

export const ANNULABLES_PAR_CLIENT: StatutCommande[] = ['En attente', 'Confirmée']

export const CLASSES_STATUT: Record<StatutCommande, string> = {
  'En attente': 'bg-amber-50 text-amber-800 border border-amber-200',
  'Confirmée': 'bg-sky-50 text-sky-800 border border-sky-200',
  'En préparation': 'bg-violet-50 text-violet-800 border border-violet-200',
  'En livraison': 'bg-or/20 text-noir border border-or/40',
  'Livrée': 'bg-green-50 text-green-800 border border-green-200',
  'Échec': 'bg-red-50 text-red-700 border border-red-200',
  'Annulée': 'bg-gray-100 text-gris border border-gray-200',
}

export const classeStatut = (statut: string) =>
  CLASSES_STATUT[statut as StatutCommande] ?? 'bg-gray-100 text-gris border border-gray-200'
