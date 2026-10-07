const User = require('../models/user');
const Zone = require('../models/zone');

async function saveUserDetails(req, res){
    const { telephone, quartier, adresse, zone, lienLocalisation } = req.body;

    // Validation rapide des entrées
    if (![telephone, quartier, adresse].every(v => typeof v === 'string' && v.trim())) {
        return res.status(400).json({ message: "Tous les champs de livraison sont obligatoires." });
    }

    // Lien de localisation facultatif (Google Maps, position WhatsApp…) : uniquement une adresse web
    const lien = typeof lienLocalisation === 'string' ? lienLocalisation.trim() : '';
    if (lien && (!/^https?:\/\//i.test(lien) || lien.length > 500)) {
        return res.status(400).json({ message: "Le lien de localisation doit être une adresse web (https://…)." });
    }

    try {
        // Quartier choisi dans la liste : il doit appartenir à la zone indiquée.
        // « Autre quartier » : pas de zone, le quartier est gardé en texte libre.
        let codeZone = null;
        if (typeof zone === 'string' && zone) {
            const zoneFiche = await Zone.findOne({ code: zone, actif: true });
            if (!zoneFiche || !zoneFiche.quartiers.includes(quartier.trim())) {
                return res.status(400).json({ message: "Ce quartier n'appartient pas à la zone choisie." });
            }
            codeZone = zoneFiche.code;
        }

        // req.user.id est injecté automatiquement par ton middleware de connexion (session ou JWT)
        const userId = req.user.id;

        // Mise à jour de l'utilisateur dans MongoDB
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                $set: {
                    telephone: telephone.trim(),
                    quartier: quartier.trim(),
                    adresse: adresse.trim(),
                    zone: codeZone,
                    lienLocalisation: lien
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
                adresse: updatedUser.adresse,
                zone: updatedUser.zone,
                lienLocalisation: updatedUser.lienLocalisation
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
