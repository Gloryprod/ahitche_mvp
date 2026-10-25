const Order = require('../../models/order');
const Formule = require('../../models/formules');
const OrderProductSnapshot = require('../../models/orderProductSnapshot');
const mongoose = require('mongoose');
const { consommerStockFIFO } = require('../../services/stockService');
const { genererReferenceCommande } = require('../../services/orderReferenceService');
const { STATUTS } = require('../../models/order');
const User = require('../../models/user');
const Zone = require('../../models/zone');
const { TRANSITIONS, genererCompositionSiAbsente } = require('../../services/commandeService');
const { MODES_PAIEMENT_ACCEPTES, calculerPrixCommande } = require('../../services/prixCommandeService');
const { journaliser } = require('../../services/journalService');
const { ACCES } = require('../../config/roles');
const { livreurDuCompte, clientsDuLivreur, filtreCommandesLivreur } = require('../../services/perimetreService');
const {
  MAX_DEMANDES, nettoyer, demandesAChiffrer, demandesChiffrees, totalAchatLibre, lirePrixDemande, prixVide,
  lireAchatLibre, preparerLignes, enregistrerAchatLibre, catalogueVip
} = require('../../services/achatLibreService');

const formaterFcfa = (n) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
const estAchatLibre = (order) => order?.typeCommande === 'achat-libre';


async function createAdminOrder(req, res) {
  try {
    // Le prix envoyé par le formulaire est ignoré : le serveur impose le prix de la formule (D-10)
    const { client, formuleSlug, modePaiement, notes, productsSnapshot, remise } = req.body;

    if (!client || !mongoose.isValidObjectId(client) || typeof formuleSlug !== 'string' || !Array.isArray(productsSnapshot) || !productsSnapshot.length) {
      return res.status(400).json({ message: "Données manquantes ou panier invalide (client, formule, produits)." });
    }
    if (!MODES_PAIEMENT_ACCEPTES.includes(modePaiement)) {
      return res.status(400).json({ message: "Mode de paiement invalide (Mobile Money ou Espèces)." });
    }

    const formuleInfo = await Formule.findOne({ slug: formuleSlug, statut: 'actif' });
    if (!formuleInfo) {
      return res.status(404).json({ message: `La formule '${formuleSlug}' n'existe pas en base.` });
    }

    const prix = await calculerPrixCommande({ formule: formuleInfo, lignes: productsSnapshot, remise, utilisateur: { id: req.user.id, role: req.user.role } });
    if (prix.erreur) return res.status(400).json({ message: prix.erreur });

    // 3. Générer la référence incrémentale automatique (ex: CMD-001)
    const orderReference = await genererReferenceCommande();

    // 💡 Création anticipée de l'ID de la commande pour lier les snapshots
    const orderId = new mongoose.Types.ObjectId();

    // 4. Composition de la commande, avec les prix du catalogue (jamais ceux du formulaire)
    const snapshotsToCreate = prix.snapshots.map(item => ({ ...item, orderId }));

    // Enregistrement en masse des snapshots
    const savedSnapshots = await OrderProductSnapshot.insertMany(snapshotsToCreate);
    
    // Récupération des IDs générés pour les injecter dans la commande
    const snapshotIds = savedSnapshots.map(snap => snap._id);

    // 5. Instancier et enregistrer la commande avec les références
    const newOrder = new Order({
      _id: orderId, // On force l'ID généré plus haut
      userId: client,
      reference: orderReference,
      formuleSlug: formuleSlug,
      formule: formuleInfo.nom,
      total: prix.total,
      prixFormule: prix.prixFormule,
      montantExtras: prix.montantExtras,
      remise: prix.remise,
      modePaiement: modePaiement,
      notes: typeof notes === 'string' ? notes : '',
      productsSnapshot: snapshotIds, // 🔗 Stockage des IDs référencés
      statut: 'En attente',
      historique: [{ statut: 'En attente', date: new Date(), par: req.user.id }]
    });

    await newOrder.save();
    await journaliser(req, {
      action: 'Création', entite: 'Commande', entiteId: newOrder._id,
      resume: `Commande ${newOrder.reference} saisie dans l'admin : ${formaterFcfa(newOrder.total)}${prix.remise.montant ? ` (remise de ${formaterFcfa(prix.remise.montant)} ${prix.remise.statut === 'Validée' ? 'validée' : 'à valider'} : ${prix.remise.motif})` : ''}`
    });

    return res.status(201).json({
      message: "Commande enregistrée avec succès !",
      order: newOrder
    });

  } catch (error) {
    console.error("Erreur createAdminOrder:", error);
    return res.status(500).json({ message: "Erreur interne lors de la création de la commande." });
  }
}

