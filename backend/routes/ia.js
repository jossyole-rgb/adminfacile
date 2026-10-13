/* =========================
   ROUTES IA : lettres, assistant, documents, réponses
   Toutes ces routes sont privées : token Firebase obligatoire.
========================= */

const express = require("express");
const multer = require("multer");
const { texteRequis, choix, ErreurValidation } = require("../middleware/validation");
const { exigerEmailVerifie } = require("../middleware/auth");
const { TYPES_LETTRE, TONS_LETTRE, STYLES_REECRITURE, STYLES_REPONSE } = require("../services/ia");
const { TYPES_AUTORISES } = require("../services/documents");

const MAX_LETTRE = 12000;
const MAX_MESSAGE = 2000;
const MAX_ANALYSE = 12000;

function creerRoutesIA({ verifierUtilisateur, iaLimiter, ia, comptes, documents, config, logger = console }) {
  const router = express.Router();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadBytes, files: 5 },
    fileFilter: (req, file, cb) => {
      if (!TYPES_AUTORISES[file.mimetype]) {
        return cb(new ErreurValidation("Type de fichier non autorisé. PDF, PNG ou JPG uniquement."));
      }
      return cb(null, true);
    },
  });

  const prive = [verifierUtilisateur, iaLimiter];

  /* ---------- Génération de lettre (quota serveur) ---------- */

  async function genererLettre(req, res, next) {
    let donnees;

    try {
      const type = texteRequis(req.body, "type", { max: 50, libelle: "type de lettre" });

      if (!TYPES_LETTRE.includes(type)) {
        throw new ErreurValidation("Type de lettre inconnu.");
      }

      donnees = {
        type,
        ton: choix(req.body, "tonLettre", TONS_LETTRE, "professionnel"),
        nom: texteRequis(req.body, "nom", { max: 120, libelle: "nom" }),
        destinataire: texteRequis(req.body, "destinataire", { max: 200, libelle: "destinataire" }),
        objet: texteRequis(req.body, "objet", { max: 4000, libelle: "objet de la demande" }),
      };
    } catch (error) {
      return next(error);
    }

    const uid = req.user.uid;
    let reservation;

    try {
      reservation = await comptes.reserverGeneration(uid);
    } catch (error) {
      return next(error);
    }

    if (!reservation.autorise) {
      return res.status(402).json({
        error: "Limite gratuite atteinte. Passe Premium pour continuer à générer des lettres.",
        code: "QUOTA_EXCEEDED",
        lettersUsed: reservation.utilisees,
        freeLimit: reservation.limite,
      });
    }

    try {
      const lettre = await ia.genererLettre(donnees);

      return res.json({
        lettre,
        lettersUsed: reservation.utilisees,
        lettersRemaining: reservation.premium ? null : Math.max(0, reservation.limite - reservation.utilisees),
      });
    } catch (error) {
      // Échec de génération : la tentative n'est pas décomptée.
      await comptes.libererGeneration(uid).catch((e) =>
        logger.error("Impossible de libérer le quota :", e && e.message)
      );
      return next(error);
    }
  }

  router.post("/generer-lettre", ...prive, exigerEmailVerifie, genererLettre);
  router.post("/api/letters", ...prive, exigerEmailVerifie, genererLettre);

  /* ---------- Résumé et réécriture ---------- */

  router.post("/resumer-lettre", ...prive, async (req, res, next) => {
    try {
      const texte = texteRequis(req.body, "texte", { max: MAX_LETTRE, libelle: "texte" });
      return res.json({ resume: await ia.resumerLettre(texte) });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/reecrire-lettre", ...prive, async (req, res, next) => {
    try {
      const texte = texteRequis(req.body, "texte", { max: MAX_LETTRE, libelle: "texte" });
      const style = choix(req.body, "style", STYLES_REECRITURE, "professionnel");
      return res.json({ lettre: await ia.reecrireLettre(texte, style) });
    } catch (error) {
      return next(error);
    }
  });

  /* ---------- Assistant administratif ---------- */

  router.post("/chat-admin", ...prive, async (req, res, next) => {
    try {
      const message = texteRequis(req.body, "message", { max: MAX_MESSAGE, libelle: "message" });
      return res.json({ reponse: await ia.discuter(message) });
    } catch (error) {
      return next(error);
    }
  });

  /* ---------- Analyse de documents ---------- */

  router.post("/upload-document", ...prive, upload.array("documents", 5), async (req, res, next) => {
    try {
      if (!req.files || req.files.length === 0) {
        throw new ErreurValidation("Aucun document reçu.");
      }

      const texte = await documents.extraireTextes(req.files);
      const premier = req.files[0];

      if (!texte.trim()) {
        return res.json({
          success: true,
          nom: premier.originalname,
          type: premier.mimetype,
          taille: premier.size,
          analyse: "",
          avertissement: "Aucun texte lisible n'a été trouvé dans ce document. Essaie avec une image plus nette ou un PDF non scanné.",
        });
      }

      const analyse = await ia.analyserDocument(texte);

      return res.json({
        success: true,
        nom: premier.originalname,
        type: premier.mimetype,
        taille: premier.size,
        analyse,
      });
    } catch (error) {
      return next(error);
    }
  });

  /* ---------- Réponse à un courrier ---------- */

  router.post("/generer-reponse-ia", ...prive, async (req, res, next) => {
    try {
      const document = texteRequis(req.body, "document", { max: MAX_ANALYSE, libelle: "document" });
      const ton = choix(req.body, "ton", STYLES_REPONSE, "professionnel");
      return res.json({ reponse: await ia.genererReponse(document, ton) });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/chat-document", ...prive, async (req, res, next) => {
    try {
      const question = texteRequis(req.body, "question", { max: MAX_MESSAGE, libelle: "question" });
      const analyse = texteRequis(req.body, "analyse", { max: MAX_ANALYSE, libelle: "analyse" });
      return res.json({ reponse: await ia.discuterDocument(question, analyse) });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = { creerRoutesIA };
