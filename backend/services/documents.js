/* =========================
   DOCUMENTS : contrôle du type réel et extraction du texte
   Les fichiers restent en mémoire le temps de la requête et ne sont jamais écrits sur disque.
========================= */

const TYPES_AUTORISES = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
};

const LONGUEUR_MAX_PAR_FICHIER = 4000;
const LONGUEUR_MAX_TOTALE = 8000;
const DELAI_OCR_PAR_DEFAUT_MS = 30000;

class ErreurDocument extends Error {
  constructor(message, code = "INVALID_FILE") {
    super(message);
    this.status = 400;
    this.code = code;
    this.expose = true;
  }
}

/**
 * Détermine le type réel d'un fichier à partir de sa signature (magic bytes),
 * indépendamment de l'extension ou du type MIME déclaré par le navigateur.
 */
function detecterType(buffer) {
  if (!buffer || buffer.length < 4) return null;

  if (buffer.slice(0, 5).toString("latin1") === "%PDF-") return "pdf";

  if (
    buffer.length >= 8 &&
    buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "png";
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";

  return null;
}

function verifierFichier(fichier) {
  const attendu = TYPES_AUTORISES[fichier.mimetype];
  const reel = detecterType(fichier.buffer);

  if (!attendu || !reel) {
    throw new ErreurDocument("Type de fichier non autorisé. PDF, PNG ou JPG uniquement.");
  }

  if (attendu !== reel) {
    throw new ErreurDocument("Le contenu du fichier ne correspond pas à son type.");
  }

  return reel;
}

/**
 * Exécute l'OCR avec une durée maximale (A19) : une image trop lourde ou piégée
 * ne doit pas bloquer le serveur. Le signal permet à l'appelant d'arrêter le moteur OCR.
 */
async function ocrAvecDelai(ocr, buffer, delaiMs) {
  const controleur = new AbortController();
  let minuteur;

  const delaiDepasse = new Promise((_, rejeter) => {
    minuteur = setTimeout(() => {
      controleur.abort();
      rejeter(new ErreurDocument("La lecture de l'image a pris trop de temps. Essaie avec une image plus nette ou un PDF.", "OCR_TIMEOUT"));
    }, delaiMs);
  });

  const lecture = Promise.resolve().then(() => ocr(buffer, "fra", { signal: controleur.signal }));
  // Après le délai, l'échec tardif de la lecture interrompue ne doit pas devenir un rejet non géré
  // (qui arrêterait le processus Node).
  lecture.catch(() => {});

  try {
    return await Promise.race([lecture, delaiDepasse]);
  } finally {
    clearTimeout(minuteur);
  }
}

function creerServiceDocuments({ pdfParse, ocr, delaiOcrMs = DELAI_OCR_PAR_DEFAUT_MS }) {
  async function extraireTexte(fichier) {
    const type = verifierFichier(fichier);

    try {
      if (type === "pdf") {
        const resultat = await pdfParse(fichier.buffer);
        return (resultat.text || "").slice(0, LONGUEUR_MAX_PAR_FICHIER);
      }

      const resultat = await ocrAvecDelai(ocr, fichier.buffer, delaiOcrMs);
      return ((resultat && resultat.data && resultat.data.text) || "").slice(0, LONGUEUR_MAX_PAR_FICHIER);
    } catch (error) {
      if (error instanceof ErreurDocument) throw error;

      throw new ErreurDocument(
        "Impossible de lire ce fichier. Vérifie qu'il n'est pas protégé ou endommagé.",
        "UNREADABLE_FILE"
      );
    }
  }

  /**
   * Vérifie tous les fichiers puis extrait et concatène leur texte.
   */
  async function extraireTextes(fichiers) {
    fichiers.forEach(verifierFichier);

    const morceaux = [];

    for (const [index, fichier] of fichiers.entries()) {
      const texte = (await extraireTexte(fichier)).trim();
      if (texte) {
        morceaux.push(fichiers.length > 1 ? `--- Document ${index + 1} ---\n${texte}` : texte);
      }
    }

    return morceaux.join("\n\n").slice(0, LONGUEUR_MAX_TOTALE);
  }

  return { extraireTextes };
}

module.exports = { creerServiceDocuments, detecterType, verifierFichier, ErreurDocument, TYPES_AUTORISES };
