const path = require("node:path");
const fs = require("node:fs");
const { firebaseCredentials } = require("../backend/config");
const { updateEnv } = require("./env-file");
try {
  const filename = process.argv[2];
  if (!filename)
    throw Error(
      "Usage : npm run services:firebase -- /chemin/vers/compte-de-service.json",
    );
  const resolved = path.resolve(filename);
  const credentials = firebaseCredentials({
    GOOGLE_APPLICATION_CREDENTIALS: resolved,
  });
  const current = require("dotenv").parse(
    fs.readFileSync(path.resolve(__dirname, "../.env")),
  );
  if (
    current.FIREBASE_PROJECT_ID &&
    current.FIREBASE_PROJECT_ID !== credentials.projectId
  )
    throw Error("Ce fichier ne correspond pas au projet configuré.");
  updateEnv({
    GOOGLE_APPLICATION_CREDENTIALS: resolved,
    FIREBASE_PROJECT_ID: credentials.projectId,
  });
  console.log(
    "Compte de service Firebase configuré. Aucun secret affiché ni copié dans les sources.",
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
