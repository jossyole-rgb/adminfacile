/* =========================
   TESTS UNITAIRES DES SERVICES (sans réseau)
========================= */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { detecterType, creerServiceDocuments, ErreurDocument } = require("../services/documents");
const { creerServiceIA, ErreurIA } = require("../services/ia");
const { estPremium } = require("../services/comptes");

const PDF = Buffer.from("%PDF-1.7\n...");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);

describe("Détection du type réel des fichiers", () => {
  test("reconnaît PDF, PNG et JPG", () => {
    assert.equal(detecterType(PDF), "pdf");
    assert.equal(detecterType(PNG), "png");
    assert.equal(detecterType(JPG), "jpg");
  });

  test("rejette un contenu inconnu", () => {
    assert.equal(detecterType(Buffer.from("<html><script>")), null);
    assert.equal(detecterType(Buffer.alloc(0)), null);
  });

  test("refuse un exécutable déguisé en PDF", async () => {
    const service = creerServiceDocuments({ pdfParse: async () => ({ text: "x" }), ocr: async () => ({}) });
    await assert.rejects(
      service.extraireTextes([{ mimetype: "application/pdf", buffer: Buffer.from("MZ\x90\x00 exe") }]),
      ErreurDocument
    );
  });

  test("refuse un PNG déclaré comme PDF", async () => {
    const service = creerServiceDocuments({ pdfParse: async () => ({ text: "x" }), ocr: async () => ({}) });
    await assert.rejects(
      service.extraireTextes([{ mimetype: "application/pdf", buffer: PNG }]),
      /ne correspond pas/
    );
  });

  test("extrait le texte d'un PDF et d'une image (OCR)", async () => {
    const service = creerServiceDocuments({
      pdfParse: async () => ({ text: "Texte PDF" }),
      ocr: async () => ({ data: { text: "Texte image" } }),
    });

    const texte = await service.extraireTextes([
      { mimetype: "application/pdf", buffer: PDF },
      { mimetype: "image/png", buffer: PNG },
    ]);

    assert.match(texte, /Document 1 ---\nTexte PDF/);
    assert.match(texte, /Document 2 ---\nTexte image/);
  });

  test("arrête l'OCR qui dépasse le délai (A19)", async () => {
    let signalRecu;
    const service = creerServiceDocuments({
      pdfParse: async () => ({ text: "" }),
      ocr: (buffer, langue, { signal }) => {
        signalRecu = signal;
        return new Promise(() => {});
      },
      delaiOcrMs: 20,
    });

    await assert.rejects(service.extraireTextes([{ mimetype: "image/png", buffer: PNG }]), (e) => {
      assert.equal(e.status, 400);
      assert.equal(e.code, "OCR_TIMEOUT");
      return true;
    });
    assert.equal(signalRecu.aborted, true);
  });

  test("l'échec tardif d'un OCR interrompu ne produit pas de rejet non géré", async () => {
    const rejetsNonGeres = [];
    const ecouteur = (raison) => rejetsNonGeres.push(raison);
    process.on("unhandledRejection", ecouteur);

    const service = creerServiceDocuments({
      pdfParse: async () => ({ text: "" }),
      ocr: () => new Promise((_, rejeter) => setTimeout(() => rejeter(new Error("moteur arrêté")), 40)),
      delaiOcrMs: 10,
    });

    await assert.rejects(service.extraireTextes([{ mimetype: "image/png", buffer: PNG }]), /trop de temps/);
    await new Promise((r) => setTimeout(r, 80));
    process.off("unhandledRejection", ecouteur);

    assert.deepEqual(rejetsNonGeres, []);
  });

  test("un PDF illisible donne une erreur claire (400)", async () => {
    const service = creerServiceDocuments({
      pdfParse: async () => {
        throw new Error("bad xref");
      },
      ocr: async () => ({}),
    });

    await assert.rejects(service.extraireTextes([{ mimetype: "application/pdf", buffer: PDF }]), (e) => {
      assert.equal(e.status, 400);
      assert.equal(e.code, "UNREADABLE_FILE");
      return true;
    });
  });
});

