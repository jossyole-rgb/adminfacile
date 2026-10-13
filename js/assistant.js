/* =========================
   ASSISTANT
   Assistant administratif IA.
========================= */

import { etat } from "./etat.js";
import { afficherNotification, texteMultiligne } from "./ui.js";
import { appelerAPI } from "./api.js";

const LIMITE_MESSAGES_IA = 5;


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

  if (
    !etat.premium &&
    etat.nombreMessagesIA >= LIMITE_MESSAGES_IA
  ) {

    afficherNotification(
      "Limite gratuite IA atteinte."
    );

    return;
  }

  /* Message utilisateur */

  messages.innerHTML += `
    <div class="message-user">
      ${texteMultiligne(question)}
    </div>
  `;

  input.value = "";

  try {

    const data = await appelerAPI("/chat-admin", { body: { message: question } });

    etat.nombreMessagesIA++;

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
