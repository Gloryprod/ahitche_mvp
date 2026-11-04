// Menu du back-office : groupes, entrées et mots-clés de la recherche « Trouver un outil ».
// Les adresses et les sections (droits) sont celles du routeur (router/routes.ts) et de config/roles.ts :
// le menu n'affiche que ce que le rôle peut lire, le serveur reste la référence.
import type { Component } from 'vue'
import {
  LayoutDashboard,
  ShoppingBag,
  Truck,
  Users,
  MessageSquareQuote,
  Crown,
  Tags,
  Carrot,
  Megaphone,
  Newspaper,
  UtensilsCrossed,
  PackagePlus,
  Boxes,
  ArrowLeftRight,
  ClipboardList,
  CalendarClock,
  Handshake,
  Wallet,
  Calculator,
  Salad,
  Package,
  FolderTree,
  ListTree,
  UserCog,
  PanelsTopLeft,
} from 'lucide-vue-next'
import { peutLire, type Role, type Section } from './roles'

// Pastilles du menu, renvoyées par GET /api/admin/compteurs (composables/useCompteursAdmin.ts)
export type CleCompteur = 'commandesEnAttente' | 'avisAValider'

export interface EntreeMenu {
  id: string
  nom: string
  icone: Component
  chemin: string
  section: Section
  motsCles: string[] // Recherche : sans accents ni majuscules, voir normaliser()
  compteur?: CleCompteur
}

export interface GroupeMenu {
  id: string
  titre: string
  entrees: EntreeMenu[]
}

export const GROUPES_MENU: GroupeMenu[] = [
  {
    id: 'aujourdhui',
    titre: 'Aujourd’hui',
    entrees: [
      { id: 'dashboard', nom: 'Tableau de bord', icone: LayoutDashboard, chemin: '/dashboard/admin', section: 'tableauDeBord', motsCles: ['accueil', 'résumé', 'indicateurs', 'renouvellement', 'relance', 'fréquentation', 'marge'] },
      { id: 'commandes', nom: 'Commandes', icone: ShoppingBag, chemin: '/dashboard/admin/commandes', section: 'commandes', motsCles: ['commande', 'statut', 'paiement', 'mobile money', 'whatsapp', 'en attente'], compteur: 'commandesEnAttente' },
      { id: 'logistique', nom: 'Logistique', icone: Truck, chemin: '/dashboard/admin/logistique', section: 'logistique', motsCles: ['livreur', 'livraison', 'tournée', 'zone', 'planning', 'itinéraire'] },
    ],
  },
  {
    id: 'clients',
    titre: 'Clients',
    entrees: [
      { id: 'clients', nom: 'Clients', icone: Users, chemin: '/dashboard/admin/clients', section: 'clients', motsCles: ['client', 'contact', 'téléphone', 'adresse', 'quartier'] },
      { id: 'avis', nom: 'Avis clients', icone: MessageSquareQuote, chemin: '/dashboard/admin/avis', section: 'avis', motsCles: ['avis', 'témoignage', 'note', 'publier', 'à valider'], compteur: 'avisAValider' },
      { id: 'vip', nom: 'Codes VIP', icone: Crown, chemin: '/dashboard/admin/vip', section: 'vip', motsCles: ['vip', 'code', 'achat libre', 'remise'] },
    ],
  },
  {
    id: 'vitrine',
    titre: 'Vitrine du site',
    entrees: [
      { id: 'site', nom: 'Site public', icone: PanelsTopLeft, chemin: '/dashboard/admin/site', section: 'site', motsCles: ['whatsapp', 'horaires', 'bandeau', 'annonce', 'livraison', 'paiement', 'facebook', 'tiktok', 'réseaux', 'contact', 'infos pratiques', 'formules', 'prix', 'accroche'] },
      { id: 'formules', nom: 'Formules et prix', icone: Tags, chemin: '/dashboard/admin/formulas', section: 'donneesBase', motsCles: ['pack', 'formule', 'tarif', 'essentiel', 'équilibré', 'confort', 'cycle', 'bientôt'] },
      { id: 'complements', nom: 'Compléments de la semaine', icone: Carrot, chemin: '/dashboard/admin/complements', section: 'complements', motsCles: ['complément', 'extra', 'photo', 'cette semaine', 'disponible'] },
      { id: 'fiches', nom: 'Fiches produits', icone: Megaphone, chemin: '/dashboard/admin/fiches', section: 'fiches', motsCles: ['fiche', 'photo', 'publicité', 'espace client'] },
      { id: 'post', nom: 'Articles du blog', icone: Newspaper, chemin: '/dashboard/admin/posts', section: 'contenus', motsCles: ['blog', 'article', 'actualité', 'contenu', 'média', 'publication'] },
      { id: 'idees-repas', nom: 'Idées de repas', icone: UtensilsCrossed, chemin: '/dashboard/admin/idees-repas', section: 'repas', motsCles: ['repas', 'recette', 'menu', 'plat', 'conseil'] },
    ],
  },
  {
    id: 'stock',
    titre: 'Stock et achats',
    entrees: [
      { id: 'saveStock', nom: 'Entrée en stock', icone: PackagePlus, chemin: '/dashboard/admin/saveStock', section: 'stock', motsCles: ['stock', 'réception', 'arrivage', 'lot', 'ajouter'] },
      { id: 'inventaire', nom: 'Inventaire', icone: Boxes, chemin: '/dashboard/admin/inventaire', section: 'stock', motsCles: ['stock', 'comptage', 'lot', 'seuil', 'alerte', 'rupture'] },
      { id: 'mouvement-stock', nom: 'Mouvements', icone: ArrowLeftRight, chemin: '/dashboard/admin/mouvement-stock', section: 'stock', motsCles: ['stock', 'mouvement', 'sortie', 'historique', 'fifo', 'transformation'] },
      { id: 'bon-commande', nom: 'Bons de commande', icone: ClipboardList, chemin: '/dashboard/admin/bon-commande', section: 'stock', motsCles: ['bon', 'fournisseur', 'achat', 'approvisionnement'] },
      { id: 'prevision-achats', nom: 'Prévision d’achats', icone: CalendarClock, chemin: '/dashboard/admin/prevision-achats', section: 'stock', motsCles: ['prévision', 'achat', 'besoin', 'marché'] },
      { id: 'prestataires', nom: 'Prestataires', icone: Handshake, chemin: '/dashboard/admin/prestataires', section: 'prestataires', motsCles: ['prestataire', 'fournisseur', 'partenaire', 'contrat'] },
    ],
  },
  {
    id: 'gestion',
    titre: 'Gestion',
    entrees: [
      { id: 'finances', nom: 'Finances', icone: Wallet, chemin: '/dashboard/admin/finances', section: 'finances', motsCles: ['dépense', 'budget', 'justificatif', 'taux', 'audit', 'convention', 'comptabilité'] },
      { id: 'simulateur', nom: 'Simulateurs', icone: Calculator, chemin: '/dashboard/admin/simulateurs', section: 'simulateurs', motsCles: ['simulation', 'marge', 'coût', 'rentabilité', 'objectif', 'paramètres'] },
      { id: 'nutrition', nom: 'Nutrition', icone: Salad, chemin: '/dashboard/admin/nutrition', section: 'nutrition', motsCles: ['nutritionniste', 'suivi alimentaire', 'équilibre'] },
    ],
  },
  {
    id: 'reglages',
    titre: 'Réglages',
    entrees: [
      { id: 'produits', nom: 'Produits (catalogue)', icone: Package, chemin: '/dashboard/admin/products', section: 'donneesBase', motsCles: ['produit', 'catalogue', 'prix', 'unité', 'article'] },
      { id: 'categorie', nom: 'Catégories', icone: FolderTree, chemin: '/dashboard/admin/categories', section: 'donneesBase', motsCles: ['catégorie', 'famille', 'classement'] },
      { id: 'regles', nom: 'Règles de composition', icone: ListTree, chemin: '/dashboard/admin/regles', section: 'donneesBase', motsCles: ['règle', 'composition', 'multiplicateur'] },
      { id: 'equipe', nom: 'Équipe et accès', icone: UserCog, chemin: '/dashboard/admin/equipe', section: 'equipe', motsCles: ['équipe', 'compte', 'livreur', 'rôle', 'mot de passe', 'accès', 'utilisateur'] },
    ],
  },
]

