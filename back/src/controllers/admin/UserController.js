const User = require("../../models/user")
const Order = require("../../models/order")

async function index(req, res) {
    try {
        // 1. Récupération et typage des query params envoyés par Vue
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';

        // 2. Construction dynamique du filtre MongoDB
        // On cible uniquement les clients normaux (role: 'user')
        const query = { role: 'user' };

        // Si une recherche est tapée, on applique un filtre textuel (Insensible à la casse 'i')
        if (search) {
            query.$or = [
                { username: { $regex: search, $options: 'i' } },
                { telephone: { $regex: search, $options: 'i' } },
                { quartier: { $regex: search, $options: 'i' } }
            ];
        }

        // 3. Calcul du nombre de documents à sauter (Skip)
        const skip = (page - 1) * limit;

        // 4. Exécution des requêtes en parallèle pour de meilleures performances
        const [users, totalUsers] = await Promise.all([
            User.find(query)
                .sort({ createdAt: -1 }) // Les plus récents en premier, c'est mieux pour un admin !
                .skip(skip)
                .limit(limit),
            User.countDocuments(query) // Compte le total correspondant au filtre pour la pagination
        ]);

        // 5. Calcul du booléen hasMore (Y a-t-il une page suivante ?)
        const hasMore = skip + users.length < totalUsers;

        // 6. On renvoie l'objet exactement attendu par ton interface TypeScript
        return res.status(200).json({
            users,
            hasMore,
            total: totalUsers // Optionnel : pratique si tu veux afficher "Total : 42 clients"
        });

    } catch (error) {
        console.error("Erreur index users:", error);
        return res.status(500).json({ 
            message: "Erreur lors de la récupération des utilisateurs" 
        });
    }
}

async function getOrders(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const statutFiltre = req.query.statut || 'Toutes';
    const search = req.query.search || '';
    const skip = (page - 1) * limit;

    // 1. Filtre de base
    let query = {};

    if (statutFiltre === 'Annulé') {
      // Une commande est annulée si 'deletedAt' contient une date (n'est pas égal à null)
      query.deletedAt = { $ne: null };
    } else {
      // Pour tous les autres onglets (Toutes, En attente, Livré), 
      // on ne veut STRICTEMENT QUE les commandes actives !
      query.deletedAt = null;

      // Si on est sur un onglet spécifique ('En attente' ou 'Livré')
      if (statutFiltre !== 'Toutes') {
        query.statut = statutFiltre;
      }
    }

    let orders = await Order.find(query)
    .populate(
     [
      {
        path: 'userId',
        select: 'username telephone'
      },
      {
        path: 'productsSnapshot'
      }
    ]
    )
    .sort({ createdAt: -1 });

    // Filtrage côté serveur si une recherche textuelle est soumise sur le nom du client
    if (search) {   
      const searchLower = search.toLowerCase();
      orders = orders.filter(order => 
        order.userId?.username?.toLowerCase().includes(searchLower) ||
        order.statut?.toLowerCase().includes(searchLower)
      );
    }

    // 4. Pagination manuelle suite au filtrage textuel potentiel
    const totalOrders = orders.length;
    const paginatedOrders = orders.slice(skip, skip + limit);
    const hasMore = skip + paginatedOrders.length < totalOrders;

    // 5. Formatage de la réponse
    const formattedOrders = paginatedOrders.map(order => {
      // Formatage de la date en JJ/MM
      const dateObj = new Date(order.createdAt);
      const dateFormatee = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}`;

      return {
        id: order._id,
        userId: order.userId ? order.userId._id : null,
        clientName: order.userId ? order.userId.username : 'Client supprimé',
        whatsapp: order.userId ? order.userId.telephone : 'N/A',
        formule: order.formule,
        total: order.total,
        date: dateFormatee,
        formuleSlug: order.formuleSlug,
        modePaiement: order.modePaiement,
        notes: order.notes,
        statut: order.statut,
        productsSnapshot: order.productsSnapshot || [],
        deletedAt: order.deletedAt
      };
    });

    return res.status(200).json({
      orders: formattedOrders,
      hasMore,
      total: totalOrders
    });

  } catch (error) {
    console.error("Erreur récupération commandes admin:", error);
    return res.status(500).json({ 
      message: "Erreur lors de la récupération des commandes" 
    });
  }
}

module.exports = { index, getOrders };  
