import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB_tDtb1IlbIkBi8vGspHUncepJBnD1Yrc",
  authDomain: "adminfacile.firebaseapp.com",
  projectId: "adminfacile",
  storageBucket: "adminfacile.firebasestorage.app",
  messagingSenderId: "537898349850",
  appId: "1:537898349850:web:9c9aed045981be3cdaa8a3"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);

window.creerCompte = async function () {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    await createUserWithEmailAndPassword(auth, email, password);

    alert("Compte créé !");
  } catch (error) {
    alert(error.message);
  }
};

window.connexion = async function () {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);

    alert("Connexion réussie !");
  } catch (error) {
    alert(error.message);
  }
};

window.deconnexion = async function () {
  await signOut(auth);

  alert("Déconnecté !");
};

export { auth, db, onAuthStateChanged };