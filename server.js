/* =========================
   CONFIGURATION ENV
========================= */

require("dotenv").config();


/* =========================
   IMPORTS
========================= */

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const OpenAI = require("openai");
const Stripe = require("stripe");
const admin = require("firebase-admin");
const Tesseract = require("tesseract.js");


/* =========================
   INITIALISATION SERVICES
========================= */

const app = express();

/* =========================
   CONFIGURATION UPLOAD
========================= */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

const firestore = admin.firestore();


/* =========================
   MIDDLEWARES
========================= */

app.use(cors());


/* =========================
   WEBHOOK STRIPE
   Important : cette route doit être AVANT express.json()
========================= */

app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (error) {
      console.error("Erreur webhook Stripe :", error.message);
      return res.status(400).send(`Webhook Error: ${error.message}`);
    }

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;

        const email = session.customer_details?.email;
        const customerId = session.customer;
        const uid = session.client_reference_id;

        if (!email || !customerId) {
          console.log("Email ou customerId manquant dans la session Stripe.");
          return res.json({ received: true });
        }

        const userRef = firestore.collection("users").doc(uid);

        await userRef.update({
          premium: true,
          subscriptionStatus: "active",
          stripeCustomerId: customerId,
        });

        if (!snapshot.empty) {
          const userDoc = snapshot.docs[0];

          await userDoc.ref.update({
            premium: true,
            subscriptionStatus: "active",
            stripeCustomerId: customerId,
          });

          console.log(`Premium activé pour : ${email}`);
        } else {
          await usersRef.add({
            email,
            premium: true,
            subscriptionStatus: "active",
            stripeCustomerId: customerId,
            createdAt: new Date().toISOString(),
          });

          console.log(`Utilisateur Premium créé : ${email}`);
        }
      }

      if (event.type === "customer.subscription.deleted") {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        const usersRef = firestore.collection("users");
        const snapshot = await usersRef
          .where("stripeCustomerId", "==", customerId)
          .get();

        if (!snapshot.empty) {
          const userDoc = snapshot.docs[0];

          await userDoc.ref.update({
            premium: false,
            subscriptionStatus: "inactive",
          });

          console.log(`Premium désactivé pour customer : ${customerId}`);
        }
      }

      if (event.type === "customer.subscription.deleted") {
  const subscription = event.data.object;

  const snapshot = await firestore
    .collection("users")
    .where("stripeCustomerId", "==", subscription.customer)
    .get();

  snapshot.forEach(async (doc) => {
    await doc.ref.update({
      premium: false,
      subscriptionStatus: "canceled",
    });
  });
}

if (event.type === "invoice.payment_failed") {
  const invoice = event.data.object;

  const snapshot = await firestore
    .collection("users")
    .where("stripeCustomerId", "==", invoice.customer)
    .get();

  snapshot.forEach(async (doc) => {
    await doc.ref.update({
      premium: false,
      subscriptionStatus: "payment_failed",
    });
  });
}

if (event.type === "customer.subscription.updated") {
  const subscription = event.data.object;

  const snapshot = await firestore
    .collection("users")
    .where("stripeCustomerId", "==", subscription.customer)
    .get();

  snapshot.forEach(async (doc) => {
    await doc.ref.update({
      subscriptionStatus: subscription.status,
    });
  });
}

      res.json({ received: true });
    } catch (error) {
      console.error("Erreur traitement webhook :", error);

      res.status(500).json({
        error: "Erreur lors du traitement du webhook Stripe.",
      });
    }
  }
);


/* JSON classique pour les autres routes */
app.use(express.json());


/* =========================
   ROUTE TEST SERVEUR
========================= */

app.get("/", (req, res) => {
  res.send("Serveur AdminFacile actif 🚀");
});


/* =========================
   GÉNÉRATION DE LETTRE IA
========================= */

app.post("/generer-lettre", async (req, res) => {
  try {
    const { type, tonLettre, nom, destinataire, objet } = req.body;

    if (!type || !tonLettre || !nom || !destinataire || !objet) {
      return res.status(400).json({
        error: "Tous les champs sont obligatoires.",
      });
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Tu es un assistant administratif français expert. \
            Tu rédiges des lettres administratives extrêmement professionnelles, crédibles et humaines. \
            Les lettres doivent être détaillées, bien structurées, polies et adaptées au contexte français. \
            Tu utilises un vocabulaire administratif réaliste. \
            La lettre doit contenir : \
            - une introduction claire \
            - un développement détaillé \
            - des arguments crédibles \
            - une demande précise \
            - une formule de politesse professionnelle. \
            La lettre doit sembler écrite par un vrai conseiller administratif français.",
        },
        {
          role: "user",
          content: `Rédige une lettre administrative de type ${type}

          Le ton de la lettre doit être : ${tonLettre}.

          Nom: ${nom}
          Destinataire: ${destinataire}
          Situation: ${objet}`,
        },
      ],
    });

    const lettre = response.choices[0].message.content;

    res.json({ lettre });
  } catch (error) {
    console.error("Erreur OpenAI :", error);

    res.status(500).json({
      error: "Erreur lors de la génération de la lettre.",
    });
  }
});


