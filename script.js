async function genererLettre() {
  const type = document.getElementById("typeLettre").value;
  const nom = document.getElementById("nom").value;
  const destinataire = document.getElementById("destinataire").value;
  const objet = document.getElementById("objet").value;

  const resultat = document.getElementById("resultat");
  const bouton = document.getElementById("btnGenerer");

  if (!nom || !destinataire || !objet) {
    resultat.innerText =
      "Veuillez remplir tous les champs avant de générer la lettre.";
    return;
  }

  try {
    bouton.disabled = true;
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
  } catch (error) {
    resultat.innerText =
      "Erreur lors de la génération. Vérifiez le serveur.";
  } finally {
    bouton.disabled = false;
    bouton.innerText = "Générer ma lettre";
  }
}

function copierLettre() {
  const texte = document.getElementById("resultat").innerText;

  navigator.clipboard.writeText(texte);

  alert("Lettre copiée !");
}

function telechargerLettre() {
  const texte = document.getElementById("resultat").innerText;

  const blob = new Blob([texte], { type: "text/plain" });

  const lien = document.createElement("a");

  lien.href = URL.createObjectURL(blob);

  lien.download = "lettre_adminfacile.txt";

  lien.click();
}