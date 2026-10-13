/* =========================
   AUTHENTIFICATION FIREBASE
   Vérifie le token envoyé dans l'en-tête Authorization: Bearer <token>.
========================= */

function creerVerifierUtilisateur(verifyIdToken) {
  return async function verifierUtilisateur(req, res, next) {
    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Authentification requise.",
        code: "AUTH_REQUIRED",
      });
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        error: "Authentification requise.",
        code: "AUTH_REQUIRED",
      });
    }

    try {
      // checkRevoked = true : refuse les sessions révoquées (compte désactivé, mot de passe changé).
      req.user = await verifyIdToken(token, true);
      return next();
    } catch (error) {
      return res.status(401).json({
        error: "Session invalide ou expirée.",
        code: "AUTH_INVALID",
      });
    }
  };
}

function exigerEmailVerifie(req, res, next) {
  if (!req.user || req.user.email_verified !== true) {
    return res.status(403).json({
      error: "Vérifie ton email avant d'utiliser cette fonctionnalité.",
      code: "EMAIL_NOT_VERIFIED",
    });
  }

  return next();
}

module.exports = { creerVerifierUtilisateur, exigerEmailVerifie };
