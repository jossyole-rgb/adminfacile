import { db, auth, onAuthStateChanged } from "./firebase.js";

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let utilisateurConnecte = null;
let utilisateurPremium = false;

onAuthStateChanged(auth, async (user) => {
  utilisateurConnecte = user;

  if (user) {
    await verifierPremium(user.email);
  }

  mettreAJourDashboard();
});

window.genererLettre = async function () {
  const type = document.getElementById("typeLettre").value;
  const nom = document.getElementById("nom").value;
  const destinataire = document.getElementById("destinataire").value;
  const objet = document.getElementById("objet").value;

  const resultat = document.getElementById("resultat");
  const bouton = document.getElementById("btnGenerer");

  const q = query(
  collection(db, "lettres"),
  where("userId", "==", utilisateurConnecte.uid)
);

const querySnapshot = await getDocs(q);

if (!utilisateurPremium && querySnapshot.size >= 3) {
  resultat.innerText =
    "Limite gratuite atteinte. Passe à la version Premium.";

  return;
}

  if (!nom || !destinataire || !objet) {
    resultat.innerText =
      "Veuillez remplir tous les champs avant de générer la lettre.";
    return;
  }

  try {
    bouton.disabled = true;
    document.getElementById("loaderIA").style.display = "block";
    bouton.innerText = "Génération...";

    resultat.innerText = "L’IA rédige votre lettre...";

    const reponse = await fetch("https://adminfacile.onrender.com/generer-lettre", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type,
        nom,
        destinataire,
        objet,
      }),
    });

    const data = await reponse.json();

resultat.innerText = data.lettre;

try {
await addDoc(collection(db, "lettres"), {
  type: type,
  contenu: data.lettre,
  date: new Date().toLocaleDateString(),
  nom: nom,
  destinataire: destinataire,
  userId: utilisateurConnecte ? utilisateurConnecte.uid : null,
  email: utilisateurConnecte ? utilisateurConnecte.email : null
});

  console.log("Lettre sauvegardée dans Firestore");
  mettreAJourDashboard();
} catch (firestoreError) {
  console.error("Erreur Firestore :", firestoreError);
}

  } catch (error) {
    resultat.innerText =
      "Erreur lors de la génération. Vérifiez le serveur.";
  } finally {
    document.getElementById("loaderIA").style.display = "none";
    bouton.disabled = false;
    bouton.innerText = "Générer ma lettre";
  }
};

window.copierLettre = function () {
  const texte = document.getElementById("resultat").innerText;

  navigator.clipboard.writeText(texte);

  alert("Lettre copiée !");
};

window.telechargerLettre = function () {
  const texte = document.getElementById("resultat").innerText;

  const blob = new Blob([texte], { type: "text/plain" });

  const lien = document.createElement("a");

  lien.href = URL.createObjectURL(blob);

  lien.download = "lettre_adminfacile.txt";

  lien.click();
};

window.telechargerPDF = function () {
  const texte = document.getElementById("resultat").innerText;

  if (!texte || texte.includes("Veuillez remplir")) {
    alert("Génère d’abord une lettre avant de télécharger le PDF.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFont("times", "normal");
  doc.setFontSize(12);

  const lignes = doc.splitTextToSize(texte, 180);

  doc.text(lignes, 15, 20);

  doc.save("lettre_adminfacile.pdf");
};

window.chargerHistorique = async function () {
  const historique = document.getElementById("historique");

  historique.innerHTML = "Chargement de l’historique...";

  try {
    if (!utilisateurConnecte) {
  historique.innerHTML = "Connecte-toi pour voir ton historique.";
  return;
}

const q = query(
  collection(db, "lettres"),
  where("userId", "==", utilisateurConnecte.uid)
);

const querySnapshot = await getDocs(q);

    historique.innerHTML = "";

    if (querySnapshot.empty) {
  historique.innerHTML = "Aucune lettre enregistrée pour ce compte.";
  return;
}

    querySnapshot.forEach((doc) => {
      const lettre = doc.data();

      historique.innerHTML += `
        <div class="lettre-card">
          <h3>${lettre.type}</h3>
          <small>${lettre.date}</small>
          <p>${lettre.contenu}</p>
        </div>
      `;
    });
  } catch (error) {
    historique.innerHTML = "Erreur lors du chargement de l’historique.";
  }
};

async function verifierPremium(email) {
  try {
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("Email", "==", email));

    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const data = querySnapshot.docs[0].data();

      utilisateurPremium = data.Premium === true;

      console.log("Premium :", utilisateurPremium);
    } else {
      utilisateurPremium = false;
    }

    mettreAJourDashboard();
  } catch (error) {
    console.error("Erreur Premium :", error);
  }
}

async function mettreAJourDashboard() {
  const userEmail = document.getElementById("userEmail");
  const nombreLettres = document.getElementById("nombreLettres");
  const limiteGratuite = document.getElementById("limiteGratuite");

  if (!utilisateurConnecte) {
    userEmail.innerText = "Non connecté";
    nombreLettres.innerText = "0";
    return;
  }

  userEmail.innerText = utilisateurConnecte.email;

  const q = query(
    collection(db, "lettres"),
    where("userId", "==", utilisateurConnecte.uid)
  );

  const querySnapshot = await getDocs(q);

  nombreLettres.innerText = querySnapshot.size;

  const restantes = 3 - querySnapshot.size;

limiteGratuite.innerText =
  restantes > 0
    ? restantes + " restantes"
    : "Limite atteinte";
}


window.passerPremium = async function () {
  try {
    const response = await fetch("https://adminfacile.onrender.com/create-checkout-session", {
      method: "POST",
    });

    const data = await response.json();

    window.location.href = data.url;
  } catch (error) {
    alert("Erreur lors de la redirection Stripe.");
  }
};