async function updateAdminOrder(req, res) {
  try {
    const { id } = req.params; // L'ID de la commande envoyé dans l'URL
    const { client, formuleSlug, modePaiement, notes, productsSnapshot, remise } = req.body;

    if (!client || !mongoose.isValidObjectId(client) || typeof formuleSlug !== 'string' || !Array.isArray(productsSnapshot) || !productsSnapshot.length) {
      return res.status(400).json({ message: "Données manquantes ou panier invalide." });
    }
    if (!MODES_PAIEMENT_ACCEPTES.includes(modePaiement)) {
      return res.status(400).json({ message: "Mode de paiement invalide (Mobile Money ou Espèces)." });
    }

    // 2. Vérifier si la commande existe
    const order = mongoose.isValidObjectId(id) ? await Order.findById(id) : null;
    if (!order) {
      return res.status(404).json({ message: "Commande introuvable." });
    }
    // Un achat libre VIP n'a pas de formule : son prix ne se recalcule jamais comme celui d'un pack
    if (estAchatLibre(order)) {
      return res.status(409).json({ message: "Un achat libre VIP ne se modifie pas avec le formulaire d'un pack : chiffrez ou retirez ses demandes libres." });
    }

    // 3. Récupérer les informations de la formule (au cas où elle a changé)
    const formuleInfo = await Formule.findOne({ slug: formuleSlug });
    if (!formuleInfo) {
      return res.status(404).json({ message: `La formule '${formuleSlug}' n'existe pas en base.` });
    }

    if (['Livrée', 'Annulée'].includes(order.statut) || order.paiement?.statut === 'Payé') {
      return res.status(400).json({ message: "Une commande livrée, payée ou annulée ne se modifie plus." });
    }

    const prix = await calculerPrixCommande({
      formule: formuleInfo, lignes: productsSnapshot, remise,
      utilisateur: { id: req.user.id, role: req.user.role },
      remiseExistante: order.remise?.toObject ? order.remise.toObject() : order.remise
    });
    if (prix.erreur) return res.status(400).json({ message: prix.erreur });

    // 4. Remplacer la composition par celle du panier mis à jour (prix du catalogue)
    await OrderProductSnapshot.deleteMany({ orderId: id });
    const snapshotsToCreate = prix.snapshots.map(item => ({ ...item, orderId: id }));

    const savedSnapshots = await OrderProductSnapshot.insertMany(snapshotsToCreate);
    const newSnapshotIds = savedSnapshots.map(snap => snap._id);

    // 6. Mettre à jour la commande principale
    order.userId = client;
    order.reference = order.reference || await genererReferenceCommande();
    order.formuleSlug = formuleSlug;
    order.formule = formuleInfo.nom;
    order.total = prix.total;
    order.prixFormule = prix.prixFormule;
    order.montantExtras = prix.montantExtras;
    order.remise = prix.remise;
    order.modePaiement = modePaiement;
    order.notes = typeof notes === 'string' ? notes : '';
    order.productsSnapshot = newSnapshotIds;

    await order.save();
    await journaliser(req, { action: 'Modification', entite: 'Commande', entiteId: order._id, resume: `Commande ${order.reference} modifiée : ${formaterFcfa(order.total)}` });

    return res.status(200).json({
      message: "Commande mise à jour avec succès !",
      order
    });

  } catch (error) {
    console.error("Erreur updateAdminOrder:", error);
    return res.status(500).json({ message: "Erreur interne lors de la modification de la commande." });
  }
}

