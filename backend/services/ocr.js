/* =========================
   OCR TESSERACT
   Un moteur OCR par image, arrêté à la fin ou dès que le délai fixé par le service documents expire.
========================= */

const path = require("path");

// Données de langue française livrées avec l'application : pas de téléchargement au premier appel,
// pas de dépendance au CDN et pas d'écriture de cache sur le disque du serveur.
const DOSSIER_LANGUES = path.join(path.dirname(require.resolve("@tesseract.js-data/fra/package.json")), "4.0.0_best_int");

function creerOcrTesseract(Tesseract, { logger = console, langPath = DOSSIER_LANGUES } = {}) {
  return async function ocr(buffer, langue, { signal } = {}) {
    // errorHandler obligatoire : sans lui, Tesseract lève l'erreur hors de toute promesse
    // et une image illisible arrête tout le serveur. L'erreur reste renvoyée par recognize().
    const creation = Tesseract.createWorker(langue, 1, {
      langPath,
      cacheMethod: "none",
      errorHandler: (erreur) => logger.error("Erreur OCR :", erreur),
    });

    // Le moteur est arrêté même si le délai expire pendant son démarrage.
    const arreter = () => creation.then((moteur) => moteur.terminate()).catch(() => {});
    signal?.addEventListener("abort", arreter, { once: true });

    try {
      const moteur = await creation;
      if (signal?.aborted) throw new Error("OCR interrompu");
      return await moteur.recognize(buffer);
    } finally {
      signal?.removeEventListener("abort", arreter);
      if (!signal?.aborted) await arreter();
    }
  };
}

module.exports = { creerOcrTesseract, DOSSIER_LANGUES };
