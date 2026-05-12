require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

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

app.listen(3000, () => {
  console.log("Serveur IA lancé sur http://localhost:3000");
});