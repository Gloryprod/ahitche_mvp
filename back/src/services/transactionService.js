// Annule la transaction de la session si elle est encore ouverte, sans jamais lever d'erreur. Le serveur MongoDB peut
// l'avoir déjà annulée (charge, délai, conflit) : une seconde annulation échouerait et transformerait un refus prévu
// (400, 404, 409) ou une erreur ordinaire en 500 « Erreur serveur ».
async function annulerTransaction(session) {
  if (!session?.inTransaction()) return;
  try {
    await session.abortTransaction();
  } catch {
    // Transaction déjà annulée par le serveur : rien d'autre à faire
  }
}

module.exports = { annulerTransaction };
