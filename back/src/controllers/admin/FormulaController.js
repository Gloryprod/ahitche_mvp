const Product = require('../../models/product');
const Formule = require('../../models/formules');

// Générer dynamiquement la composition et le prix d'un pack spécifique
// async function getPackDetails(req, res) {
//   try {
//     const { packType } = req.params; // 'essentiel', 'equilibre' ou 'confort'
    
//     if (!['essentiel', 'equilibre', 'confort'].includes(packType.toLowerCase())) {
//       return res.status(400).json({ message: "Type de pack invalide. Choisissez entre essentiel, equilibre et confort." });
//     }

//     const type = packType.toLowerCase();

//     // Récupérer la formule correspondante en base de données via son slug
//     // On assume que tes slugs sont nommés par exemple : "ahi-essentiel", "ahi-equilibre", "ahi-confort"
//     const formuleData = await Formule.findOne({ slug: `ahi-${type}`, statut: 'actif' });

//     if (!formuleData) {
//       return res.status(404).json({ message: `Configuration de la formule pour ${packType} introuvable.` });
//     }

//     // Récupérer tous les produits non supprimés avec leurs règles associées
//     const products = await Product.find({ deletedAt: null })
//       .populate('category', 'name')
//       .populate('compositionRule');

//     let totalPackPrice = 0;
    
//     // Construire la liste des produits avec les quantités et prix spécifiques au pack
//     const packItems = products.map(product => {
//       let multiplier = 1;

//       // Détermination du multiplicateur selon la formule choisie
//       if (type === 'equilibre') {
//         multiplier = product.compositionRule ? product.compositionRule.multiplierEquilibre : 2;
//       } else if (type === 'confort') {
//         multiplier = product.compositionRule ? product.compositionRule.multiplierConfort : 5;
//       } else {
//         // Pour le pack Essentiel, l'Huile de palme est un cas spécial (absente -> quantité = 0)
//         if (product.name.toLowerCase().includes('palme')) {
//           multiplier = 0;
//         } else {
//           multiplier = 1;
//         }
//       }

//       const finalQuantity = product.baseQuantity * multiplier;
//       const finalPrice = finalQuantity * product.priceUnit;
      
//       totalPackPrice += finalPrice;

//       return {
//         productId: product._id,
//         name: product.name,
//         category: product.category?.name || 'Autre',
//         unit: product.unit,
//         priceUnit: product.priceUnit,
//         appliedMultiplier: multiplier,
//         quantity: finalQuantity,
//         totalPrice: finalPrice
//       };
//     });

//     // 4. Calculer dynamiquement l'ancien prix de manière proportionnelle
//     // Exemple : Si l'actuel est 18 540 et qu'on veut garder le même ratio d'affichage que la valeur d'origine
//     const ratioAncienPrix = formuleData.ancienPrix / formuleData.prixActuel;
//     const dynamicAncienPrix = Math.round(totalPackPrice * ratioAncienPrix);

//     // 5. MODIFICATION ET SAUVEGARDE EN BASE DE DONNÉES
//     formuleData.prixActuel = totalPackPrice;
//     formuleData.ancienPrix = dynamicAncienPrix;
    
//     await formuleData.save();

//     return res.status(200).json({
//       formule: formuleData,
//       itemCount: packItems.filter(item => item.quantity > 0).length,
//       items: packItems
//     });
//   } catch (error) {
//     console.error("Erreur getPackDetails:", error);
//     return res.status(500).json({ message: "Erreur lors de la génération du pack." });
//   }
// }