// Optionnel : Récupérer la liste de toutes les commandes actives
async function getAllOrders(req, res) {
  try {
    const orders = await Order.find({ deletedAt: null })
      .populate('userId', 'username telephone email') // Récupérer les profils clients liés
      .sort({ createdAt: -1 }); // De la plus récente à la plus ancienne

    return res.status(200).json(orders);
  } catch (error) {
    console.error("Erreur getAllOrders:", error);
    return res.status(500).json({ message: "Erreur lors du chargement des commandes." });
  }
}

// Erreur métier : message affiché tel quel à l'équipe (400)
class ErreurStatut extends Error {}

async function updateOrderStatus(req, res) {
  const { statut, referencePaiement, notePaiement } = req.body;

  if (!STATUTS.includes(statut)) {
    return res.status(400).json({ message: "Statut inconnu." });
  }
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Commande introuvable." });
  }

  // Transaction : changement de statut et sortie de stock FIFO réussissent ou échouent ensemble
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await Order.findById(req.params.id).session(session);
    if (!order) throw Object.assign(new ErreurStatut("Commande introuvable."), { code: 404 });

    if (!(TRANSITIONS[order.statut] || []).includes(statut)) {
      throw new ErreurStatut(`Passage de « ${order.statut} » à « ${statut} » impossible.`);
    }

    if (statut === 'Confirmée') {
      // Après un échec de livraison, la commande repart en planification (nouveau créneau, nouveau livreur)
      if (order.statut === 'Échec') {
        order.creneau = { date: null, periode: null };
        order.livreurId = null;
      }
      // Achat libre VIP : chaque demande libre doit être chiffrée ou retirée, et il doit rester quelque chose à livrer
      if (estAchatLibre(order)) {
        const aChiffrer = demandesAChiffrer(order.demandesLibres);
        if (aChiffrer) {
          throw new ErreurStatut(`Achat libre : chiffrez ou retirez d'abord ${aChiffrer > 1 ? `les ${aChiffrer} demandes libres en attente` : 'la demande libre en attente'}.`);
        }
        if (!order.productsSnapshot?.length && !demandesChiffrees(order.demandesLibres).length) {
          throw new ErreurStatut("Achat libre sans produit ni demande chiffrée : rien à livrer. Annulez la commande.");
        }
      }
      // Zone de livraison du client, et composition du pack pour les commandes passées par le client
      if (!order.zone) {
        const client = await User.findById(order.userId).select('zone').session(session);
        order.zone = client?.zone || null;
      }
      await genererCompositionSiAbsente(order, session);
    }

    if (statut === 'En livraison' && (!order.creneau?.date || !order.livreurId)) {
      throw new ErreurStatut("Planifiez d'abord le créneau et le livreur (section Logistique).");
    }

    if (statut === 'Livrée') {
      // Paiement à la livraison : référence Mobile Money, ou note pour les cas particuliers
      const reference = typeof referencePaiement === 'string' ? referencePaiement.trim() : '';
      const note = typeof notePaiement === 'string' ? notePaiement.trim() : '';
      if (order.modePaiement === 'Mobile Money' && !reference) {
        throw new ErreurStatut("La référence de la transaction Mobile Money est obligatoire.");
      }
      if (order.modePaiement !== 'Mobile Money' && !note) {
        throw new ErreurStatut(`Paiement « ${order.modePaiement} » : une note expliquant le cas est obligatoire.`);
      }

      const maintenant = new Date();
      order.paiement = { statut: 'Payé', reference, note, date: maintenant };
      order.dateLivraison = maintenant;

      const zone = order.zone ? await Zone.findOne({ code: order.zone }).session(session) : null;
      order.coutLivraison = zone?.tarifCourse || 0;

      // Sortie de stock FIFO de tous les produits (fixes et extras) de la commande. Achat libre : ses lignes au prix VIP
      // sortent de la même façon ; ses demandes libres chiffrées se livrent sans toucher au stock.
      const orderProducts = await OrderProductSnapshot.find({ orderId: order._id }).session(session);
      if (estAchatLibre(order) && demandesAChiffrer(order.demandesLibres)) {
        throw new ErreurStatut("Achat libre : une demande libre n'est ni chiffrée ni retirée.");
      }
      const demandesALivrer = estAchatLibre(order) ? demandesChiffrees(order.demandesLibres).length : 0;
      if (!orderProducts.length && !demandesALivrer) {
        throw new ErreurStatut("Impossible de valider une commande sans produits associés.");
      }
      for (const item of orderProducts) {
        await consommerStockFIFO(item.productId, item.quantity, `Livraison de la commande ${order.reference}`, session);
      }
    }

    if (statut === 'Annulée') {
      order.deletedAt = new Date();
    }

    order.statut = statut;
    order.historique.push({ statut, date: new Date(), par: req.user.id });
    const updatedOrder = await order.save({ session });

    await session.commitTransaction();
    return res.status(200).json({
      message: `Commande ${order.reference} : ${statut}.`,
      order: updatedOrder
    });

  } catch (error) {
    // En cas d'erreur ou de stock insuffisant, on annule tous les changements (Rollback)
    await session.abortTransaction();

    if (error instanceof ErreurStatut) {
      return res.status(error.code || 400).json({ message: error.message });
    }
    // Rupture de stock signalée par le service FIFO
    if (error.message?.includes("Stock insuffisant")) {
      return res.status(400).json({ message: error.message });
    }

    console.error("Erreur updateOrderStatus:", error);
    return res.status(500).json({ message: "Erreur interne lors de la mise à jour du statut." });
  } finally {
    session.endSession();
  }
}

