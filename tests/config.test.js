const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { generateKeyPairSync } = require("node:crypto");
const {
  firebaseCredentials,
  stripeConfig,
  billingAvailable,
} = require("../backend/config");
const { updateEnv } = require("../scripts/env-file");
test("Stripe refuse les mélanges test/production et reste fermé par défaut", () => {
  assert.deepEqual(stripeConfig({ STRIPE_SECRET_KEY: "sk_live_fixture" }), {
    mode: "disabled",
    key: null,
  });
  assert.throws(
    () =>
      stripeConfig({
        STRIPE_MODE: "test",
        STRIPE_SECRET_KEY: "sk_live_fixture",
      }),
    /ne correspond pas/,
  );
  assert.equal(
    stripeConfig({
      STRIPE_MODE: "test",
      STRIPE_TEST_SECRET_KEY: "sk_test_fixture",
      STRIPE_SECRET_KEY: "sk_live_fixture",
    }).key,
    "sk_test_fixture",
  );
  const env = {
    STRIPE_PRICE_ID: "price_fixture",
    PUBLIC_APP_URL: "https://example.test",
    STRIPE_CHECKOUT_ENABLED: "true",
  };
  assert.equal(billingAvailable(true, env), false);
  assert.equal(
    billingAvailable(true, { ...env, STRIPE_WEBHOOK_SECRET: "whsec_fixture" }),
    true,
  );
  assert.equal(
    billingAvailable(true, {
      ...env,
      STRIPE_WEBHOOK_SECRET: "whsec_fixture",
      STRIPE_CHECKOUT_ENABLED: "false",
    }),
    false,
  );
});
test("Firebase accepte le JSON ou les variables serveur et refuse un autre projet", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adminfacile-config-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const data = {
    project_id: "project-fixture",
    client_email: "fixture@project-fixture.iam.gserviceaccount.com",
    private_key: privateKey,
  };
  const filename = path.join(dir, "service.json");
  fs.writeFileSync(filename, JSON.stringify(data), { mode: 0o600 });
  assert.equal(
    firebaseCredentials({ GOOGLE_APPLICATION_CREDENTIALS: filename }).projectId,
    "project-fixture",
  );
  assert.equal(
    firebaseCredentials({ FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(data) })
      .privateKey,
    privateKey,
  );
  assert.equal(
    firebaseCredentials({
      FIREBASE_PROJECT_ID: data.project_id,
      FIREBASE_CLIENT_EMAIL: data.client_email,
      FIREBASE_PRIVATE_KEY: privateKey.replace(/\n/g, "\\n"),
    }).privateKey,
    privateKey,
  );
  assert.throws(
    () =>
      firebaseCredentials({
        GOOGLE_APPLICATION_CREDENTIALS: filename,
        FIREBASE_PROJECT_ID: "other",
      }),
    /ne correspond pas/,
  );
  assert.throws(
    () =>
      firebaseCredentials({
        FIREBASE_SERVICE_ACCOUNT_JSON: "secret-content-invalid",
      }),
    (e) => !e.message.includes("secret-content-invalid"),
  );
  assert.equal(firebaseCredentials({}), null);
});
test("mise à jour .env : valeurs existantes préservées, secrets non interprétés et fichier privé", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adminfacile-env-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const filename = path.join(dir, ".env");
  fs.writeFileSync(
    filename,
    '# configuration\nEXISTING="keep-this"\nPROJECT=old\n',
  );
  const literal = 'literal $() `commande` et "guillemets"';
  updateEnv({ PROJECT: "new", SECRET_FIXTURE: literal }, filename);
  const parsed = require("dotenv").parse(fs.readFileSync(filename));
  assert.equal(parsed.EXISTING, "keep-this");
  assert.equal(parsed.PROJECT, "new");
  assert.equal(parsed.SECRET_FIXTURE, literal);
  assert.equal(fs.statSync(filename).mode & 0o777, 0o600);
});
