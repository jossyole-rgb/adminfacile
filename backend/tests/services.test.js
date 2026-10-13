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
