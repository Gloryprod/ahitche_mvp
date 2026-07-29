export interface Client {
  _id: string
  quartier: string,
  adresse: string,
  formuleHabituelle: string,
  telephone:string,
  username: string
  email: string
}

interface Commande {
  id: string
  userId: string | null
  clientName: string
  whatsapp: string
  formule: 'AHI ESSENTIEL' | 'AHI EQUILIBRE' | 'AHI CONFORT' | 'AHI RESERVE' | 'AHI FRAÎCHEUR'
  total: number
  date: string
  formuleSlug: string
  modePaiement: string
  notes: string
  statut: 'En attente' | 'Livré'
  productsSnapshot: ProductSnapshot[]
  deletedAt: Date
  dateLivraison: Date
}   

export interface Category {
  _id: string
  name: string,
  description: string,
  active: boolean,
}

export interface CompositionRule {
  _id: string
  name: string
  multiplierEquilibre: number
  multiplierConfort: number
  description?: string
  createdAt?: string
}

export interface Product {
  _id: string
  name: string
  category: Category
  compositionRule: CompositionRule
  baseQuantity: number
  unit: string
  priceUnit: number
}

export interface Formule {
  _id: string;
  slug: 'ahi-essentiel' | 'ahi-equilibre' | 'ahi-confort';
  nom: string;
  emoji: string;
  cible: string;
  phraseAccroche: string;
  estimationRepas: {
    min: number;
    max: number;
  };
  heuresEconomisees: {
    min: number;
    max: number;
  };
  ancienPrix: number;  // Prix barré dynamique recalculé par le backend
  prixActuel: number;  // Valeur réelle calculée à la volée en fonction du catalogue
  estRecommandee: boolean;
  statut: 'actif' | 'inactif';
  lienWhatsApp: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductItem {
  productId: string;
  name: string;
  category: string;
  unit: string;
  priceUnit: number;
  appliedMultiplier: number;
  quantity: number;
  totalPrice: number;
}

export interface ProductSnapshot {
  orderId: string;
  productId: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  isExtra: boolean; 
}
