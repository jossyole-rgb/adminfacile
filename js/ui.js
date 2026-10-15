/* =========================
   UI
   Affichage : échappement HTML, notifications, chargement, thème, confirmation.
========================= */




/* =========================
   SÉCURITÉ AFFICHAGE
   Tout texte venant de l'IA, de Firestore ou de l'utilisateur
   est échappé avant d'être inséré avec innerHTML.
========================= */

export function echapperHTML(valeur) {
  return String(valeur ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function texteMultiligne(valeur) {
  return echapperHTML(valeur).replace(/\n/g, "<br>");
}


/* =========================
   NOTIFICATIONS
========================= */

export function afficherNotification(message) {
  const notification = document.getElementById("notification");

  if (!notification) return;

  notification.innerText = message;
  notification.classList.add("show");

  setTimeout(() => {
    notification.classList.remove("show");
  }, 3000);
}

export function afficherLoader(message = "Chargement...") {
  const overlay = document.getElementById("loaderOverlay");
  const text = document.getElementById("loaderText");

  text.innerText = message;

  overlay.style.display = "flex";
}

export function masquerLoader() {
  const overlay = document.getElementById("loaderOverlay");

  overlay.style.display = "none";
}

export function afficherToast(message, type = "success") {

  const container = document.getElementById("toastContainer");

  const toast = document.createElement("div");

  toast.className = `toast toast-${type}`;

  toast.innerHTML = `
    ${message}
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3500);
}


/* =========================
   MODE SOMBRE
========================= */

window.changerTheme = function () {
  document.body.classList.toggle("dark-mode");

  const boutonTheme = document.getElementById("btnTheme");
  const modeSombre = document.body.classList.contains("dark-mode");

  if (modeSombre) {
    boutonTheme.innerText = "☀️ Mode clair";
    localStorage.setItem("theme", "dark");
  } else {
    boutonTheme.innerText = "🌙 Mode sombre";
    localStorage.setItem("theme", "light");
  }
};


/* =========================
   CHARGEMENT THÈME SAUVEGARDÉ
========================= */

window.addEventListener("DOMContentLoaded", () => {
  const themeSauvegarde = localStorage.getItem("theme");
  const boutonTheme = document.getElementById("btnTheme");

  if (themeSauvegarde === "dark") {
    document.body.classList.add("dark-mode");

    if (boutonTheme) {
      boutonTheme.innerText = "☀️ Mode clair";
    }
  }
});


/* =========================
   MODAL CONFIRMATION SUPPRESSION
========================= */

window.ouvrirConfirmModal = function (onConfirm, titre = "🗑️ Supprimer cette analyse ?") {
  const modal = document.getElementById("confirmModal");
  const confirmBtn = document.getElementById("confirmDeleteBtn");
  const titreModal = modal ? modal.querySelector("h3") : null;

  if (!modal || !confirmBtn) return;

  if (titreModal) {
    titreModal.textContent = titre;
  }

  modal.style.display = "flex";
  focaliserModale(modal);

  confirmBtn.onclick = () => {
    onConfirm();
    window.fermerConfirmModal();
  };
};

window.fermerConfirmModal = function () {
  const modal = document.getElementById("confirmModal");

  if (!modal) return;

  modal.style.display = "none";
  restaurerFocus();
};


/* =========================
   MODALES : CLAVIER ET FOCUS
   Le focus entre dans la modale à l'ouverture, Échap la ferme
   et le focus revient sur l'élément qui l'avait ouverte.
========================= */

let elementAvantModale = null;

export function focaliserModale(modal) {
  elementAvantModale = document.activeElement;

  const cible = modal.querySelector("input, textarea, select, button");

  if (cible) {
    cible.focus();
  }
}

export function restaurerFocus() {
  if (elementAvantModale && typeof elementAvantModale.focus === "function") {
    elementAvantModale.focus();
  }

  elementAvantModale = null;
}

document.addEventListener("keydown", (evenement) => {
  if (evenement.key !== "Escape") return;

  const ouverte = [...document.querySelectorAll(".modal-overlay")].find(
    (modal) => modal.style.display === "flex"
  );

  if (!ouverte) return;

  ouverte.style.display = "none";
  document.body.classList.remove("modal-open");
  restaurerFocus();
});
