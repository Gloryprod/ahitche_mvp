// Suivi des erreurs (Sentry) : chargé avant tout le reste (voir index.js). Inactif sans SENTRY_DSN.
// Les erreurs déjà écrites dans les journaux (console.error des contrôleurs) sont transmises ; aucune donnée
// personnelle : ni cookie, ni adresse IP, ni contenu des requêtes.
require('dotenv').config();
const Sentry = require('@sentry/node');

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    sendDefaultPii: false,
    tracesSampleRate: 0, // Erreurs seulement, pas de mesure de performance
    integrations: [Sentry.captureConsoleIntegration({ levels: ['error'] })],
    beforeSend(evenement) {
      if (evenement.request) {
        delete evenement.request.cookies;
        delete evenement.request.data;
        if (evenement.request.headers) delete evenement.request.headers.cookie;
      }
      delete evenement.user;
      return evenement;
    },
  });
}

module.exports = Sentry;
