const nodemailer = require('nodemailer');

console.log("VÉRIFICATION SMTP :", {
    host: process.env.EMAIL_HOST,
    user: process.env.EMAIL_USER ? "Reçu (OK)" : "Vide (Erreur)"
});

// Configuration du transporteur de mail avec les variables d'environnement
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

/**
 * Envoie un e-mail de bienvenue à un nouvel utilisateur
 * @param {string} to - L'adresse e-mail de l'utilisateur
 * @param {string} username - Le nom d'utilisateur
 */

function sendWelcomeEmail (to, username) {
    const mailOptions = {
        from: '"L\'équipe Ahitche" <no-reply@ahitche.bj>', // Nom et mail d'expéditeur
        to: to,
        subject: 'Bienvenue sur Ahitche ! ✨',
        // Version HTML stylisée (tu peux y injecter du CSS basique)
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 8px;">
                <h1 style="color: #1e3a1f;">Ravi de vous compter parmi nous, ${username} !</h1>
                <p style="font-size: 16px; color: #334155; line-height: 1.5;">
                    Votre compte a été créé avec succès. Vous pouvez dès à présent vous connecter et explorer toutes nos fonctionnalités.
                </p>
                <div style="margin: 30px 0; text-align: center;">
                    <a href="https://votre-site-front.vercel.app" style="background-color: #1e3a1f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                        Accéder à mon espace
                    </a>
                </div>
                <p style="font-size: 14px; color: #64748b;">
                    Si vous n'avez pas créé ce compte, vous pouvez ignorer cet e-mail.
                </p>
            </div>
        `
    };

    try {
        transporter.sendMail(mailOptions);
        console.log(`📧 E-mail de bienvenue envoyé avec succès à ${to}`);
    } catch (error) {
        console.error("❌ Erreur lors de l'envoi de l'e-mail :", error);
        // On ne bloque pas l'inscription de l'utilisateur si le mail échoue, mais on log l'erreur
    }
};

module.exports = { sendWelcomeEmail };