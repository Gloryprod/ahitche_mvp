const mongoose = require('mongoose'); 
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config(); // Charge ton fichier .env

// 1. Remplace par ton modèle User ou ta logique BDD
async function createAdmin() {
  const adminEmail = "admin@ahitche.bj";
  const rawPassword = process.env.ADMIN_PASSWORD; // Le mot de passe choisi
  
  try {
    // Connexion à la BDD (exemple MongoDB, à adapter selon ton projet)
    await mongoose.connect(process.env.MONGO_URI);
    
    // Hachage du mot de passe
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(rawPassword, salt);
    
    const adminData = {
      username: "SuperAdmin",
      email: adminEmail,
      password: hashedPassword,
      role: "admin"
    };
    
    // Insertion en BDD (Exemple Mongoose : await User.create(adminData))
    // Exemple SQL brut : await db.query('INSERT INTO users...', [...])
    console.log(`✅ Administrateur créé avec succès !`);
    console.log(`Email : ${adminEmail}`);
    
  } catch (error) {
    console.error("❌ Erreur lors de la création de l'admin :", error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

createAdmin();