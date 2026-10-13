/* =========================
   GESTION CENTRALISÉE DES ERREURS
   Aucun détail interne (pile, message Stripe/OpenAI) n'est renvoyé au client.
========================= */

const multer = require("multer");

function gestionnaireErreurs(logger = console) {
  // eslint-disable-next-line no-unused-vars
  return function (err, req, res, next) {
    if (err instanceof multer.MulterError) {
      const messages = {
        LIMIT_FILE_SIZE: "Fichier trop volumineux.",
        LIMIT_FILE_COUNT: "Trop de fichiers envoyés.",
        LIMIT_UNEXPECTED_FILE: "Champ de fichier inattendu.",
      };

      return res.status(400).json({
        error: messages[err.code] || "Fichier refusé.",
        code: err.code,
      });
    }

    if (err && err.type === "entity.too.large") {
      return res.status(413).json({
        error: "Requête trop volumineuse.",
        code: "PAYLOAD_TOO_LARGE",
      });
    }

    if (err && err.type === "entity.parse.failed") {
      return res.status(400).json({
        error: "Requête JSON invalide.",
        code: "INVALID_JSON",
      });
    }

    // Erreurs applicatives dont le message est destiné à l'utilisateur.
    if (err && err.expose === true && err.status) {
      return res.status(err.status).json({
        error: err.message,
        code: err.code || "BAD_REQUEST",
      });
    }

    logger.error(`[${req.method} ${req.path}] Erreur interne :`, err && err.message);

    return res.status(500).json({
      error: "Erreur interne du serveur.",
      code: "INTERNAL_ERROR",
    });
  };
}

module.exports = { gestionnaireErreurs };
