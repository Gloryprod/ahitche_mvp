// Convention de subvention N°171 (NEXT IMPACT) : période, mois du projet et pièces justificatives exigées.
// Les montants du budget ne sont jamais ici : ils s'importent dans Finances (fichier exclu de Git).

// Mois du projet : du 26 au 25 (M1 = 26/05 au 25/06/2026 … M6 = 26/10 au 25/11/2026).
// Fin : fin du Mois 6, vers le 25/11/2026 ; date officielle à confirmer par le porteur (ADSC).
const DEBUT_CONVENTION = { annee: 2026, mois: 5, jour: 26 };
const NB_MOIS_CONVENTION = 6;

const SOURCES_FINANCEMENT = ['Subvention N°171', 'Fonds propres', 'Ventes'];
const MODES_PAIEMENT_DEPENSE = ['Mobile Money', 'Espèces', 'Virement', 'Chèque'];

// Pièces exigées selon la catégorie de la dépense (guide AT fiduciaire, partie 4.2 ; Q 9.3)
// Catégorie 1 : équipements, matières, fournitures, services non consultants ; catégorie 2 : services consultants.
const SEUIL_COTATION_USD = 1000; // Au-delà, 3 proformas et un tableau comparatif
const PIECES_ATTENDUES = {
  1: ['Autorisation de décaissement', 'Bon de commande', 'Bon de livraison ou PV de réception', 'Preuve matérielle', 'Facture payée', 'Preuve de paiement'],
  2: ['Autorisation de décaissement', 'Termes de référence', "Lettre d'invitation", 'Proposition technique et financière', 'Livrable approuvé', 'Facture payée', 'Preuve de paiement']
};
const PIECES_COTATION = ['3 proformas', 'Tableau comparatif'];
// Pièces « si applicables » : proposées dans la liste, jamais exigées
const PIECES_FACULTATIVES = { 1: [], 2: ['PV de négociation', 'Contrat'] };

module.exports = {
  DEBUT_CONVENTION, NB_MOIS_CONVENTION, SOURCES_FINANCEMENT, MODES_PAIEMENT_DEPENSE,
  SEUIL_COTATION_USD, PIECES_ATTENDUES, PIECES_COTATION, PIECES_FACULTATIVES
};
