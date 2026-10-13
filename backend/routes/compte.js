/* =========================
   ROUTES COMPTE ET FACTURATION
========================= */

const express = require("express");
const { exigerEmailVerifie } = require("../middleware/auth");

function creerRoutesCompte({ verifierUtilisateur, comptes, facturation, lettres }) {
  const router = express.Router();

  router.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  router.get("/api/me", verifierUtilisateur, async (req, res, next) => {
    try {
      const etat = await comptes.lireEtatCompte(req.user.uid);

      return res.json({
        uid: req.user.uid,
        email: req.user.email || null,
        emailVerified: req.user.email_verified === true,
        ...etat,
      });
    } catch (error) {
      return next(error);
    }
  });

  /* ---------- Historique des lettres ---------- */

  router.get("/api/letters", verifierUtilisateur, async (req, res, next) => {
    try {
      const limite = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
      const decalage = Math.max(parseInt(req.query.offset, 10) || 0, 0);
      return res.json(await lettres.lister(req.user.uid, { limite, decalage }));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/api/letters/:id", verifierUtilisateur, async (req, res, next) => {
    try {
      return res.json(await lettres.lire(req.user.uid, req.params.id));
    } catch (error) {
      return next(error);
    }
  });

  router.delete("/api/letters/:id", verifierUtilisateur, async (req, res, next) => {
    try {
      await lettres.supprimer(req.user.uid, req.params.id);
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  /* Checkout : uid et email proviennent du token, jamais du corps de la requête. */
  async function checkout(req, res, next) {
    try {
      const url = await facturation.creerSessionCheckout({
        uid: req.user.uid,
        email: req.user.email,
      });
      return res.json({ url });
    } catch (error) {
      return next(error);
    }
  }

  /* Portail : le client Stripe est retrouvé à partir du uid ; tout customerId envoyé est ignoré. */
  async function portail(req, res, next) {
    try {
      const url = await facturation.creerSessionPortail({ uid: req.user.uid });
      return res.json({ url });
    } catch (error) {
      return next(error);
    }
  }

  router.post("/create-checkout-session", verifierUtilisateur, exigerEmailVerifie, checkout);
  router.post("/api/billing/checkout", verifierUtilisateur, exigerEmailVerifie, checkout);

  router.post("/create-customer-portal-session", verifierUtilisateur, portail);
  router.post("/api/billing/portal", verifierUtilisateur, portail);

  return router;
}

module.exports = { creerRoutesCompte };