// Générer dynamiquement la composition et le prix d'un pack spécifique
async function getPackDetails(req, res) {
  try {
    const { packType } = req.params; // 'essentiel', 'equilibre', 'confort', 'reserve' ou 'fraicheur'
    const allowedPacks = ['essentiel', 'equilibre', 'confort', 'reserve', 'fraicheur'];
    
    if (!allowedPacks.includes(packType.toLowerCase())) {
      return res.status(400).json({ message: "Type de pack invalide. Choisissez entre : essentiel, equilibre, confort, reserve ou fraicheur." });
    }

    const type = packType.toLowerCase();

    // Récupérer la formule correspondante en base de données via son slug
    const formuleData = await Formule.findOne({ slug: `ahi-${type}`, statut: 'actif' });

    if (!formuleData) {
      return res.status(404).json({ message: `Configuration de la formule pour ${packType} introuvable.` });
    }

    // Récupérer tous les produits non supprimés avec leurs règles associées
    const products = await Product.find({ deletedAt: null })
      .populate('category', 'name')
      .populate('compositionRule');

    let totalPackPrice = 0;
    
    // Construire la liste des produits avec les quantités et prix spécifiques au pack
    const packItems = [];

    for (const product of products) {
      let multiplier = 1;
      let finalQuantity = 0;

      // --- LOGIQUE DES TROIS PREMIERS PACKS (Inchangée pour ne rien casser) ---
      if (['essentiel', 'equilibre', 'confort'].includes(type)) {
        if (type === 'equilibre') {
          multiplier = product.compositionRule ? product.compositionRule.multiplierEquilibre : 2;
        } else if (type === 'confort') {
          multiplier = product.compositionRule ? product.compositionRule.multiplierConfort : 5;
        } else {
          // Pour le pack Essentiel, l'Huile de palme est un cas spécial (absente -> quantité = 0)
          if (product.name.toLowerCase().includes('palme')) {
            multiplier = 0;
          } else {
            multiplier = 1;
          }
        }
        finalQuantity = product.baseQuantity * multiplier;
      } 
      // --- LOGIQUE AJOUTÉE : AHI RÉSERVE ---
      else if (type === 'reserve') {
        // Quantités fixes définies par le référentiel v4 (Ex: riz=25, haricot=10, spaghetti=20...)
        // Si vous avez stocké cette valeur dans 'product.quantityReserve', utilisez-la. Sinon fallback/valeurs v4 :
        finalQuantity = product.quantityReserve || product.compositionRule?.quantityReserve || 0;
        
        // On calcule un multiplicateur virtuel pour l'affichage front
        multiplier = product.baseQuantity > 0 ? (finalQuantity / product.baseQuantity) : 0;
      } 
      // --- LOGIQUE AJOUTÉE : AHI FRAÎCHEUR ---
      else if (type === 'fraicheur') {
        // Base minimale modulable définie par le référentiel v4 (Ex: tomate=1, oignons=1, oeufs=3...)
        finalQuantity = product.quantityFraicheur || product.compositionRule?.quantityFraicheur || 0;
        
        multiplier = product.baseQuantity > 0 ? (finalQuantity / product.baseQuantity) : 0;
      }

      // Cas d'exception pour l'oignon dans le pack Réserve (qui passe d'unité lot à unité panier au coût brut de 3000 F)
      let currentPriceUnit = product.priceUnit;
      let currentUnit = product.unit;
      if (type === 'reserve' && product.name.toLowerCase().includes('oignon')) {
         currentPriceUnit = 3000; // 1 panier = 3000 FCFA
         currentUnit = 'panier';
         finalQuantity = 1; 
         multiplier = 1;
      }

      const finalPrice = finalQuantity * currentPriceUnit;
      totalPackPrice += finalPrice;

      packItems.push({
        productId: product._id,
        name: product.name,
        category: product.category?.name || 'Autre',
        unit: currentUnit,
        priceUnit: currentPriceUnit,
        appliedMultiplier: Number(multiplier.toFixed(1)), // Évite les longues décimales à l'affichage
        quantity: finalQuantity,
        totalPrice: finalPrice
      });
    }

    // Filtrer les items : pour Réserve et Fraîcheur, on n'affiche que les produits qui ont une quantité > 0 (cf. règles v4)
    const filteredPackItems = ['reserve', 'fraicheur'].includes(type) 
      ? packItems.filter(item => item.quantity > 0)
      : packItems;

    // 4. Calculer dynamiquement l'ancien prix de manière proportionnelle
    const ratioAncienPrix = formuleData.prixActuel > 0 ? (formuleData.ancienPrix / formuleData.prixActuel) : 1;
    const dynamicAncienPrix = Math.round(totalPackPrice * ratioAncienPrix);

    // 5. MODIFICATION ET SAUVEGARDE EN BASE DE DONNÉES
    formuleData.prixActuel = totalPackPrice;
    formuleData.ancienPrix = dynamicAncienPrix;
    
    await formuleData.save();

    return res.status(200).json({
      formule: formuleData,
      itemCount: packItems.filter(item => item.quantity > 0).length,
      items: filteredPackItems
    });
  } catch (error) {
    console.error("Erreur getPackDetails:", error);
    return res.status(500).json({ message: "Erreur lors de la génération du pack." });
  }
}

module.exports = {
  getPackDetails
};