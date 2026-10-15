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
   Ce module ne fait qu'initialiser Firebase : les actions (connexion, création de compte,
   déconnexion) sont dans js/auth.js. La clé ci-dessus est un identifiant public de projet,
   pas un secret : l'accès aux données est protégé par les règles Firestore et l'API.
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