async function deleteAdminOrder(req, res) {
  try {
    const { id } = req.params;

    // Marquer la commande comme supprimée à la date actuelle
    const deletedOrder = await Order.findByIdAndUpdate(
      id,
      { deletedAt: new Date() },
      { returnDocument: 'after' }
    );
    
    if (!deletedOrder) {
      return res.status(404).json({ message: "Commande introuvable." });
    }

    await deletedOrder.save();

    return res.status(200).json({
      message: "Commande supprimée avec succès (archivée) !"
    });

  } catch (error) {
    console.error("Erreur deleteAdminOrder:", error);
    return res.status(500).json({ message: "Erreur interne lors de la suppression de la commande." });
  }
}

// PATCH /api/admin/orders/:id/remise  { decision: "valider" | "refuser" } : réservé à l'admin (D-10)
async function deciderRemise(req, res) {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: "Seul l'admin valide ou refuse une remise." });
    const decision = req.body?.decision;
    if (!['valider', 'refuser'].includes(decision)) return res.status(400).json({ message: "Décision invalide (valider ou refuser)." });

    const order = mongoose.isValidObjectId(req.params.id) ? await Order.findOne({ _id: req.params.id, deletedAt: null }) : null;
    if (!order) return res.status(404).json({ message: "Commande introuvable." });
    if (estAchatLibre(order)) return res.status(400).json({ message: "Pas de remise sur un achat libre VIP : son prix vient des prix VIP et du chiffrage des demandes." });
    if (order.remise?.statut !== 'À valider') return res.status(400).json({ message: "Aucune remise en attente sur cette commande." });
    if (order.paiement?.statut === 'Payé') return res.status(400).json({ message: "La commande est déjà payée." });

    const brut = (order.prixFormule ?? order.total) + (order.montantExtras || 0);
    order.remise.statut = decision === 'valider' ? 'Validée' : 'Refusée';
    order.remise.valideePar = req.user.id;
    order.remise.valideeLe = new Date();
    order.total = brut - (decision === 'valider' ? order.remise.montant : 0);
    await order.save();
    await journaliser(req, {
      action: 'Validation', entite: 'Commande', entiteId: order._id,
      resume: `Remise de ${formaterFcfa(order.remise.montant)} ${decision === 'valider' ? 'validée' : 'refusée'} sur ${order.reference} (${order.remise.motif}) : total ${formaterFcfa(order.total)}`
    });
    return res.status(200).json({ message: decision === 'valider' ? 'Remise validée.' : 'Remise refusée.', order });
  } catch (error) {
    console.error("Erreur deciderRemise:", error);
    return res.status(500).json({ message: "Erreur lors de la décision sur la remise." });
  }
}

