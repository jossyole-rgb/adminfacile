/* =========================
   IMPORTS FIREBASE
========================= */

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


/* =========================
   CONFIGURATION FIREBASE
========================= */

const firebaseConfig = {
  apiKey: "AIzaSyB_tDtb1IlbIkBi8vGspHUncepJBnD1Yrc",
  authDomain: "adminfacile.firebaseapp.com",
  projectId: "adminfacile",
  storageBucket: "adminfacile.firebasestorage.app",
  messagingSenderId: "537898349850",
  appId: "1:537898349850:web:9c9aed045981be3cdaa8a3"
};


/* =========================
   INITIALISATION FIREBASE
========================= */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);


/* =========================
   NOTIFICATIONS
========================= */

function afficherNotification(message) {
  const notification = document.getElementById("notification");

  if (!notification) return;

  notification.innerText = message;
  notification.classList.add("show");

  setTimeout(() => {
    notification.classList.remove("show");
  }, 3000);
}


/* =========================
   CRÉATION DE COMPTE
========================= */

window.creerCompte = async function () {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!email || !password) {
    afficherNotification("Veuillez remplir tous les champs.");
    return;
  }

  try {
    await createUserWithEmailAndPassword(auth, email, password);
    afficherNotification("Compte créé avec succès !");
  } catch (error) {
    console.error("Erreur création compte :", error);
    afficherNotification("Erreur lors de la création du compte.");
  }
};


/* =========================
   CONNEXION UTILISATEUR
========================= */

window.connexion = async function () {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!email || !password) {
    afficherNotification("Veuillez remplir tous les champs.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    afficherNotification("Connexion réussie !");
  } catch (error) {
    console.error("Erreur connexion :", error);
    afficherNotification("Email ou mot de passe incorrect.");
  }
};


/* =========================
   DÉCONNEXION UTILISATEUR
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


/* =========================
   EXPORTS
========================= */

export {
  auth,
  db,
  onAuthStateChanged,
  sendPasswordResetEmail,
  sendEmailVerification,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
};