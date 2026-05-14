require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const admin = require("firebase-admin");

const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

const firestore = admin.firestore();

const app = express();
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(cors());
app.post(
  "/stripe-webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    try {
      const event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      if (event.type === "checkout.session.completed") {
        const session = event.data.object;

        const email = session.customer_details.email;

        const usersRef = firestore.collection("users");
        const snapshot = await usersRef.where("Email", "==", email).get();

        if (!snapshot.empty) {
          snapshot.forEach(async (doc) => {
            await doc.ref.update({
              Premium: true,
            });
          });
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error("Erreur webhook Stripe :", error.message);
      res.status(400).send(`Webhook Error: ${error.message}`);
    }
  }
);

app.use(express.json());

app.post("/generer-lettre", async (req, res) => {
  try {
    const { type, nom, destinataire, objet } = req.body;

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

    res.json({ lettre: response.choices[0].message.content });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur lors de la génération." });
  }
});

app.post("/create-checkout-session", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",

      line_items: [
        {
          price: "price_1TWjZLGg20bixEhmm8TvQTTd",
          quantity: 1,
        },
      ],

    success_url: "https://venerable-pixie-e9c9a9.netlify.app/success.html",
    cancel_url: "https://venerable-pixie-e9c9a9.netlify.app/index.html",
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur Stripe" });
  }
});

app.listen(3000, () => {
  console.log("Serveur IA lancé sur http://localhost:3000");
});