/* =========================
   VALIDATION DES ENTRÉES
========================= */

class ErreurValidation extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.code = "INVALID_INPUT";
    this.expose = true;
  }
}

/**
 * Lit un champ texte obligatoire, le nettoie et vérifie sa longueur.
 */
function texteRequis(body, champ, { max, libelle = champ }) {
  const valeur = body ? body[champ] : undefined;

  if (typeof valeur !== "string" || !valeur.trim()) {
    throw new ErreurValidation(`Le champ « ${libelle} » est obligatoire.`);
  }

  const nettoye = valeur.trim();

  if (nettoye.length > max) {
    throw new ErreurValidation(
      `Le champ « ${libelle} » dépasse ${max} caractères.`
    );
  }

  return nettoye;
}

/**
 * Accepte uniquement une valeur d'une liste fermée ; sinon valeur par défaut.
 */
function choix(body, champ, valeursAutorisees, parDefaut) {
  const valeur = body ? body[champ] : undefined;

  return valeursAutorisees.includes(valeur) ? valeur : parDefaut;
}

module.exports = { ErreurValidation, texteRequis, choix };
