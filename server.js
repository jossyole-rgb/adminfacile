/* =========================
   POINT D'ENTRÉE (Render : npm start)
   Initialise les services réels puis démarre l'API.
   La logique de l'API se trouve dans backend/.
========================= */

require("dotenv").config();

const OpenAI = require("openai");
const Stripe = require("stripe");
const admin = require("firebase-admin");
const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");

const { chargerConfig } = require("./backend/config");
const { creerApp } = require("./backend/app");
const { creerServiceIA } = require("./backend/services/ia");
const { creerServiceComptes } = require("./backend/services/comptes");
const { creerServiceFacturation } = require("./backend/services/facturation");
const { creerServiceDocuments } = require("./backend/services/documents");
const { creerServiceLettres } = require("./backend/services/lettres");


/* =========================
   VARIABLES OBLIGATOIRES
========================= */

const VARIABLES_REQUISES = [
  "OPENAI_API_KEY",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
];

const manquantes = VARIABLES_REQUISES.filter((nom) => !process.env[nom]);

if (manquantes.length > 0) {
  console.error(`Variables d'environnement manquantes : ${manquantes.join(", ")}`);
  process.exit(1);
}

// Sans ces variables, l'API démarre mais les fonctions Premium répondent en erreur.
["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ID"]
  .filter((nom) => !process.env[nom])
  .forEach((nom) => console.warn(`Attention : ${nom} n'est pas défini.`));

const config = chargerConfig();


/* =========================
   SERVICES EXTERNES
========================= */

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

const firestore = admin.firestore();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60 * 1000,
  maxRetries: 1,
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_non_configure");


/* =========================
   APPLICATION
========================= */

const app = creerApp({
  config,
  verifyIdToken: (token, checkRevoked) => admin.auth().verifyIdToken(token, checkRevoked),
  stripe,
  services: {
    ia: creerServiceIA({ openai, modele: config.openaiModel }),
    comptes: creerServiceComptes(firestore, {
      limiteGratuite: config.freeLetterLimit,
      limiteMessagesGratuits: config.freeChatDailyLimit,
    }),
    facturation: creerServiceFacturation({ db: firestore, stripe, config }),
    lettres: creerServiceLettres(firestore),
    documents: creerServiceDocuments({
      pdfParse,
      ocr: (buffer, langue) => Tesseract.recognize(buffer, langue),
    }),
  },
});

app.listen(config.port, () => {
  console.log(`Serveur AdminFacile lancé sur le port ${config.port}`);
});
