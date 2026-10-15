const {
  initializeApp,
  getApps,
  cert,
  deleteApp,
} = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { firebaseCredentials } = require("./config");
function createFirebase(env = process.env, name = "[DEFAULT]") {
  const credentials = firebaseCredentials(env);
  if (!credentials) return null;
  const app =
    getApps().find((a) => a.name === name) ||
    initializeApp({ credential: cert(credentials) }, name);
  return {
    app,
    authAdmin: getAuth(app),
    db: getFirestore(app),
    close: () => deleteApp(app),
  };
}
module.exports = { createFirebase };
