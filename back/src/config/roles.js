// Rôles de l'équipe Ahitché et droits par section du back-office.
// Référence : docs/conception-menu-admin.md (section 3, Rôles).
//  - admin          : tout
//  - gestionnaire   : commandes, stock, logistique, prestataires
//  - comptable      : finances ; le reste en lecture seule
//  - nutritionniste : nutrition ; les clients en lecture seule

const ROLES = ['user', 'admin', 'gestionnaire', 'comptable', 'nutritionniste'];
const EQUIPE = ['admin', 'gestionnaire', 'comptable', 'nutritionniste'];

// Pour chaque section : rôles autorisés en lecture (GET) et en écriture (POST, PUT, PATCH, DELETE)
const ACCES = {
  clients:       { lecture: EQUIPE,                                  ecriture: ['admin'] },
  commandes:     { lecture: ['admin', 'gestionnaire', 'comptable'], ecriture: ['admin', 'gestionnaire'] },
  donneesBase:   { lecture: EQUIPE,                                  ecriture: ['admin'] },
  contenus:      { lecture: ['admin'],                               ecriture: ['admin'] },
  stock:         { lecture: ['admin', 'gestionnaire', 'comptable'], ecriture: ['admin', 'gestionnaire'] },
  prestataires:  { lecture: ['admin', 'gestionnaire', 'comptable'], ecriture: ['admin', 'gestionnaire'] },
  logistique:    { lecture: ['admin', 'gestionnaire', 'comptable'], ecriture: ['admin', 'gestionnaire'] },
  finances:      { lecture: ['admin', 'comptable'],                 ecriture: ['admin', 'comptable'] },
  simulateurs:   { lecture: ['admin', 'gestionnaire', 'comptable'], ecriture: ['admin', 'gestionnaire', 'comptable'] },
  nutrition:     { lecture: ['admin', 'nutritionniste'],            ecriture: ['admin', 'nutritionniste'] },
  // Réglages des simulateurs (charges, objectifs, coefficient, marge) : admin et comptable, journalisés (Q 10.4)
  parametres:    { lecture: ['admin', 'comptable'],                 ecriture: ['admin', 'comptable'] },
};

module.exports = { ROLES, EQUIPE, ACCES };
