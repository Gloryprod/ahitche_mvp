const Order = require('../models/order');
const Formule = require('../models/formules');
const User = require('../models/user');
const OrderProductSnapshot = require('../models/orderProductSnapshot');
const { genererReferenceCommande } = require('../services/orderReferenceService');
const { ANNULABLES_PAR_CLIENT } = require('../services/commandeService');
const { prixDeVente } = require('../services/formuleService');
const { lireAchatLibre, preparerLignes, enregistrerAchatLibre } = require('../services/achatLibreService');

const CHAMPS_CLIENT = 'reference formule formuleSlug typeCommande total modePaiement statut creneau dateLivraison paiement.statut createdAt demandesLibres';

// Commande telle que renvoyée au client (liste et réponse à la création) : jamais le coût interne de la course,
// le livreur, les notes internes, l'historique avec les identifiants de l'équipe, ni les prix du catalogue d'un pack.
// Achat libre : ses lignes (au prix VIP, celui que paie le client) et ses demandes libres, sans le motif interne.
function versClient(o, lignes = []) {
    const commande = {
        _id: o._id, reference: o.reference, formule: o.formule, formuleSlug: o.formuleSlug,
        typeCommande: o.typeCommande || 'pack', total: o.total,
        modePaiement: o.modePaiement, statut: o.statut,
        creneau: o.creneau ?? { date: null, periode: null }, dateLivraison: o.dateLivraison ?? null,
        paiement: { statut: o.paiement?.statut ?? 'En attente' }, createdAt: o.createdAt
    };
    if (commande.typeCommande !== 'achat-libre') return commande;
    return {
        ...commande,
        lignes: lignes.map(l => ({ nom: l.name, quantite: l.quantity, unite: l.unit, prixUnitaire: l.unitPrice, total: l.totalPrice })),
        demandesLibres: (o.demandesLibres || []).map(d => ({ _id: d._id, designation: d.designation, quantite: d.quantite, prix: d.prix ?? null, retiree: !!d.retiree }))
    };
}

async function index(req, res){

    try {
        const orders = await Order.find({ userId: req.user.id, deletedAt: null })
            .select(CHAMPS_CLIENT)
            .sort({ createdAt: -1 })
            .lean();
        // Lignes des achats libres seulement (une requête) : celles d'un pack portent le prix du catalogue
        const achatsLibres = orders.filter(o => o.typeCommande === 'achat-libre').map(o => o._id);
        const lignesParCommande = new Map();
        if (achatsLibres.length) {
            const lignes = await OrderProductSnapshot.find({ orderId: { $in: achatsLibres } })
                .select('orderId name quantity unit unitPrice totalPrice').lean();
            for (const l of lignes) {
                const cle = String(l.orderId);
                if (!lignesParCommande.has(cle)) lignesParCommande.set(cle, []);
                lignesParCommande.get(cle).push(l);
            }
        }
        res.status(200).json(orders.map(o => versClient(o, lignesParCommande.get(String(o._id)))));
    } catch (error) {
        console.error("Erreur index commandes client:", error);
        res.status(500).json({ message: "Erreur lors de la récupération des commandes" });
    }
    
}

