/* =========================
   ÉTAT PARTAGÉ
   État de la session courante, partagé entre les modules.
========================= */

export const etat = {
  utilisateur: null,
  premium: false,
  stripeCustomerId: null,
  emailVerifie: false,
  analyseCourante: "",
  lettreCouranteId: null
};