describe("Service IA", () => {
  function fauxOpenAI(comportement) {
    const requetes = [];
    return {
      requetes,
      chat: {
        completions: {
          async create(params) {
            requetes.push(params);
            return comportement(params);
          },
        },
      },
    };
  }

  test("encadre les données utilisateur et rappelle de ne rien inventer", async () => {
    const openai = fauxOpenAI(() => ({ choices: [{ message: { content: " Lettre " } }] }));
    const ia = creerServiceIA({ openai, modele: "modele-test" });

    const lettre = await ia.genererLettre({ type: "caf", ton: "poli", nom: "A", destinataire: "B", objet: "C" });

    assert.equal(lettre, "Lettre");
    const [systeme, utilisateur] = openai.requetes[0].messages;
    assert.equal(openai.requetes[0].model, "modele-test");
    assert.match(systeme.content, /N'invente aucun fait/);
    assert.match(utilisateur.content, /<donnees_utilisateur>[\s\S]*Situation : C[\s\S]*<\/donnees_utilisateur>/);
  });

  test("réponse vide → ErreurIA (502)", async () => {
    const ia = creerServiceIA({ openai: fauxOpenAI(() => ({ choices: [{ message: { content: "" } }] })), modele: "m" });
    await assert.rejects(ia.discuter("Bonjour"), (e) => e instanceof ErreurIA && e.status === 502);
  });

  test("erreur réseau OpenAI → ErreurIA sans détail interne", async () => {
    const ia = creerServiceIA({
      openai: fauxOpenAI(() => {
        throw new Error("ECONNRESET sk-secret");
      }),
      modele: "m",
    });

    await assert.rejects(ia.discuter("Bonjour"), (e) => {
      assert.ok(e instanceof ErreurIA);
      assert.doesNotMatch(e.message, /sk-secret/);
      return true;
    });
  });
});

describe("Statut Premium", () => {
  test("Premium uniquement si premium=true ET statut active", () => {
    assert.equal(estPremium({ premium: true, subscriptionStatus: "active" }), true);
    assert.equal(estPremium({ premium: true, subscriptionStatus: "past_due" }), false);
    assert.equal(estPremium({ premium: false, subscriptionStatus: "active" }), false);
    assert.equal(estPremium(null), false);
  });
});

describe("Adaptateur OCR Tesseract", () => {
  const fs = require("fs");
  const path = require("path");
  const { creerOcrTesseract, DOSSIER_LANGUES } = require("../services/ocr");

  function fauxTesseract() {
    const appels = { options: null, termine: 0 };
    return {
      appels,
      createWorker: async (langue, oem, options) => {
        appels.options = options;
        return {
          recognize: async () => ({ data: { text: "texte" } }),
          terminate: async () => {
            appels.termine += 1;
          },
        };
      },
    };
  }

  test("utilise les données françaises livrées, un errorHandler et arrête le moteur", async () => {
    const tesseract = fauxTesseract();
    const resultat = await creerOcrTesseract(tesseract, { logger: { error() {} } })(Buffer.from("x"), "fra");

    assert.equal(resultat.data.text, "texte");
    assert.equal(typeof tesseract.appels.options.errorHandler, "function");
    assert.equal(tesseract.appels.options.cacheMethod, "none");
    assert.ok(fs.existsSync(path.join(DOSSIER_LANGUES, "fra.traineddata.gz")));
    assert.equal(tesseract.appels.termine, 1);
  });

  test("arrête le moteur si le délai expire pendant son démarrage", async () => {
    const tesseract = fauxTesseract();
    const controleur = new AbortController();
    const lecture = creerOcrTesseract(tesseract, { logger: { error() {} } })(Buffer.from("x"), "fra", {
      signal: controleur.signal,
    });
    controleur.abort();

    await assert.rejects(lecture, /interrompu/);
    await new Promise((r) => setImmediate(r));
    assert.equal(tesseract.appels.termine, 1);
  });
});