// Statuts où les demandes libres d'un achat libre se chiffrent encore : avant le départ en livraison
const CHIFFRABLES = ['En attente', 'Confirmée', 'En préparation', 'Échec'];

// Demandes libres renvoyées à l'équipe (écran Commandes)
const versEquipe = (d) => ({ _id: d._id, designation: d.designation, quantite: d.quantite, prix: d.prix ?? null, retiree: !!d.retiree, motif: d.motif || '' });

// PATCH /api/admin/orders/:id/demandes  { demandes: [{ _id, prix } | { _id, retiree: true, motif }] } : écriture de la
// section « vip » (admin seulement).
// Fixe le prix (FCFA) de demandes libres d'un achat libre VIP, ou les retire avec un motif ; le total est recalculé
// (lignes au prix VIP + demandes chiffrées) et journalisé. Une demande chiffrée ou retirée ne redevient jamais
// « à chiffrer » : la confirmation reste acquise.
async function chiffrerDemandes(req, res) {
  try {
    if (!ACCES.vip.ecriture.includes(req.user.role)) return res.status(403).json({ message: "Seul l'admin chiffre ou retire les demandes libres." });
    const recues = req.body?.demandes;
    if (!Array.isArray(recues) || !recues.length || recues.length > MAX_DEMANDES) {
      return res.status(400).json({ message: "Indiquez les demandes libres à chiffrer ou à retirer." });
    }

    const order = mongoose.isValidObjectId(req.params.id) ? await Order.findOne({ _id: req.params.id, deletedAt: null }) : null;
    if (!order) return res.status(404).json({ message: "Commande introuvable." });
    if (!estAchatLibre(order)) return res.status(400).json({ message: "Cette commande n'est pas un achat libre VIP." });
    if (!CHIFFRABLES.includes(order.statut) || order.paiement?.statut === 'Payé') {
      return res.status(400).json({ message: `Commande « ${order.statut} » : ses demandes libres ne se modifient plus.` });
    }

    // Tout est vérifié avant la moindre modification
    const vues = new Set();
    const decisions = [];
    for (const r of recues) {
      if (!r || typeof r !== 'object') return res.status(400).json({ message: "Demande libre invalide." });
      const id = r._id ?? r.id;
      const demande = mongoose.isValidObjectId(id) ? order.demandesLibres.id(id) : null;
      if (!demande) return res.status(400).json({ message: "Demande libre introuvable sur cette commande." });
      if (vues.has(String(demande._id))) return res.status(400).json({ message: `« ${demande.designation} » apparaît deux fois.` });
      vues.add(String(demande._id));

      if (r.retiree === true) {
        if (r.motif !== undefined && r.motif !== null && typeof r.motif !== 'string') return res.status(400).json({ message: "Motif invalide." });
        const motif = nettoyer(r.motif);
        if (motif.length < 3 || motif.length > 300) {
          return res.status(400).json({ message: `Indiquez le motif du retrait de « ${demande.designation} » (3 à 300 caractères).` });
        }
        decisions.push({ demande, retiree: true, prix: null, motif });
      } else {
        if (r.retiree !== undefined && r.retiree !== false) return res.status(400).json({ message: "Retrait : oui ou non." });
        const { prix, erreur } = lirePrixDemande(r.prix);
        if (erreur) {
          return res.status(400).json({ message: `Indiquez le prix de « ${demande.designation} » en FCFA (0 ou plus).` });
        }
        decisions.push({ demande, retiree: false, prix, motif: '' });
      }
    }

    const avant = { total: order.total, demandesLibres: order.demandesLibres.map(versEquipe) };
    const changements = [];
    for (const { demande, retiree, prix, motif } of decisions) {
      if (retiree && (!demande.retiree || demande.motif !== motif)) changements.push(`« ${demande.designation} » retirée (${motif})`);
      if (!retiree && (demande.retiree || demande.prix !== prix)) changements.push(`« ${demande.designation} » chiffrée ${formaterFcfa(prix)}`);
      Object.assign(demande, { retiree, prix, motif });
    }

    const reponse = () => ({
      id: order._id, reference: order.reference, total: order.total,
      demandesLibres: order.demandesLibres.map(versEquipe), demandesAChiffrer: demandesAChiffrer(order.demandesLibres)
    });
    if (!changements.length) return res.status(200).json({ message: "Aucune modification.", order: reponse() });

    const lignes = await OrderProductSnapshot.find({ orderId: order._id }).select('totalPrice').lean();
    order.total = totalAchatLibre(lignes, order.demandesLibres);
    await order.save();
    await journaliser(req, {
      action: 'Modification', entite: 'Commande', entiteId: order._id,
      resume: `Achat libre ${order.reference} : ${changements.join(' ; ')} ; total ${formaterFcfa(avant.total)} → ${formaterFcfa(order.total)}`,
      avant, apres: { total: order.total, demandesLibres: order.demandesLibres.map(versEquipe) }
    });
    const restantes = demandesAChiffrer(order.demandesLibres);
    return res.status(200).json({
      message: `Demandes enregistrées : total ${formaterFcfa(order.total)}${restantes ? ` (${restantes} encore à chiffrer)` : ''}.`,
      order: reponse()
    });
  } catch (error) {
    console.error("Erreur chiffrerDemandes:", error);
    return res.status(500).json({ message: "Erreur lors du chiffrage des demandes libres." });
  }
}