/* =========================
   RÉSUMÉ IA DE LA LETTRE
========================= */

app.post("/resumer-lettre", async (req, res) => {
  try {
    const { texte } = req.body;

    if (!texte) {
      return res.status(400).json({
        error: "Texte requis.",
      });
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",

      messages: [
        {
          role: "system",
          content:
            "Tu es un assistant administratif français. Tu résumes les lettres administratives de manière claire, concise et professionnelle.",
        },
        {
          role: "user",
          content: `Résume cette lettre administrative en 5 à 8 lignes maximum :\n\n${texte}`,
        },
      ],
    });

    const resume = response.choices[0].message.content;

    res.json({
      resume,
    });
  } catch (error) {
    console.error("Erreur résumé IA :", error);

    res.status(500).json({
      error: "Erreur lors du résumé de la lettre.",
    });
  }
});


/* =========================
   RÉÉCRITURE IA
========================= */

app.post("/reecrire-lettre", async (req, res) => {
  try {
    const { texte, style } = req.body;

    if (!texte || !style) {
      return res.status(400).json({
        error: "Texte et style requis.",
      });
    }

    const instructions = {
      professionnel:
        "Réécris cette lettre avec un ton plus professionnel, clair et crédible.",
      juridique:
        "Réécris cette lettre avec un ton plus juridique, formel et structuré.",
      poli:
        "Réécris cette lettre avec un ton plus poli, courtois et respectueux.",
      ferme:
        "Réécris cette lettre avec un ton plus ferme, direct et assertif, sans être agressif.",
      court:
        "Raccourcis cette lettre en gardant les informations essentielles.",
    };

    const instruction =
      instructions[style] || instructions.professionnel;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",

      messages: [
        {
          role: "system",
          content:
            "Tu es un assistant administratif français expert. Tu réécris des lettres administratives en améliorant leur style, leur clarté et leur crédibilité.",
        },
        {
          role: "user",
          content: `${instruction}

Lettre à réécrire :

${texte}`,
        },
      ],
    });

    const lettre = response.choices[0].message.content;

    res.json({
      lettre,
    });
  } catch (error) {
    console.error("Erreur réécriture IA :", error);

    res.status(500).json({
      error: "Erreur lors de la réécriture de la lettre.",
    });
  }
});


/* =========================
   ASSISTANT ADMINISTRATIF IA
========================= */

app.post("/chat-admin", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        error: "Message requis.",
      });
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",

      messages: [
        {
          role: "system",
          content:
            "Tu es un assistant administratif français expert. Tu aides les utilisateurs avec leurs démarches administratives françaises. Tu réponds de manière claire, professionnelle, pratique et humaine. Tu ne remplaces pas un avocat, mais tu expliques les démarches possibles et tu peux aider à rédiger des courriers.",
        },
        {
          role: "user",
          content: message,
        },
      ],
    });

    const reponse = response.choices[0].message.content;

    res.json({
      reponse,
    });
  } catch (error) {
    console.error("Erreur assistant IA :", error);

    res.status(500).json({
      error: "Erreur assistant IA.",
    });
  }
});


/* =========================
   UPLOAD DOCUMENT ADMINISTRATIF
========================= */

app.post(
  "/upload-document",
  upload.array("documents", 5),
  async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
          error: "Aucun document reçu.",
      });
    }

    console.log("Route upload appelée");
    const premierFichier = req.files[0];

    console.log(
      "Fichier reçu :",
      premierFichier.originalname,
      premierFichier.mimetype
    );


      let texteExtrait = "";

    if (premierFichier.mimetype === "application/pdf") {

  console.log("Début analyse PDF");

  const data = await pdfParse(premierFichier.buffer);

  texteExtrait = data.text.slice(0, 4000);
}

    if (
  premierFichier.mimetype === "image/png" ||
  premierFichier.mimetype === "image/jpeg" ||
  premierFichier.mimetype === "image/jpg"
) {
      console.log("OCR démarré...");

const result = await Tesseract.recognize(
  premierFichier.buffer,
  "fra"
);

console.log("OCR terminé");

texteExtrait = result.data.text.slice(0, 4000);

console.log("OCR image terminé avec succès");
    }

      console.log("PDF analysé avec succès");

          let analyseIA = "Aucune analyse disponible.";

