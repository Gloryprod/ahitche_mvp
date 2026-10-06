// Rôles de l'équipe Ahitché et droits par section du back-office.
// Référence : docs/conception-menu-admin.md (section 3, Rôles) et décision D-17.
//  - admin          : tout (le porteur est l'admin principal)
//  - gestionnaire   : commandes, stock, logistique, prestataires ; ni marges ni finances (D-17).
//                     Un gestionnaire relié à une fiche livreur ne voit que les clients de ses livraisons.
//  - comptable      : finances ; le reste en lecture seule
//  - nutritionniste : nutrition, idées de repas ; les clients et le catalogue en lecture seule
//  - coordinateur   : lecture seule de toutes les sections de gestion (rapport financier mensuel) ;
//                     droits proposés, à confirmer par le porteur
//  - auditeur       : lecture seule des finances et du stock, compte créé à la demande

const ROLES = ['user', 'admin', 'gestionnaire', 'comptable', 'nutritionniste', 'coordinateur', 'auditeur'];
const EQUIPE = ['admin', 'gestionnaire', 'comptable', 'nutritionniste', 'coordinateur', 'auditeur'];

// Pour chaque section : rôles autorisés en lecture (GET) et en écriture (POST, PUT, PATCH, DELETE)
const ACCES = {
  clients:       { lecture: ['admin', 'gestionnaire', 'comptable', 'nutritionniste', 'coordinateur'], ecriture: ['admin'] },
  commandes:     { lecture: ['admin', 'gestionnaire', 'comptable', 'coordinateur'], ecriture: ['admin', 'gestionnaire'] },
  donneesBase:   { lecture: EQUIPE,                                                  ecriture: ['admin'] },
  contenus:      { lecture: ['admin'],                                               ecriture: ['admin'] },
  stock:         { lecture: ['admin', 'gestionnaire', 'comptable', 'coordinateur', 'auditeur'], ecriture: ['admin', 'gestionnaire'] },
  prestataires:  { lecture: ['admin', 'gestionnaire', 'comptable', 'coordinateur'], ecriture: ['admin', 'gestionnaire'] },
  logistique:    { lecture: ['admin', 'gestionnaire', 'comptable', 'coordinateur'], ecriture: ['admin', 'gestionnaire'] },
  finances:      { lecture: ['admin', 'comptable', 'coordinateur', 'auditeur'],     ecriture: ['admin', 'comptable'] },
  // Marges et coûts : pas les gestionnaires (D-17) ; la prévision d'achats est un calcul (POST) sans enregistrement
  simulateurs:   { lecture: ['admin', 'comptable', 'coordinateur'],                 ecriture: ['admin', 'comptable', 'coordinateur'] },
  nutrition:     { lecture: ['admin', 'nutritionniste'],                            ecriture: ['admin', 'nutritionniste'] },
  // Réglages des simulateurs (charges, objectifs, coefficient, marge) : journalisés (Q 10.4)
  parametres:    { lecture: ['admin', 'comptable', 'coordinateur'],                 ecriture: ['admin', 'comptable'] },
};

module.exports = { ROLES, EQUIPE, ACCES };
