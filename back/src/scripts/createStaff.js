// Crée un compte de l'équipe ou change le rôle d'un compte existant.
// Usage : STAFF_PASSWORD=... node src/scripts/createStaff.js <email> "<Nom complet>" <role> [--livreur "<nom de la fiche livreur>"]
//   role : admin | gestionnaire | comptable | nutritionniste | coordinateur | auditeur
//   --livreur : relie un gestionnaire à sa fiche Prestataires (type Livreur) ; il ne voit alors que les clients de ses livraisons
// Le mot de passe passe par une variable d'environnement pour ne pas rester dans l'historique du terminal.
// Sans STAFF_PASSWORD, un compte existant garde son mot de passe (changement de rôle uniquement).
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const User = require('../models/user');
const Partner = require('../models/partner');
const { EQUIPE } = require('../config/roles');
const { normaliserEmail } = require('../utils/texte');

dotenv.config();

async function createStaff() {
  const [emailSaisi, username, role, option, nomLivreur] = process.argv.slice(2);
  const email = normaliserEmail(emailSaisi); // Toujours en minuscules, comme à l'inscription
  const motDePasse = process.env.STAFF_PASSWORD;

  if (!email || !username || !EQUIPE.includes(role)) {
    console.error(`Usage : STAFF_PASSWORD=... node src/scripts/createStaff.js <email> "<Nom complet>" <${EQUIPE.join('|')}>`);
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    const existant = await User.findOne({ email });

    let livreurId;
    if (option === '--livreur') {
      if (role !== 'gestionnaire') throw new Error('--livreur ne concerne que le rôle gestionnaire.');
      const fiche = await Partner.findOne({ nom: nomLivreur, type: 'Livreur', deletedAt: null });
      if (!fiche) throw new Error(`Fiche livreur « ${nomLivreur} » introuvable dans Prestataires.`);
      livreurId = fiche._id;
    }

    if (existant) {
      existant.role = role;
      if (livreurId !== undefined) existant.livreurId = livreurId;
      if (motDePasse) existant.password = await bcrypt.hash(motDePasse, 10);
      await existant.save();
      console.log(`✅ ${email} a maintenant le rôle « ${role} ».`);
    } else {
      if (!motDePasse || motDePasse.length < 8) {
        throw new Error('STAFF_PASSWORD (8 caractères minimum) est obligatoire pour créer un compte.');
      }
      await User.create({ username, email, role, livreurId: livreurId ?? null, password: await bcrypt.hash(motDePasse, 10) });
      console.log(`✅ Compte ${role} créé : ${email}`);
    }
  } catch (error) {
    console.error("❌ Erreur lors de la création du membre de l'équipe :", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

createStaff();
