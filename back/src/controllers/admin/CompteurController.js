const Order = require('../../models/order');
const { Avis } = require('../../models/avis');
const { ACCES } = require('../../config/roles');
const { livreurDuCompte, filtreCommandesLivreur } = require('../../services/perimetreService');

// GET /api/admin/compteurs -> { commandesEnAttente?: number, avisAValider?: number }
// Pastilles du menu admin. Chaque clé n'est présente que si le rôle connecté peut lire la section correspondante
// (config/roles.js) ; un gestionnaire relié à une fiche livreur ne compte que les commandes de son périmètre.
async function compteurs(req, res) {
  try {
    const role = req.user.role;
    const lireCommandes = ACCES.commandes.lecture.includes(role);
    const lireAvis = ACCES.avis.lecture.includes(role);

    let filtreCommandes = null;
    if (lireCommandes) {
      filtreCommandes = { statut: 'En attente', deletedAt: null };
      const livreurId = await livreurDuCompte(req);
      if (livreurId) Object.assign(filtreCommandes, filtreCommandesLivreur(livreurId));
    }

    const [commandesEnAttente, avisAValider] = await Promise.all([
      filtreCommandes ? Order.countDocuments(filtreCommandes) : null,
      lireAvis ? Avis.countDocuments({ statut: 'À valider' }) : null
    ]);

    const reponse = {};
    if (lireCommandes) reponse.commandesEnAttente = commandesEnAttente;
    if (lireAvis) reponse.avisAValider = avisAValider;

    res.set('Cache-Control', 'no-store');
    return res.status(200).json(reponse);
  } catch (error) {
    console.error("Erreur compteurs:", error);
    return res.status(500).json({ message: "Erreur lors du chargement des compteurs." });
  }
}

module.exports = { compteurs };