if (texteExtrait.trim()) {
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Tu es un assistant administratif français expert. Analyse les documents administratifs de manière claire, professionnelle et utile.",
      },
      {
        role: "user",
        content: ` 
        Analyse ce document administratif français comme un assistant administratif expert.

        Ta mission :
        - identifier précisément le type de document ;
        - repérer l’organisme émetteur ;
        - détecter les dates importantes ;
        - détecter les montants ;
        - évaluer l’urgence réelle ;
        - expliquer ce que l’utilisateur doit comprendre ;
        - recommander des actions concrètes ;
        - signaler les risques ou points de vigilance ;
        - produire un résumé clair, utile et professionnel.

        Réponds STRICTEMENT avec cette structure :

        TYPE_DOCUMENT:
        (type précis du document)

        ORGANISME:
        (nom de l'organisme ou "Non détecté")

        DATE_IMPORTANTE:
        (date principale + signification)

        MONTANT:
        (montant principal + explication, ou "Aucun montant détecté")

        URGENCE:
        (faible, moyenne ou élevée)

        POINTS_IMPORTANTS:
        - point important 1
        - point important 2
        - point important 3

        ACTIONS_RECOMMANDEES:
        - action concrète 1
        - action concrète 2
        - action concrète 3

        RISQUES_OU_VIGILANCE:
        - risque ou vigilance 1
        - risque ou vigilance 2

        RESUME:
        (résumé clair en 4 à 6 lignes, avec un ton professionnel)

        DOCUMENT:
        ${texteExtrait}
        `,
    },
  ],
});
      


  analyseIA = completion.choices[0].message.content;
}

res.json({
  success: true,
  nom: premierFichier.originalname,
  type: premierFichier.mimetype,
  taille: premierFichier.size,
  analyse: analyseIA,
});
    } catch (error) {
      console.error("Erreur upload document :", error);

      res.status(500).json({
        error: "Erreur lors de l'upload du document.",
      });
    }
  }
);


/* =========================
   CRÉATION SESSION STRIPE CHECKOUT
========================= */

app.post("/create-checkout-session", async (req, res) => {
  try {
    const { uid, email } = req.body;

    if (!uid || !email) {
      return res.status(400).json({
        error: "UID ou email manquant.",
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",

      client_reference_id: uid,
      customer_email: email,

      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],

      success_url:
        "https://venerable-pixie-e9c9a9.netlify.app/success.html",

      cancel_url:
        "https://venerable-pixie-e9c9a9.netlify.app/index.html",
    });

    res.json({
      url: session.url,
    });
  } catch (error) {
    console.error("Erreur Stripe :", error);

    res.status(500).json({
      error: "Erreur lors de la création de la session Stripe.",
    });
  }
});


/* =========================
   PORTAIL CLIENT STRIPE
========================= */

app.post("/create-customer-portal-session", async (req, res) => {
  try {
    const { customerId } = req.body;

    if (!customerId) {
      return res.status(400).json({
        error: "customerId manquant.",
      });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: "https://venerable-pixie-e9c9a9.netlify.app",
    });

    res.json({
      url: session.url,
    });
  } catch (error) {
    console.error("Erreur portail Stripe :", error);

    res.status(500).json({
      error: error.message,
    });
  }
});


/* =========================
   LANCEMENT SERVEUR
========================= */

const PORT = process.env.PORT || 3000;


app.post("/generer-reponse-ia", async (req, res) => {
  try {
    const { document, ton } = req.body;

    if (!document) {
      return res.status(400).json({
        error: "Document requis",
      });
    }

    const styles = {
      professionnel:
        "Réponse professionnelle, claire, crédible et administrative.",
      juridique:
        "Réponse juridique, formelle et structurée.",
      ferme:
        "Réponse ferme, sérieuse et assertive.",
      poli:
        "Réponse polie, calme et diplomatique.",
    };

    const instruction =
      styles[ton] || styles.professionnel;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",

      messages: [
        {
          role: "system",
          content:
            "Tu es un expert administratif français spécialisé dans les réponses aux courriers administratifs.",
        },

        {
          role: "user",
          content: `
${instruction}

Analyse le document suivant puis rédige une réponse administrative complète, crédible et réaliste.

La réponse doit :
- être prête à envoyer ;
- utiliser un vrai ton administratif français ;
- contenir une introduction ;
- répondre précisément au problème ;
- inclure une demande claire ;
- finir par une formule de politesse professionnelle.

DOCUMENT :

${document}
`,
        },
      ],
    });

    const reponse = completion.choices[0].message.content;

    res.json({ reponse });
  } catch (error) {
    console.error("Erreur génération réponse IA :", error);

    res.status(500).json({
      error: "Erreur IA",
    });
  }
});


app.post("/chat-document", async (req, res) => {
  try {
    const { question, analyse } = req.body;

    if (!question || !analyse) {
      return res.status(400).json({
        error: "Question et analyse requises.",
      });
    }

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",

      messages: [
        {
          role: "system",
          content:
            "Tu es un assistant administratif français expert. Tu réponds uniquement à partir de l'analyse du document fournie.",
        },
        {
          role: "user",
          content: `
Analyse du document :
${analyse}

Question utilisateur :
${question}

Réponds clairement, simplement et utilement.
`,
        },
      ],
    });

    const reponse = completion.choices[0].message.content;

    res.json({ reponse });
  } catch (error) {
    console.error("Erreur chat document :", error);

    res.status(500).json({
      error: "Erreur chat document.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Serveur AdminFacile lancé sur le port ${PORT}`);
});