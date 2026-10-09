// Rôles de l'équipe Ahitché et droits par section du back-office.
// Référence : docs/conception-menu-admin.md (section 3, Rôles) et décision D-17.
//  - admin          : tout (le porteur est l'admin principal)
//  - gestionnaire   : commandes, stock, logistique, prestataires, compléments de la semaine ; ni marges ni finances (D-17).
//                     Un gestionnaire relié à une fiche livreur ne voit que les clients de ses livraisons.
//  - comptable      : finances ; le reste en lecture seule
//  - nutritionniste : nutrition, idées de repas ; les clients et le catalogue en lecture seule
//  - coordinateur   : lecture de toutes les sections de gestion et droits du comptable (finances, paramètres) :
//                     DJEGUI est coordinateur et comptable (D-17)
//  - auditeur       : lecture seule des finances et du stock, compte créé à la demande
//  Idées de repas (D-18) : rédigées par les gestionnaires et le nutritionniste, publiées par l'admin

const ROLES = ['user', 'admin', 'gestionnaire', 'comptable', 'nutritionniste', 'coordinateur', 'auditeur'];
const EQUIPE = ['admin', 'gestionnaire', 'comptable', 'nutritionniste', 'coordinateur', 'auditeur'];

// Pour chaque section : rôles autorisés en lecture (GET) et en écriture (POST, PUT, PATCH, DELETE)
const ACCES = {
  clients:       { lecture: ['admin', 'gestionnaire', 'comptable', 'nutritionniste', 'coordinateur'], ecriture: ['admin'] },
  commandes:     { lecture: ['admin', 'gestionnaire', 'comptable', 'coordinateur'], ecriture: ['admin', 'gestionnaire'] },
  donneesBase:   { lecture: EQUIPE,                                                  ecriture: ['admin'] },
  contenus:      { lecture: ['admin'],                                               ecriture: ['admin'] },
  // Compléments de la semaine (extras du catalogue : photo, description, prix de vente, affichage sur le site)
  complements:   { lecture: ['admin', 'gestionnaire', 'coordinateur'],              ecriture: ['admin', 'gestionnaire'] },
  stock:        { lecture: ['admin', 'gestionnaire', 'comptable', 'coordinateur', 'auditeur'], ecriture: ['admin', 'gestionnaire'] },
  prestataires:  { lecture: ['admin', 'gestionnaire', 'comptable', 'coordinateur'], ecriture: ['admin', 'gestionnaire'] },
  logistique:    { lecture: ['admin', 'gestionnaire', 'comptable', 'coordinateur'], ecriture: ['admin', 'gestionnaire'] },
  finances:      { lecture: ['admin', 'comptable', 'coordinateur', 'auditeur'],     ecriture: ['admin', 'comptable', 'coordinateur'] },
  // Marges et coûts : pas les gestionnaires (D-17) ; la prévision d'achats est un calcul (POST) sans enregistrement
  simulateurs:   { lecture: ['admin', 'comptable', 'coordinateur'],                 ecriture: ['admin', 'comptable', 'coordinateur'] },
  nutrition:     { lecture: ['admin', 'nutritionniste'],                            ecriture: ['admin', 'nutritionniste'] },
  repas:         { lecture: ['admin', 'gestionnaire', 'nutritionniste', 'coordinateur'], ecriture: ['admin', 'gestionnaire', 'nutritionniste'] },
  // Réglages des simulateurs (charges, objectifs, coefficient, marge) : journalisés (Q 10.4)
  parametres:    { lecture: ['admin', 'comptable', 'coordinateur'],                 ecriture: ['admin', 'comptable', 'coordinateur'] },
};

module.exports = { ROLES, EQUIPE, ACCES };
