const { Resend } = require('resend');

// Initialisation du client Resend avec la clé d'API
const resend = new Resend(process.env.RESEND_API_KEY);

// Adresse d'expéditeur officielle de l'application
const FROM_EMAIL = 'L\'équipe Ahitche <contact@ahitchebj.com>';

/**
 * Envoie un e-mail de bienvenue à un nouvel utilisateur
 * @param {string} to - L'adresse e-mail de l'utilisateur
 * @param {string} username - Le nom d'utilisateur
 */
async function sendWelcomeEmail(to, username) {
  try {
    const data = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: 'Bienvenue sur Ahitche ! ✨',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h1 style="color: #1e3a1f;">Ravi de vous compter parmi nous, ${username} !</h1>
            <p style="font-size: 16px; color: #334155; line-height: 1.5;">
                Votre compte a été créé avec succès. Vous pouvez dès à présent vous connecter et explorer toutes nos fonctionnalités.
            </p>
            <div style="margin: 30px 0; text-align: center;">
                <a href="https://ahitchebj.com/login" style="background-color: #1e3a1f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                    Accéder à mon espace
                </a>
            </div>
            <p style="font-size: 14px; color: #64748b;">
                Si vous n'avez pas créé ce compte, vous pouvez ignorer cet e-mail.
            </p>
        </div>
      `,
    });

    console.log(`📧 E-mail de bienvenue envoyé avec succès à ${to} (ID: ${data.id})`);
  } catch (error) {
    console.error("❌ Erreur lors de l'envoi de l'e-mail de bienvenue :", error);
  }
}

/**
 * Envoie un e-mail de réinitialisation de mot de passe
 * @param {object} user - L'utilisateur concerné
 * @param {string} resetUrl - Lien de réinitialisation
 */
async function sendForgotPasswordMail(user, resetUrl) {
  try {
    const data = await resend.emails.send({
      from: FROM_EMAIL,
      to: [user.email],
      subject: 'Ahitché - Réinitialisation de votre mot de passe',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee;">
            <h2 style="color: #0d5e42; text-align: center;">Réinitialisation de votre mot de passe</h2>
            <p>Bonjour <strong>${user.username}</strong>,</p>
            <p>Vous avez demandé la réinitialisation de votre mot de passe sur Ahitché. Cliquez sur le bouton ci-dessous pour en configurer un nouveau :</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" style="background-color: #0d5e42; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Réinitialiser mon mot de passe</a>
            </div>
            <p style="color: #777; font-size: 12px;">Ce lien est valable pendant 1 heure. Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail en toute sécurité.</p>
        </div>
      `,
    });

    console.log(`📧 E-mail de réinitialisation envoyé avec succès à ${user.email} (ID: ${data.id})`);
  } catch (error) {
    console.error("❌ Erreur lors de l'envoi de l'e-mail de réinitialisation :", error);
  }
}

module.exports = { sendWelcomeEmail, sendForgotPasswordMail };