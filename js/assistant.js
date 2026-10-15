/* =========================
   ASSISTANT
   Assistant administratif IA.
========================= */

import { afficherNotification, texteMultiligne } from "./ui.js";
import { appelerAPI } from "./api.js";


/* =========================
   ASSISTANT ADMINISTRATIF IA
========================= */

window.envoyerMessageIA = async function () {

  const input =
    document.getElementById("chatInput");

  const messages =
    document.getElementById("chatMessages");

  const question =
    input.value.trim();

  if (!question) {

    afficherNotification(
      "Écris une question."
    );

    return;
  }

  // Le quota de messages gratuits est appliqué par le serveur (réponse 402).

  /* Message utilisateur */

  messages.innerHTML += `
    <div class="message-user">
      ${texteMultiligne(question)}
    </div>
  `;

  input.value = "";

  try {

    const data = await appelerAPI("/chat-admin", { body: { message: question } });

    if (data.chatRemainingToday === 0) {
      afficherNotification("C’était ton dernier message gratuit aujourd’hui.");
    }

    /* Réponse IA */

    messages.innerHTML += `
      <div class="message-ia">
        ${texteMultiligne(data.reponse)}
      </div>
    `;

    messages.scrollTop =
      messages.scrollHeight;

  } catch (error) {

    console.error(
      "Erreur assistant IA :",
      error
    );

    afficherNotification(
      error.message || "Erreur assistant IA."
    );
  }
};