// Raccourcis du tableau de bord : affichés seulement si le rôle peut modifier la section (peutEcrire)
export const ACTIONS_RAPIDES: { id: string; libelle: string }[] = [
  { id: 'commandes', libelle: 'Commandes' },
  { id: 'logistique', libelle: 'Logistique' },
  { id: 'saveStock', libelle: 'Entrée en stock' },
  { id: 'avis', libelle: 'Avis clients' },
  { id: 'finances', libelle: 'Finances' },
]

export const ENTREES_MENU: EntreeMenu[] = GROUPES_MENU.flatMap(groupe => groupe.entrees)
export const entreeMenu = (id: string) => ENTREES_MENU.find(entree => entree.id === id)

// « Équilibré » -> « equilibre » : la recherche ignore accents, majuscules et apostrophes typographiques
export const normaliser = (texte: string) =>
  texte.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/’/g, '\'').toLowerCase().trim()

// Chaque mot saisi doit se trouver dans le nom ou les mots-clés de l'entrée
export function correspond(entree: EntreeMenu, recherche: string): boolean {
  const mots = normaliser(recherche).split(/\s+/).filter(Boolean)
  if (mots.length === 0) return true
  const texte = normaliser([entree.nom, ...entree.motsCles].join(' '))
  return mots.every(mot => texte.includes(mot))
}

// Groupes visibles pour ce rôle, réduits aux entrées qui correspondent à la recherche (groupes vides retirés)
export function filtrerMenu(role: Role | undefined, recherche = ''): GroupeMenu[] {
  return GROUPES_MENU
    .map(groupe => ({
      ...groupe,
      entrees: groupe.entrees.filter(entree => peutLire(role, entree.section) && correspond(entree, recherche)),
    }))
    .filter(groupe => groupe.entrees.length > 0)
}
