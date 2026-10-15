const fs = require("node:fs");
const { createPrivateKey } = require("node:crypto");
const { HttpError } = require("./core");
function firebaseCredentials(env = process.env) {
  let value;
  try {
    if (env.GOOGLE_APPLICATION_CREDENTIALS) {
      value = JSON.parse(
        fs.readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"),
      );
    } else if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      value = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } else if (
      env.FIREBASE_CLIENT_EMAIL &&
      env.FIREBASE_PRIVATE_KEY &&
      env.FIREBASE_PROJECT_ID
    ) {
      value = {
        project_id: env.FIREBASE_PROJECT_ID,
        client_email: env.FIREBASE_CLIENT_EMAIL,
        private_key: env.FIREBASE_PRIVATE_KEY,
      };
    } else return null;
    if (!value.project_id || !value.client_email || !value.private_key)
      throw Error();
    if (
      env.FIREBASE_PROJECT_ID &&
      env.FIREBASE_PROJECT_ID !== value.project_id
    ) {
      throw new HttpError(
        503,
        "Le compte de service Firebase ne correspond pas au projet configuré.",
      );
    }
    const privateKey = value.private_key.replace(/\\n/g, "\n");
    createPrivateKey(privateKey);
    return {
      projectId: value.project_id,
      clientEmail: value.client_email,
      privateKey,
    };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(
      503,
      "Identifiants Firebase invalides ou fichier du compte de service inaccessible.",
    );
  }
}
function stripeConfig(env = process.env) {
  const mode =
    env.STRIPE_MODE ||
    (env.STRIPE_SECRET_KEY?.startsWith("sk_test_") ? "test" : "disabled");
  if (mode === "disabled") return { mode, key: null };
  if (!["test", "live"].includes(mode))
    throw new HttpError(503, "STRIPE_MODE doit être test, live ou disabled.");
  const key =
    mode === "test"
      ? env.STRIPE_TEST_SECRET_KEY || env.STRIPE_SECRET_KEY
      : env.STRIPE_SECRET_KEY;
  if (!key) return { mode, key: null };
  if (!key.startsWith(mode === "test" ? "sk_test_" : "sk_live_")) {
    throw new HttpError(
      503,
      "La clé Stripe ne correspond pas au mode sélectionné.",
    );
  }
  return { mode, key };
}
function billingAvailable(stripe, env = process.env) {
  return !!(
    stripe &&
    env.STRIPE_PRICE_ID &&
    env.PUBLIC_APP_URL &&
    env.STRIPE_WEBHOOK_SECRET &&
    env.STRIPE_CHECKOUT_ENABLED === "true"
  );
}
module.exports = { firebaseCredentials, stripeConfig, billingAvailable };
