require("dotenv").config();
const fs = require("node:fs");
const { JWT } = require("google-auth-library");
const { firebaseCredentials } = require("../backend/config");
const cases = [
  {
    name: "profil gratuit autorisé",
    expectation: "ALLOW",
    request: {
      auth: { uid: "recette-alice" },
      method: "create",
      path: "/databases/(default)/documents/users/recette-alice",
      resource: {
        data: {
          email: "fixture@example.invalid",
          premium: false,
          subscriptionStatus: "inactive",
          stripeCustomerId: null,
        },
      },
    },
  },
  {
    name: "auto-attribution Premium refusée",
    expectation: "DENY",
    request: {
      auth: { uid: "recette-alice" },
      method: "create",
      path: "/databases/(default)/documents/users/recette-alice",
      resource: { data: { premium: true, subscriptionStatus: "active" } },
    },
  },
  {
    name: "modification des droits refusée",
    expectation: "DENY",
    request: {
      auth: { uid: "recette-alice" },
      method: "update",
      path: "/databases/(default)/documents/users/recette-alice",
      resource: { data: { premium: true } },
    },
    resource: { data: { premium: false } },
  },
  {
    name: "lecture étrangère refusée",
    expectation: "DENY",
    request: {
      auth: { uid: "recette-bob" },
      method: "get",
      path: "/databases/(default)/documents/lettres/fixture",
    },
    resource: { data: { userId: "recette-alice" } },
  },
  {
    name: "lecture propriétaire autorisée",
    expectation: "ALLOW",
    request: {
      auth: { uid: "recette-alice" },
      method: "get",
      path: "/databases/(default)/documents/lettres/fixture",
    },
    resource: { data: { userId: "recette-alice" } },
  },
  {
    name: "transfert de propriétaire refusé",
    expectation: "DENY",
    request: {
      auth: { uid: "recette-alice" },
      method: "update",
      path: "/databases/(default)/documents/lettres/fixture",
      resource: { data: { userId: "recette-bob" } },
    },
    resource: { data: { userId: "recette-alice" } },
  },
  {
    name: "quota client refusé",
    expectation: "DENY",
    request: {
      auth: { uid: "recette-alice" },
      method: "create",
      path: "/databases/(default)/documents/usage/recette-alice",
      resource: { data: { lettersUsed: 0 } },
    },
  },
  {
    name: "accès anonyme refusé",
    expectation: "DENY",
    request: {
      method: "get",
      path: "/databases/(default)/documents/lettres/fixture",
    },
    resource: { data: { userId: "recette-alice" } },
  },
];
(async () => {
  const credentials = firebaseCredentials(process.env);
  const client = new JWT({
    email: credentials.clientEmail,
    key: credentials.privateKey,
    scopes: ["https://www.googleapis.com/auth/firebase"],
  });
  try {
    const token = (await client.authorize()).access_token;
    const project = process.env.FIREBASE_PROJECT_ID;
    const response = await fetch(
      "https://firebaserules.googleapis.com/v1/projects/" + project + ":test",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source: {
            files: [
              {
                name: "firestore.rules",
                content: fs.readFileSync("firestore.rules", "utf8"),
              },
            ],
          },
          testSuite: { testCases: cases.map(({ name, ...c }) => c) },
        }),
        signal: AbortSignal.timeout(30000),
      },
    );
    const result = await response.json();
    if (!response.ok) {
      console.log(
        JSON.stringify({
          status: response.status,
          error: result.error?.status,
        }),
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      JSON.stringify({
        issues: result.issues,
        tests: result.testResults?.map((r, i) => ({
          name: cases[i].name,
          state: r.state,
          errors: r.errorMessage,
        })),
      }),
    );
    if (
      result.issues?.some((i) => i.severity === "ERROR") ||
      result.testResults?.length !== cases.length ||
      result.testResults.some((r) => r.state !== "SUCCESS")
    )
      process.exitCode = 1;
  } finally {
    // Aucun service persistant ouvert.
  }
})().catch((e) => {
  console.error("Validation impossible : " + (e.code || "connexion"));
  process.exitCode = 1;
});