// PATCH /api/admin/orders/:id/paiement  { modePaiement: 'Mobile Money' | 'Espèces' } : écriture de la section Commandes.
// Achat libre seulement (un pack se modifie dans son formulaire), avant le paiement : livrée, payée, annulée ou
// supprimée, la commande ne change plus. Un gestionnaire livreur ne modifie que les commandes de son périmètre.
async function changerModePaiement(req, res) {
  try {
    const modePaiement = req.body?.modePaiement;
    if (!MODES_PAIEMENT_ACCEPTES.includes(modePaiement)) {
      return res.status(400).json({ message: "Mode de paiement invalide (Mobile Money ou Espèces)." });
    }
    const order = mongoose.isValidObjectId(req.params.id) ? await Order.findById(req.params.id) : null;
    if (!order) return res.status(404).json({ message: "Commande introuvable." });
    if (!estAchatLibre(order)) {
      return res.status(400).json({ message: "Pour un pack, le mode de paiement se change dans le formulaire de la commande." });
    }
    if (order.deletedAt || ['Livrée', 'Annulée'].includes(order.statut) || order.paiement?.statut === 'Payé') {
      return res.status(400).json({ message: "Commande livrée, payée, annulée ou supprimée : son mode de paiement ne se modifie plus." });
    }
    const livreurId = await livreurDuCompte(req);
    if (livreurId && !(await Order.exists({ _id: order._id, ...filtreCommandesLivreur(livreurId) }))) {
      return res.status(403).json({ message: "Cette commande ne fait pas partie de vos livraisons." });
    }

    const reponse = { id: order._id, reference: order.reference, modePaiement };
    if (order.modePaiement === modePaiement) return res.status(200).json({ message: "Aucune modification.", order: reponse });

    const avant = order.modePaiement;
    order.modePaiement = modePaiement;
    await order.save();
    await journaliser(req, {
      action: 'Modification', entite: 'Commande', entiteId: order._id,
      resume: `Achat libre ${order.reference} : mode de paiement ${avant} → ${modePaiement}`,
      avant: { modePaiement: avant }, apres: { modePaiement }
    });
    return res.status(200).json({ message: `${order.reference} : paiement en ${modePaiement}.`, order: reponse });
  } catch (error) {
    console.error("Erreur changerModePaiement:", error);
    return res.status(500).json({ message: "Erreur lors du changement du mode de paiement." });
  }
}

