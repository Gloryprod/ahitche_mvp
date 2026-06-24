const User = require('../models/user');

async function saveUserDetails(req, res){
    const { telephone, quartier, adresse } = req.body;

    // Validation rapide des entrées
    if (!telephone || !quartier || !adresse) {
        return res.status(400).json({ message: "Tous les champs de livraison sont obligatoires." });
    }

    try {
        // req.user.id est injecté automatiquement par ton middleware de connexion (session ou JWT)
        const userId = req.user.id; 

        // Mise à jour de l'utilisateur dans MongoDB
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { 
                $set: { 
                    telephone: telephone,
                    quartier: quartier,
                    adresse: adresse
                } 
            },
            { new: true, runValidators: true } // "new: true" renvoie le profil mis à jour
        );

        if (!updatedUser) {
            return res.status(404).json({ message: "Utilisateur non trouvé." });
        }

        return res.status(200).json({
            success: true,
            message: "Informations de livraison enregistrées avec succès.",
            user: {
                id: updatedUser._id,
                username: updatedUser.username,
                email: updatedUser.email,
                telephone: updatedUser.telephone,
                quartier: updatedUser.quartier,
                adresse: updatedUser.adresse
            }
        });

    } catch (error) {
        console.error("Erreur backend /profile/delivery :", error);
        return res.status(500).json({ message: "Erreur interne du serveur lors de l'enregistrement." });
    }
}

async function updateFormulePreference(req, res){
    try {
        const userId = req.user.id; 
        const { formule } = req.body;

        if (!formule) {
            return res.status(400).json({ message: "Le nom de la formule est requis." });
        }

        // Mise à jour du champ correspondant dans le modèle User
        const userMisAJour = await User.findByIdAndUpdate(
        userId,
        { formuleHabituelle: formule },
        { new: true } // Renvoie le document modifié
        );

        if (!userMisAJour) {
            return res.status(404).json({ message: "Utilisateur non trouvé." });
        }

        return res.status(200).json({ 
            message: "Préférence de pack AHITCHE mise à jour avec succès !", 
            formuleHabituelle: userMisAJour.formuleHabituelle 
        });

    } catch (error) {
        console.error("Erreur updateFormulePreference:", error);
        return res.status(500).json({ message: "Erreur interne du serveur." });
    }
}

module.exports = { saveUserDetails, updateFormulePreference };
