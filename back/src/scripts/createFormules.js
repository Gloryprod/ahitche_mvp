// const mongoose = require('mongoose'); 
// const dotenv = require('dotenv');
// const Formule = require('../models/formules');

// dotenv.config();

// const formulesData = [
//   {
//     slug: "ahi-essentiel",
//     nom: "AHI ESSENTIEL",
//     emoji: "🌿",
//     cible: "1 personne · par semaine",
//     phraseAccroche: "Les bases de votre semaine déjà organisées.",
//     estimationRepas: { min: 20, max: 30 },
//     heuresEconomisees: { min: 2, max: 4 },
//     ancienPrix: 24000,
//     prixActuel: 10800,
//     estRecommandee: false,
//     lienWhatsApp: "https://wa.me/22998136635?text=Bonjour%20Ahitch%C3%A9%20!%20Je%20souhaite%20commander%20la%20formule%20AHI%20ESSENTIEL%20(10%20800%20FCFA)."
//   },
//   {
//     slug: "ahi-equilibre",
//     nom: "AHI ÉQUILIBRÉ",
//     emoji: "🌾",
//     cible: "2–3 personnes · par semaine",
//     phraseAccroche: "Mieux manger sans compliquer votre quotidien.",
//     estimationRepas: { min: 35, max: 50 },
//     heuresEconomisees: { min: 4, max: 6 },
//     ancienPrix: 50000,
//     prixActuel: 22500,
//     estRecommandee: true,
//     lienWhatsApp: "https://wa.me/22998136635?text=Bonjour%20Ahitch%C3%A9%20!%20Je%20souhaite%20commander%20la%20formule%20AHI%20%C3%89QUILIBR%C3%89%20(22%20250%20FCFA)."
//   },
//   {
//     slug: "ahi-confort",
//     nom: "AHI CONFORT",
//     emoji: "👑",
//     cible: "Famille 4–6 · par semaine",
//     phraseAccroche: "Votre cuisine organisée sans stress.",
//     estimationRepas: { min: 60, max: 90 },
//     heuresEconomisees: { min: 6, max: 10 },
//     ancienPrix: 110000,
//     prixActuel: 50300,
//     estRecommandee: false,
//     lienWhatsApp: "https://wa.me/22998136635?text=Bonjour%20Ahitch%C3%A9%20!%20Je%20souhaite%20commander%20la%20formule%20AHI%20CONFORT%20(50%20300%20FCFA)."
//   }
// ];

// const seedDB = async () => {
//   try {
//     const mongoURI = process.env.MONGO_URI
    
//     if (!mongoURI) {
//       throw new Error("L'URI de la base de données est introuvable dans le fichier .env");
//     }

//     await mongoose.connect(mongoURI);

//     // 2. Nettoyage de sécurité pour éviter les doublons de slugs
//     await Formule.deleteMany({});

//     // 3. Insertion des données
//     await Formule.insertMany(formulesData);
//     console.log("✅ Les 3 formules d'Ahitché ont été enregistrées avec succès !");

//     // 4. Déconnexion propre
//     mongoose.connection.close();
//     process.exit(0);

//   } catch (error) {
//     console.error("❌ Erreur lors du seeding :", error);
//     process.exit(1);
//   }
// };

// // Lancement du script
// seedDB();

const mongoose = require('mongoose'); 
const dotenv = require('dotenv');
const Formule = require('../models/formules');

dotenv.config();

const nouvellesFormulesData = [
  {
    slug: "ahi-reserve",
    nom: "AHI RÉSERVE",
    emoji: "📦",
    cible: "Volume · Mensuel / Bi-mensuel",
    phraseAccroche: "Votre stock de produits secs et essentiels sécurisé en grand volume.",
    estimationRepas: { min: 120, max: 180 }, // Échelle volumétrique adaptée
    heuresEconomisees: { min: 15, max: 25 },
    ancienPrix: 125000, 
    prixActuel: 105000, // Conforme au simulateur v4
    estRecommandee: false,
    lienWhatsApp: "https://wa.me/22998136635?text=Bonjour%20Ahitch%C3%A9%20!%20Je%20souhaite%20commander%20la%20formule%20AHI%20R%C3%89SERVE%20(105%20000%20FCFA)."
  },
  {
    slug: "ahi-fraicheur",
    nom: "AHI FRAÎCHEUR",
    emoji: "🥗",
    cible: "Modulable · Par semaine",
    phraseAccroche: "Votre panier minimal d'aromates et produits frais, ajustable selon vos envies.",
    estimationRepas: { min: 10, max: 15 }, // Aromates et base fraîcheur complémentaire
    heuresEconomisees: { min: 3, max: 5 },
    ancienPrix: 6000,
    prixActuel: 4850, // Base brute minimale du panier frais v4
    estRecommandee: false,
    lienWhatsApp: "https://wa.me/22998136635?text=Bonjour%20Ahitch%C3%A9%20!%20Je%20souhaite%20en%20savoir%20plus%20et%20composer%20ma%20formule%20AHI%20FRA%C3%8ECHEUR."
  }
];

const seedDB = async () => {
  try {
    const mongoURI = process.env.MONGO_URI;
    
    if (!mongoURI) {
      throw new Error("L'URI de la base de données est introuvable dans le fichier .env");
    }

    await mongoose.connect(mongoURI);

    console.log("⏳ Insertion/Mise à jour des nouvelles formules en cours...");

    // Utilisation de l'upsert pour ajouter/mettre à jour SANS supprimer l'Essentiel, l'Équilibré et le Confort
    for (const formule of nouvellesFormulesData) {
      await Formule.findOneAndUpdate(
        { slug: formule.slug },
        formule,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    console.log("✅ Les formules AHI RÉSERVE et AHI FRAÎCHEUR ont été enregistrées ou mises à jour avec succès !");

    // Déconnexion propre
    mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error("❌ Erreur lors du seeding des nouvelles formules :", error);
    process.exit(1);
  }
};

// Lancement du script
seedDB();