// ------------------------------------------------------------------
// Achat libre VIP saisi par l'équipe au nom d'un client VIP (cahier, partie C) : admin et gestionnaires (écriture de
// la section Commandes, routes/admin.js). Mêmes contrôles et même calcul que la commande du client ; seul l'admin
// chiffre des demandes libres dès la saisie. Un gestionnaire relié à une fiche livreur ne voit et ne sert que les
// clients de son périmètre (services/perimetreService.js).
// ------------------------------------------------------------------

// Clients VIP actifs ; pour un gestionnaire livreur, seulement ceux de ses livraisons et des commandes à planifier
async function filtreClientsVip(req) {
  const filtre = { role: 'user', 'vip.actif': true };
  const livreurId = await livreurDuCompte(req);
  if (livreurId) filtre._id = { $in: await clientsDuLivreur(livreurId) };
  return filtre;
}

// GET /api/admin/commandes/achat-libre/clients -> { clients: [{ _id, nom, telephone, quartier, zone, zoneNom }] }
async function clientsAchatLibre(req, res) {
  try {
    const clients = await User.find(await filtreClientsVip(req)).select('username telephone quartier zone').sort({ username: 1 }).lean();
    const codes = [...new Set(clients.map(c => c.zone).filter(Boolean))];
    const zones = new Map((codes.length ? await Zone.find({ code: { $in: codes } }).select('code nom').lean() : []).map(z => [z.code, z.nom]));
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      clients: clients.map(c => ({
        _id: c._id, nom: c.username, telephone: c.telephone || '', quartier: c.quartier || '',
        zone: c.zone || null, zoneNom: zones.get(c.zone) || ''
      }))
    });
  } catch (error) {
    console.error("Erreur clientsAchatLibre:", error);
    return res.status(500).json({ message: "Erreur lors du chargement des clients VIP." });
  }
}

// GET /api/admin/commandes/achat-libre/catalogue -> { produits: [...] }, même forme que GET /api/auth/vip/catalogue :
// prix VIP seulement, jamais le prix du catalogue ni le coefficient
async function catalogueAchatLibre(req, res) {
  try {
    const produits = await catalogueVip();
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({ produits });
  } catch (error) {
    console.error("Erreur catalogueAchatLibre:", error);
    return res.status(500).json({ message: "Erreur lors du chargement des produits." });
  }
}

