/* =========================
   AUTH
   Authentification Firebase, création de compte, statut Premium.
========================= */

import { db, auth, onAuthStateChanged, sendPasswordResetEmail, sendEmailVerification, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "../firebase.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { etat } from "./etat.js";
import { afficherNotification } from "./ui.js";
import { mettreAJourDashboard } from "./dashboard.js";


/* =========================
   RESET PASSWORD
========================= */

window.reinitialiserMotDePasse = async function () {
  const email = document.getElementById("email")?.value.trim();

  if (!email) {
    afficherNotification("Saisis ton email dans le champ ci-dessus, puis clique à nouveau sur « Mot de passe oublié ».");
    document.getElementById("email")?.focus();
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    afficherNotification("📩 Email de réinitialisation envoyé.");
  } catch (error) {
    console.error("Erreur reset password :", error);
    afficherNotification("Erreur lors de l’envoi.");
  }
};


/* =========================
   AUTHENTIFICATION
========================= */

onAuthStateChanged(auth, async (user) => {
  const pageActuelle = window.location.pathname;
  const estDashboard = pageActuelle.includes("dashboard.html");

  if (!user) {
    etat.utilisateur = null;
    etat.emailVerifie = false;
    etat.premium = false;
    etat.stripeCustomerId = null;

    if (estDashboard) {
      window.location.href = "index.html";
    }

    return;
  }

  etat.utilisateur = user;
  etat.emailVerifie = user.emailVerified;

  await verifierPremium(user.uid);

  if (!estDashboard) {
    window.location.href = "dashboard.html";
    return;
  }

  await mettreAJourDashboard();
});


window.creerCompte = async function () {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!email || !password) {
    afficherNotification("Veuillez remplir l’email et le mot de passe.");
    return;
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    await sendEmailVerification(userCredential.user);

    const user = userCredential.user;

    await setDoc(doc(db, "users", user.uid), {
      email: user.email,
      premium: false,
      subscriptionStatus: "inactive",
      stripeCustomerId: null,
      createdAt: new Date()
    });


    afficherNotification("📩 Compte créé. Email de vérification envoyé.");
  } catch (error) {
    console.error("Erreur création compte :", error);
    afficherNotification("Erreur lors de la création du compte.");
  }
};

window.connexion = async function () {
  const email = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value.trim();

  if (!email || !password) {
    afficherNotification("Veuillez remplir tous les champs.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);

    afficherNotification("Connexion réussie !");

    window.location.href = "dashboard.html";
  } catch (error) {
    console.error("Erreur connexion :", error);
    afficherNotification("Email ou mot de passe incorrect.");
  }
};


/* =========================
   STATUT PREMIUM
========================= */

export async function verifierPremium(uid) {
  try {
    const userRef = doc(db, "users", uid);

    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      etat.premium = false;
      etat.stripeCustomerId = null;
      return;
    }

    const data = userSnap.data();

    etat.premium =
      data.premium === true &&
      data.subscriptionStatus === "active";

    etat.stripeCustomerId =
      data.stripeCustomerId || null;

  } catch (error) {
    console.error("Erreur Premium :", error);

    etat.premium = false;
    etat.stripeCustomerId = null;
  }
}


/* =========================
   DÉCONNEXION
========================= */

window.deconnexion = async function () {
  try {
    await signOut(auth);
    afficherNotification("Déconnexion effectuée.");
  } catch (error) {
    console.error("Erreur déconnexion :", error);
    afficherNotification("Erreur lors de la déconnexion.");
  }
};
