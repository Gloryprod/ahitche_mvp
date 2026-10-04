// Crée un compte de l'équipe ou change le rôle d'un compte existant.
// Usage : STAFF_PASSWORD=... node src/scripts/createStaff.js <email> "<Nom complet>" <role>
//   role : admin | gestionnaire | comptable | nutritionniste
// Le mot de passe passe par une variable d'environnement pour ne pas rester dans l'historique du terminal.
// Sans STAFF_PASSWORD, un compte existant garde son mot de passe (changement de rôle uniquement).
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const User = require('../models/user');
const { EQUIPE } = require('../config/roles');

dotenv.config();

async function createStaff() {
  const [email, username, role] = process.argv.slice(2);
  const motDePasse = process.env.STAFF_PASSWORD;

  if (!email || !username || !EQUIPE.includes(role)) {
    console.error(`Usage : STAFF_PASSWORD=... node src/scripts/createStaff.js <email> "<Nom complet>" <${EQUIPE.join('|')}>`);
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    const existant = await User.findOne({ email });

    if (existant) {
      existant.role = role;
      if (motDePasse) existant.password = await bcrypt.hash(motDePasse, 10);
      await existant.save();
      console.log(`✅ ${email} a maintenant le rôle « ${role} ».`);
    } else {
      if (!motDePasse || motDePasse.length < 8) {
        throw new Error('STAFF_PASSWORD (8 caractères minimum) est obligatoire pour créer un compte.');
      }
      await User.create({ username, email, role, password: await bcrypt.hash(motDePasse, 10) });
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
