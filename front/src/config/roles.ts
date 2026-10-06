// Rôles et accès du back-office, en miroir de back/src/config/roles.js.
// Le serveur reste la référence : ces listes servent seulement à afficher le bon menu et à rediriger.

export type Role = 'user' | 'admin' | 'gestionnaire' | 'comptable' | 'nutritionniste' | 'coordinateur' | 'auditeur'

export const EQUIPE: Role[] = ['admin', 'gestionnaire', 'comptable', 'nutritionniste', 'coordinateur', 'auditeur']

export type Section =
  | 'tableauDeBord' | 'commandes' | 'clients' | 'stock' | 'prestataires' | 'logistique'
  | 'finances' | 'simulateurs' | 'nutrition' | 'donneesBase' | 'contenus' | 'parametres'

export const ACCES: Record<Section, { lecture: Role[]; ecriture: Role[] }> = {
  tableauDeBord: { lecture: ['admin', 'gestionnaire', 'comptable', 'coordinateur'], ecriture: [] },
  commandes:     { lecture: ['admin', 'gestionnaire', 'comptable', 'coordinateur'], ecriture: ['admin', 'gestionnaire'] },
  clients:       { lecture: ['admin', 'gestionnaire', 'comptable', 'nutritionniste', 'coordinateur'], ecriture: ['admin'] },
  stock:         { lecture: ['admin', 'gestionnaire', 'comptable', 'coordinateur', 'auditeur'], ecriture: ['admin', 'gestionnaire'] },
  prestataires:  { lecture: ['admin', 'gestionnaire', 'comptable', 'coordinateur'], ecriture: ['admin', 'gestionnaire'] },
  logistique:    { lecture: ['admin', 'gestionnaire', 'comptable', 'coordinateur'], ecriture: ['admin', 'gestionnaire'] },
  finances:      { lecture: ['admin', 'comptable', 'coordinateur', 'auditeur'],     ecriture: ['admin', 'comptable'] },
  simulateurs:   { lecture: ['admin', 'comptable', 'coordinateur'],                 ecriture: [] },
  nutrition:     { lecture: ['admin', 'nutritionniste'],                            ecriture: ['admin', 'nutritionniste'] },
  donneesBase:   { lecture: ['admin', 'comptable', 'nutritionniste', 'coordinateur'], ecriture: ['admin'] },
  contenus:      { lecture: ['admin'],                                               ecriture: ['admin'] },
  parametres:    { lecture: ['admin', 'comptable', 'coordinateur'],                 ecriture: ['admin', 'comptable'] },
}

export const LIBELLES_ROLES: Record<Role, string> = {
  user: 'Client',
  admin: 'Administrateur',
  gestionnaire: 'Gestionnaire',
  comptable: 'Comptable',
  nutritionniste: 'Nutritionniste',
  coordinateur: 'Coordinateur',
  auditeur: 'Auditeur',
}

export const peutLire = (role: Role | undefined, section: Section) => !!role && ACCES[section].lecture.includes(role)
export const peutEcrire = (role: Role | undefined, section: Section) => !!role && ACCES[section].ecriture.includes(role)

// Page d'arrivée après connexion, ou quand une page n'est pas accessible avec ce rôle
export function espaceParDefaut(role: Role | undefined): string {
  if (role === 'user') return '/dashboard/user'
  if (role === 'nutritionniste') return '/dashboard/admin/nutrition'
  if (role === 'auditeur') return '/dashboard/admin/finances'
  if (role && EQUIPE.includes(role)) return '/dashboard/admin'
  return '/'
}
