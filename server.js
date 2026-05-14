/* =========================
   CONFIGURATION ENV
========================= */

require("dotenv").config();


/* =========================
   IMPORTS
========================= */

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const Stripe = require("stripe");
const admin = require("firebase-admin");


/* =========================
   INITIALISATION SERVICES
========================= */

/* Express */
const app = express();

/* OpenAI */
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* Stripe */
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/* Firebase Admin */
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

/* Firestore */
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
  "/stripe-webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];

    try {
      const event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const email = session.customer_details.email;
        const customerId = session.customer;

        if (!email) {
          console.log("Aucun email trouvé dans la session Stripe.");
          return res.json({ received: true });
        }

        const usersRef = firestore.collection("users");
        const snapshot = await usersRef.where("Email", "==", email).get();

        if (!snapshot.empty) {
          const updates = [];

          snapshot.forEach((document) => {
            updates.push(
              document.ref.update({
                Premium: true,
                customerId: customerId
              })
            );
          });

          await Promise.all(updates);

          console.log(`Compte Premium activé pour : ${email}`);
        } else {
          await usersRef.add({
            Email: email,
            Premium: true,
            customerId: customerId,
            createdAt: new Date().toISOString(),
          });

          console.log(`Nouvel utilisateur Premium créé : ${email}`);
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error("Erreur webhook Stripe :", error.message);

      res.status(400).send(`Webhook Error: ${error.message}`);
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
    const { type, nom, destinataire, objet } = req.body;

    if (!type || !nom || !destinataire || !objet) {
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
            "Tu es un assistant administratif français. Tu rédiges des lettres claires, polies et professionnelles.",
        },
        {
          role: "user",
          content: `Rédige une lettre administrative de type ${type}.
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
   CRÉATION SESSION STRIPE CHECKOUT
========================= */

app.post("/create-checkout-session", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",

      line_items: [
        {
          price: "price_1TX7UHGg20bixEhmy2KPxJ9D",
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

    const session =
      await stripe.billingPortal.sessions.create({

        customer: customerId,

        return_url:
          "https://venerable-pixie-e9c9a9.netlify.app"
      });

    res.json({
      url: session.url
    });

  } catch (error) {

    console.error(
      "Erreur portail Stripe :",
      error
    );

    res.status(500).json({
      error: error.message
    });
  }
});


/* =========================
   LANCEMENT SERVEUR
========================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Serveur AdminFacile lancé sur le port ${PORT}`);
});