async function saveOrder(req, res){

    try {
        // Le client n'envoie que la formule (slug ou nom) : le prix est toujours lu en base
        const { formule } = req.body;
        const userId = req.user.id; // Récupéré via le middleware verifyToken

        if (typeof formule !== 'string' || formule.length === 0) {
            return res.status(400).json({ message: "La formule est requise." });
        }

        const formuleInfo = await Formule.findOne({
            $or: [{ slug: formule }, { nom: formule }],
            statut: 'actif'
        });

        if (!formuleInfo) {
            return res.status(404).json({ message: "Cette formule n'est pas disponible à la commande." });
        }

        if (formuleInfo.bientotDisponible) {
            return res.status(409).json({ message: `${formuleInfo.nom} sera bientôt disponible. Choisissez une autre formule en attendant.` });
        }

        // Prix de vente : prix commercial fixé par l'admin, sinon prix officiel
        const total = prixDeVente(formuleInfo);
        if (total === null) {
            return res.status(400).json({ message: "Le prix de cette formule n'est pas encore fixé." });
        }

        if (!total || total <= 0) {
            return res.status(409).json({ message: "Le prix de cette formule n'est pas encore défini. Contactez-nous sur WhatsApp." });
        }

        const nouvelleCommande = new Order({
            userId,
            reference: await genererReferenceCommande(),
            formule: formuleInfo.nom,
            formuleSlug: formuleInfo.slug,
            total,
            statut: 'En attente',
            historique: [{ statut: 'En attente', date: new Date(), par: userId }]
        });

        await nouvelleCommande.save();

        return res.status(201).json({
            message: "Commande enregistrée avec succès !",
            commande: versClient(nouvelleCommande.toObject())
        });
    } catch (error) {
        console.error("Erreur lors de la création de la commande :", error);
        return res.status(500).json({ message: "Erreur interne du serveur." });
    }

}

// POST /api/auth/vip/commande  { lignes: [{ productId, quantite }], demandesLibres: [{ designation, quantite }], notes }
// Comptes VIP seulement. Le serveur vérifie chaque produit et fixe le total (prix VIP) ; les demandes libres
// restent sans prix jusqu'au chiffrage par l'admin. Ensuite, même parcours qu'un pack (WhatsApp, livraison, paiement).
async function saveAchatLibre(req, res) {
    try {
        const compte = await User.findById(req.user.id).select('role vip').lean();
        if (!compte) return res.status(401).json({ message: "Session expirée, reconnectez-vous." });
        if (compte.role !== 'user' || compte.vip?.actif !== true) {
            return res.status(403).json({ message: "Les achats libres sont réservés aux comptes VIP." });
        }

        const lu = lireAchatLibre(req.body);
        if (lu.erreur) return res.status(400).json({ message: lu.erreur });
        const prepa = await preparerLignes(lu.lignes);
        if (prepa.erreur) return res.status(400).json({ message: prepa.erreur });

        // Le client ne fixe jamais de prix : ses demandes libres restent « à chiffrer »
        const { commande, lignes } = await enregistrerAchatLibre({
            userId: req.user.id, snapshots: prepa.snapshots, demandes: lu.demandes, notes: lu.notes, par: req.user.id
        });

        return res.status(201).json({
            message: commande.demandesLibres.length
                ? "Commande enregistrée ! Nous vous confirmons le prix de vos demandes libres sur WhatsApp."
                : "Commande enregistrée avec succès !",
            commande: versClient(commande.toObject(), lignes.map(l => l.toObject()))
        });
    } catch (error) {
        console.error("Erreur saveAchatLibre:", error);
        return res.status(500).json({ message: "Erreur interne du serveur." });
    }
}

async function deleteOrder(req, res) {
    try {
        // On ne cible que les commandes actives appartenant à l'utilisateur connecté
        const order = await Order.findOne({ _id: req.params.id, userId: req.user.id, deletedAt: null });

        if (!order) {
            return res.status(404).json({ message: "Commande non trouvée." });
        }

        // Une fois la préparation commencée, l'annulation passe par l'équipe (WhatsApp)
        if (!ANNULABLES_PAR_CLIENT.includes(order.statut)) {
            return res.status(409).json({ message: `Commande ${order.statut.toLowerCase()} : contactez-nous sur WhatsApp pour l'annuler.` });
        }

        order.statut = 'Annulée';
        order.deletedAt = new Date();
        order.historique.push({ statut: 'Annulée', date: new Date(), par: req.user.id });
        await order.save();

        res.status(200).json({ message: 'Commande annulée.' });
    } catch (error) {
        console.error("Erreur deleteOrder:", error);
        res.status(500).json({ message: "Erreur serveur lors de la suppression de la commande." });
    }   
}

module.exports = {index, saveOrder, saveAchatLibre, deleteOrder};