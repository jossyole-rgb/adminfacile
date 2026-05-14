/* =========================
   IMPORTS FIREBASE
========================= */

/* Firebase App */
import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

/* Firebase Authentication */
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/* Firebase Firestore */
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

/* Authentification Firebase */
const auth = getAuth(app);

/* Base de données Firestore */
const db = getFirestore(app);


/* =========================
   CRÉATION DE COMPTE
========================= */

window.creerCompte = async function () {
  const email = document.getElementById("email").value.trim();

  const password = document
    .getElementById("password")
    .value
    .trim();

  if (!email || !password) {
    alert("Veuillez remplir tous les champs.");
    return;
  }

  try {
    await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    alert("Compte créé avec succès !");
  } catch (error) {
    console.error("Erreur création compte :", error);

    alert(error.message);
  }
};


/* =========================
   CONNEXION UTILISATEUR
========================= */

window.connexion = async function () {
  const email = document.getElementById("email").value.trim();

  const password = document
    .getElementById("password")
    .value
    .trim();

  if (!email || !password) {
    alert("Veuillez remplir tous les champs.");
    return;
  }

  try {
    await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    alert("Connexion réussie !");
  } catch (error) {
    console.error("Erreur connexion :", error);

    alert(error.message);
  }
};


/* =========================
   DÉCONNEXION UTILISATEUR
========================= */

window.deconnexion = async function () {
  try {
    await signOut(auth);

    alert("Déconnexion réussie !");
  } catch (error) {
    console.error("Erreur déconnexion :", error);

    alert("Erreur lors de la déconnexion.");
  }
};


/* =========================
   EXPORTS
========================= */

export {
  auth,
  db,
  onAuthStateChanged
};