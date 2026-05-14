import { db, auth, onAuthStateChanged } from "./firebase.js";

import {
  collection,
  addDoc,
  getDocs,
  query,
  where
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
  const loader = document.getElementById("loaderIA");

  if (!utilisateurConnecte) {
    resultat.innerText = "Connecte-toi avant de générer une lettre.";
    return;
  }

  if (!nom || !destinataire || !objet) {
    resultat.innerText =
      "Veuillez remplir tous les champs avant de générer la lettre.";
    return;
  }

  try {
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

    bouton.disabled = true;
    bouton.innerText = "Génération...";
    loader.style.display = "block";
    resultat.innerText = "L’IA rédige votre lettre...";

    const reponse = await fetch(
      "https://adminfacile.onrender.com/generer-lettre",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type,
          nom,
          destinataire,
          objet
        })
      }
    );

    const data = await reponse.json();

    resultat.innerText = data.lettre;

    try {
      await addDoc(collection(db, "lettres"), {
        type,
        contenu: data.lettre,
        date: new Date().toLocaleDateString(),
        nom,
        destinataire,
        userId: utilisateurConnecte.uid,
        email: utilisateurConnecte.email
      });

      console.log("Lettre sauvegardée dans Firestore");
      mettreAJourDashboard();
    } catch (firestoreError) {
      console.error("Erreur Firestore :", firestoreError);
    }
  } catch (error) {
    console.error(error);
    resultat.innerText =
      "Erreur lors de la génération. Vérifiez le serveur.";
  } finally {
    loader.style.display = "none";
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

    querySnapshot.forEach((document) => {
      const lettre = document.data();

      historique.innerHTML += `
        <div class="lettre-card">
          <h3>${lettre.type}</h3>
          <small>${lettre.date}</small>
          <p>${lettre.contenu}</p>
        </div>
      `;
    });
  } catch (error) {
    console.error(error);
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
    } else {
      utilisateurPremium = false;
    }

    console.log("Premium :", utilisateurPremium);
  } catch (error) {
    console.error("Erreur Premium :", error);
    utilisateurPremium = false;
  }
}

async function mettreAJourDashboard() {
  const userEmail = document.getElementById("userEmail");
  const nombreLettres = document.getElementById("nombreLettres");
  const limiteGratuite = document.getElementById("limiteGratuite");
  const statutCompte = document.getElementById("statutCompte");

  if (!utilisateurConnecte) {
    userEmail.innerText = "Non connecté";
    nombreLettres.innerText = "0";
    limiteGratuite.innerText = "3 restantes";
    statutCompte.innerText = "Version gratuite";
    return;
  }

  userEmail.innerText = utilisateurConnecte.email;

  statutCompte.innerText = utilisateurPremium
    ? "Premium actif"
    : "Version gratuite";

  const q = query(
    collection(db, "lettres"),
    where("userId", "==", utilisateurConnecte.uid)
  );

  const querySnapshot = await getDocs(q);

  nombreLettres.innerText = querySnapshot.size;

  if (utilisateurPremium) {
    limiteGratuite.innerText = "Illimité";
  } else {
    const restantes = 3 - querySnapshot.size;

    limiteGratuite.innerText =
      restantes > 0 ? restantes + " restantes" : "Limite atteinte";
  }
}

window.passerPremium = async function () {
  try {
    const response = await fetch(
      "https://adminfacile.onrender.com/create-checkout-session",
      {
        method: "POST"
      }
    );

    const data = await response.json();

    window.location.href = data.url;
  } catch (error) {
    console.error(error);
    alert("Erreur lors de la redirection Stripe.");
  }
};