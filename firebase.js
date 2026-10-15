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

import { ENVIRONNEMENT, configurationFirebase } from "./js/config.js";


/* =========================
   CONFIGURATION FIREBASE
========================= */

const firebaseConfig = configurationFirebase(ENVIRONNEMENT);


/* =========================
   INITIALISATION FIREBASE
   Ce module ne fait qu'initialiser Firebase : les actions (connexion, création de compte,
   déconnexion) sont dans js/auth.js. La configuration dépend de l'environnement (js/config.js).
========================= */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);


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