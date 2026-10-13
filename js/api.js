/* =========================
   API
   Appels à l'API AdminFacile avec le token Firebase.
========================= */

import { etat } from "./etat.js";

export const API_URL = "https://adminfacile.onrender.com";


/* =========================
   APPELS API
   Ajoute le token Firebase et renvoie une erreur lisible.
========================= */

export async function appelerAPI(chemin, { method = "POST", body, formData } = {}) {
  if (!etat.utilisateur) {
    throw new Error("Connecte-toi pour utiliser cette fonctionnalité.");
  }

  const token = await etat.utilisateur.getIdToken();
  const headers = { Authorization: `Bearer ${token}` };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let reponse;

  try {
    reponse = await fetch(`${API_URL}${chemin}`, {
      method,
      headers,
      body: formData || (body !== undefined ? JSON.stringify(body) : undefined)
    });
  } catch (error) {
    throw new Error("Connexion au serveur impossible. Vérifie ta connexion internet.");
  }

  let data = {};

  try {
    data = await reponse.json();
  } catch (error) {
    data = {};
  }

  if (!reponse.ok) {
    const erreur = new Error(data.error || "Une erreur est survenue. Réessaie.");
    erreur.code = data.code;
    erreur.status = reponse.status;
    throw erreur;
  }

  return data;
}