// POST /api/admin/commandes/achat-libre
//   { client, lignes: [{ productId, quantite }], demandesLibres: [{ designation, quantite, prix? }], notes, modePaiement? }
// Prix VIP des lignes fixés par le serveur ; prix d'une demande libre accepté de l'admin seulement (vide = à chiffrer) ;
// total = lignes + demandes chiffrées ; référence CMD-xxx, « En attente » ; création journalisée avec son auteur.
async function creerAchatLibre(req, res) {
  try {
    const corps = req.body || {};
    if (!mongoose.isValidObjectId(corps.client)) return res.status(400).json({ message: "Choisissez le client VIP." });
    if (!prixVide(corps.modePaiement) && !MODES_PAIEMENT_ACCEPTES.includes(corps.modePaiement)) {
      return res.status(400).json({ message: "Mode de paiement invalide (Mobile Money ou Espèces)." });
    }

    const lu = lireAchatLibre(corps);
    if (lu.erreur) return res.status(400).json({ message: lu.erreur });

    // Prix des demandes libres : l'admin seulement ; un prix laissé vide garde la demande « à chiffrer »
    const prixRecus = (corps.demandesLibres || []).map(d => d.prix);
    if (prixRecus.some(p => !prixVide(p)) && !ACCES.vip.ecriture.includes(req.user.role)) {
      return res.status(403).json({ message: "Seul l'admin fixe le prix d'une demande libre : laissez le prix vide, l'admin la chiffrera ensuite." });
    }
    const demandes = [];
    for (const [i, demande] of lu.demandes.entries()) {
      if (prixVide(prixRecus[i])) { demandes.push({ ...demande, prix: null }); continue; }
      const { prix, erreur } = lirePrixDemande(prixRecus[i]);
      if (erreur) return res.status(400).json({ message: `Prix de « ${demande.designation} » : FCFA, 0 ou plus (ou vide pour le chiffrer plus tard).` });
      demandes.push({ ...demande, prix });
    }

    // Client : dans le périmètre d'un gestionnaire livreur, compte client, statut VIP actif
    const livreurId = await livreurDuCompte(req);
    if (livreurId && !(await clientsDuLivreur(livreurId)).some(id => String(id) === String(corps.client))) {
      return res.status(403).json({ message: "Ce client ne fait pas partie de vos livraisons." });
    }
    const client = await User.findById(corps.client).select('username role vip').lean();
    if (!client) return res.status(404).json({ message: "Client introuvable." });
    if (client.role !== 'user') return res.status(400).json({ message: "Ce compte n'est pas un compte client." });
    if (client.vip?.actif !== true) {
      return res.status(400).json({ message: "Ce client n'a pas le statut VIP : l'achat libre lui est fermé (proposez-lui un pack)." });
    }

    const prepa = await preparerLignes(lu.lignes);
    if (prepa.erreur) return res.status(400).json({ message: prepa.erreur });

    const { commande, lignes } = await enregistrerAchatLibre({
      userId: client._id, snapshots: prepa.snapshots, demandes, notes: lu.notes, par: req.user.id,
      modePaiement: prixVide(corps.modePaiement) ? undefined : corps.modePaiement
    });
    const nbDemandes = commande.demandesLibres.length;
    const aChiffrer = demandesAChiffrer(commande.demandesLibres);
    await journaliser(req, {
      action: 'Création', entite: 'Commande', entiteId: commande._id,
      resume: `Achat libre ${commande.reference} saisi pour ${client.username} : ${lignes.length} ligne(s), ${nbDemandes} demande(s) libre(s)${aChiffrer ? ` dont ${aChiffrer} à chiffrer` : ''}, total ${formaterFcfa(commande.total)}`,
      apres: { client: String(client._id), lignes: lignes.length, demandesLibres: nbDemandes, aChiffrer, total: commande.total }
    });

    return res.status(201).json({
      message: `Achat libre ${commande.reference} enregistré pour ${client.username}${aChiffrer ? ` : ${aChiffrer > 1 ? `${aChiffrer} demandes libres` : '1 demande libre'} à chiffrer par l'admin` : ''}.`,
      order: {
        id: commande._id, reference: commande.reference, typeCommande: commande.typeCommande,
        formule: commande.formule, formuleSlug: commande.formuleSlug, statut: commande.statut,
        total: commande.total, modePaiement: commande.modePaiement,
        client: { _id: client._id, nom: client.username },
        lignes: lignes.map(l => ({ nom: l.name, quantite: l.quantity, unite: l.unit, prixUnitaire: l.unitPrice, total: l.totalPrice, isExtra: l.isExtra })),
        demandesLibres: commande.demandesLibres.map(versEquipe),
        demandesAChiffrer: aChiffrer
      }
    });
  } catch (error) {
    console.error("Erreur creerAchatLibre:", error);
    return res.status(500).json({ message: "Erreur lors de l'enregistrement de l'achat libre." });
  }
}

module.exports = {
  deciderRemise,
  chiffrerDemandes,
  changerModePaiement,
  clientsAchatLibre,
  catalogueAchatLibre,
  creerAchatLibre,
  createAdminOrder,
  getAllOrders,
  updateAdminOrder,
  updateOrderStatus,
  deleteAdminOrder
};