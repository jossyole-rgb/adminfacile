require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(cors());
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
          price: "price_1TWZNEK48wyEctXeUVPHLAqw",
          quantity: 1,
        },
      ],

      success_url: "http://127.0.0.1:5500/success.html",
      cancel_url: "http://127.0.0.1:5500/index.html",
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