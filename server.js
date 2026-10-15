// Express / Firebase / OpenAI / Stripe : services existants, configuration côté serveur.
const demo = process.env.DEMO_MODE === "true";
if (!demo) require("dotenv").config();
const { createApp } = require("./backend/app");
const { MemoryStore } = require("./backend/core");
const { createAI, demoAI } = require("./backend/services");
const { stripeConfig } = require("./backend/config");
let store, verifyToken, ai, stripe, authAdmin, db;
if (demo) {
  store = new MemoryStore();
  store.users.set("demo-camille", {
    name: "Camille",
    email: "camille@example.test",
    premium: false,
  });
  verifyToken = async (token) => {
    if (token !== "local-demo") throw Error("Session invalide");
    return {
      uid: "demo-camille",
      name: "Camille",
      email: "camille@example.test",
      email_verified: true,
    };
  };
  ai = demoAI;
} else {
  const services = require("./backend/firebase").createFirebase();
  if (services) {
    db = services.db;
    authAdmin = services.authAdmin;
    store = new (require("./backend/firestore-store").FirestoreStore)(db);
    verifyToken = (t) => authAdmin.verifyIdToken(t, true);
  }
  const OpenAI = require("openai");
  ai = createAI(
    process.env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : null,
    process.env.OPENAI_MODEL,
  );
  const stripeSettings = stripeConfig();
  if (stripeSettings.key) stripe = new (require("stripe"))(stripeSettings.key);
}
const app = createApp({
  store,
  verifyToken,
  ai,
  stripe,
  authAdmin,
  db,
  demo,
  aiConfigured: !demo && !!process.env.OPENAI_API_KEY,
  synchronizeSubscription: db
    ? require("./backend/subscriptions").createSubscriptionSynchronizer(
        db,
        stripe,
      )
    : undefined,
});
const port = Number(process.env.PORT || 3000),
  host = demo ? "127.0.0.1" : process.env.HOST || "0.0.0.0";
if (require.main === module)
  app.listen(port, host, () =>
    console.log(
      `AdminFacile : http://${host === "0.0.0.0" ? "localhost" : host}:${port} (${demo ? "démonstration locale, données temporaires" : "services réels"})`,
    ),
  );
module.exports = app;
