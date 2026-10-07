const Parametres = require('../../models/parametres');
const { journaliser } = require('../../services/journalService');

// Champs modifiables : chemin -> borne maximale (null : pas de borne)
const CHAMPS = {
  chargesFixesMensuellesFcfa: null, objectifCaMensuelFcfa: null,
  'repartition.essentiel': 100, 'repartition.equilibre': 100, 'repartition.confort': 100,
  emballageParCommandeFcfa: null, commissionMobileMoneyPct: 100, livraisonMoyenneFcfa: null, objectifClients: null,
  'parts.emballage': 100, 'parts.transformation': 100, 'parts.logistique': 100, 'parts.pertes': 100,
  margeCiblePct: 95
};
const DATES = ['debutObjectif', 'finObjectif'];

const lire = (objet, chemin) => chemin.split('.').reduce((o, c) => (o == null ? undefined : o[c]), objet);

function versJson(p) {
  const o = p.toObject();
  delete o._id; delete o.__v; delete o.cle;
  return { ...o, coefficient: p.coefficient() };
}

// GET /api/admin/parametres
async function obtenirParametres(req, res) {
  try {
    return res.status(200).json(versJson(await Parametres.obtenir()));
  } catch (error) {
    console.error("Erreur obtenirParametres:", error);
    return res.status(500).json({ message: "Erreur lors du chargement des paramètres." });
  }
}

// PUT /api/admin/parametres : seuls les champs envoyés changent ; vide (null ou "") = à renseigner
async function modifierParametres(req, res) {
  try {
    const p = await Parametres.obtenir();
    const avant = {}, apres = {};
    for (const [chemin, max] of Object.entries(CHAMPS)) {
      const v = lire(req.body, chemin);
      if (v === undefined) continue;
      const n = v === null || v === '' ? null : Number(v);
      if (n !== null && (!Number.isFinite(n) || n < 0 || (max !== null && n > max))) {
        return res.status(400).json({ message: `Valeur invalide pour « ${chemin} ».` });
      }
      if (n !== lire(p, chemin)) { avant[chemin] = lire(p, chemin) ?? null; apres[chemin] = n; p.set(chemin, n); }
    }
    for (const champ of DATES) {
      const v = req.body[champ];
      if (v === undefined) continue;
      const d = v === null || v === '' ? null : new Date(v);
      if (d && Number.isNaN(d.getTime())) return res.status(400).json({ message: `Date invalide pour « ${champ} ».` });
      if (String(d?.getTime() ?? null) !== String(p[champ]?.getTime() ?? null)) { avant[champ] = p[champ]; apres[champ] = d; p[champ] = d; }
    }
    if (!Object.keys(apres).length) return res.status(200).json({ message: "Aucun changement.", parametres: versJson(p) });

    await p.save();
    await journaliser(req, {
      action: 'Modification', entite: 'Paramètres', entiteId: p._id,
      resume: `Paramètres modifiés : ${Object.keys(apres).join(', ')}`, avant, apres
    });
    return res.status(200).json({ message: "Paramètres enregistrés.", parametres: versJson(p) });
  } catch (error) {
    console.error("Erreur modifierParametres:", error);
    return res.status(500).json({ message: "Erreur lors de l'enregistrement des paramètres." });
  }
}

module.exports = { obtenirParametres, modifierParametres };
