const express = require("express"),
  helmet = require("helmet"),
  cors = require("cors"),
  compression = require("compression"),
  multer = require("multer"),
  rateLimit = require("express-rate-limit");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { assert, text, validateFile, HttpError } = require("./core");
const exportsService = require("./exports");
const { billingAvailable } = require("./config");
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
function createApp({
  store,
  verifyToken,
  ai,
  stripe,
  authAdmin,
  db,
  demo = false,
  aiConfigured = false,
  synchronizeSubscription,
  env = process.env,
}) {
  const app = express(),
    root = path.resolve(__dirname, "..");
  app.disable("x-powered-by");
  app.set("trust proxy", Number(env.TRUST_PROXY_HOPS || 0));
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.set("X-Request-ID", req.requestId);
    next();
  });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "https://www.gstatic.com"],
          connectSrc: [
            "'self'",
            "https://*.googleapis.com",
            "https://*.firebaseio.com",
            "https://securetoken.googleapis.com",
            ...(env.API_ORIGIN ? [env.API_ORIGIN] : []),
          ],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          frameSrc: ["https://*.firebaseapp.com"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: env.NODE_ENV === "production" ? [] : null,
        },
      },
      crossOriginResourcePolicy: { policy: "same-site" },
    }),
  );
  app.use(compression());
  const origins = (
    env.ALLOWED_ORIGINS ||
    "http://localhost:3000,http://127.0.0.1:3000,https://adminfacile-app.netlify.app"
  ).split(",");
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || origins.includes(origin)),
      methods: ["GET", "POST", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );
  app.post(
    ["/webhook", "/stripe-webhook"],
    express.raw({ type: "application/json", limit: "1mb" }),
    wrap(async (req, res) => {
      assert(
        stripe && db && env.STRIPE_WEBHOOK_SECRET,
        503,
        "Facturation non configurée.",
      );
      let event;
      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          req.headers["stripe-signature"],
          env.STRIPE_WEBHOOK_SECRET,
        );
      } catch {
        throw new HttpError(400, "Signature Stripe invalide.");
      }
      const object = event.data.object,
        ref = db.collection("stripeEvents").doc(event.id);
      if ((await ref.get()).exists) return res.json({ received: true });
      const relevant = [
        "checkout.session.completed",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "invoice.payment_failed",
        "invoice.paid",
      ];
      if (!relevant.includes(event.type)) {
        await ref.set({
          type: event.type,
          processedAt: new Date().toISOString(),
        });
        return res.json({ received: true });
      }
      let uid = object.client_reference_id;
      let subscription;
      if (event.type === "checkout.session.completed") {
        assert(uid && object.subscription, 400, "Session sans abonnement.");
        subscription = await stripe.subscriptions.retrieve(object.subscription);
      } else {
        const subId = event.type.startsWith("customer.subscription.")
          ? object.id
          : object.subscription ||
            object.parent?.subscription_details?.subscription;
        if (subId) {
          subscription = await stripe.subscriptions.retrieve(subId);
        }
      }
      uid = uid || subscription?.metadata?.uid;
      if (!uid) {
        const q = await db
          .collection("subscriptions")
          .where("stripeCustomerId", "==", object.customer)
          .limit(1)
          .get();
        uid = q.docs[0]?.id;
        if (!uid && subscription) {
          const sessions = await stripe.checkout.sessions.list({
            customer: object.customer,
            limit: 100,
          });
          const session = sessions.data.find(
            (s) =>
              s.status === "complete" &&
              s.subscription === subscription.id &&
              s.client_reference_id,
          );
          uid = session?.client_reference_id;
        }
      }
      // Une facture arrivée avant Checkout doit être retentée, pas acquittée et perdue.
      assert(uid, 409, "Association client en attente.");
      const currentStatus =
        subscription?.status ||
        (event.type === "invoice.payment_failed" ? "past_due" : "incomplete");
      await db.runTransaction(async (tx) => {
        const userRef = db.collection("subscriptions").doc(uid);
        const [existing, user] = await Promise.all([
          tx.get(ref),
          tx.get(userRef),
        ]);
        if (existing.exists) return;
        const stale =
          (user.data()?.lastStripeEventCreated || 0) > (event.created || 0);
        if (!stale)
          tx.set(
            userRef,
            {
              lastStripeEventCreated: event.created || 0,
              premium: ["active", "trialing"].includes(currentStatus),
              subscriptionStatus: currentStatus,
              stripeCustomerId: object.customer,
              stripeSubscriptionId: subscription?.id || null,
              cancelAtPeriodEnd: subscription?.cancel_at_period_end || false,
              updatedAt: new Date().toISOString(),
            },
            { merge: true },
          );
        if (!stale)
          tx.set(
            db.collection("users").doc(uid),
            {
              premium: ["active", "trialing"].includes(currentStatus),
              subscriptionStatus: currentStatus,
              stripeCustomerId: object.customer,
              updatedAt: new Date().toISOString(),
            },
            { merge: true },
          );
        tx.set(ref, {
          type: event.type,
          processedAt: new Date().toISOString(),
        });
      });
      res.json({ received: true });
    }),
  );
  app.use(express.json({ limit: "96kb" }));
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Trop de requêtes. Réessayez dans quelques minutes." },
  });
  app.use("/api", limiter);
  app.get("/api/health", (req, res) =>
    res.json({
      status: "ok",
      mode: demo ? "demo" : "live",
      configured: !!store,
    }),
  );
  app.get("/api/config", (req, res) =>
    res.json({
      demo,
      authConfigured: !!verifyToken,
      services: {
        firebase: !!verifyToken,
        openai: aiConfigured,
        stripe: stripe ? env.STRIPE_MODE || "test" : "disabled",
      },
      billingAvailable: billingAvailable(stripe, env),
      billingPriceLabel: env.STRIPE_PRICE_LABEL || null,
      firebase: {
        apiKey:
          env.PUBLIC_FIREBASE_API_KEY ||
          "AIzaSyB_tDtb1IlbIkBi8vGspHUncepJBnD1Yrc",
        authDomain:
          env.PUBLIC_FIREBASE_AUTH_DOMAIN || "adminfacile.firebaseapp.com",
        projectId: env.FIREBASE_PROJECT_ID || "adminfacile",
        appId:
          env.PUBLIC_FIREBASE_APP_ID ||
          "1:537898349850:web:9c9aed045981be3cdaa8a3",
      },
    }),
  );
  const authenticate = wrap(async (req, res, next) => {
    const token = /^Bearer (.+)$/.exec(req.headers.authorization || "")?.[1];
    assert(token, 401, "Connectez-vous pour continuer.");
    assert(
      verifyToken && store,
      503,
      "Firebase n’est pas configuré sur ce serveur.",
    );
    try {
      req.user = await verifyToken(token);
    } catch {
      throw new HttpError(401, "Votre session a expiré. Reconnectez-vous.");
    }
    assert(req.user?.uid, 401, "Session invalide.");
    if (env.REQUIRE_VERIFIED_EMAIL === "true")
      assert(
        req.user.email_verified,
        403,
        "Vérifiez votre adresse e-mail avant de continuer.",
      );
    if (synchronizeSubscription) await synchronizeSubscription(req.user);
    next();
  });
  const router = express.Router();
  router.use(authenticate);
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  const iaLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    keyGenerator: (req) => req.user.uid,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      error: "Limite temporaire IA atteinte. Patientez quelques minutes.",
    },
  });
  router.get(
    "/me",
    wrap(async (req, res) =>
      res.json({
        uid: req.user.uid,
        email: req.user.email,
        name: req.user.name || req.user.email?.split("@")[0] || "Mon espace",
        ...(await store.profile(req.user.uid)),
      }),
    ),
  );
  router.get(
    "/activities",
    wrap(async (req, res) => {
      assert(
        !req.query.kind || ["letter", "analysis"].includes(req.query.kind),
        400,
        "Filtre invalide.",
      );
      const all = await store.list(req.user.uid, req.query.kind);
      const filtered = all.filter(
        (r) =>
          !req.query.q ||
          r.title
            .toLocaleLowerCase("fr")
            .includes(String(req.query.q).toLocaleLowerCase("fr")),
      );
      const offset = Math.max(0, Number(req.query.offset) || 0);
      res.json({
        items: filtered
          .slice(offset, offset + 20)
          .map(({ id, kind, title, createdAt }) => ({
            id,
            kind,
            title,
            createdAt,
          })),
        total: filtered.length,
        nextOffset: offset + 20 < filtered.length ? offset + 20 : null,
      });
    }),
  );
  router.get(
    "/activities/:id",
    wrap(async (req, res) =>
      res.json(await store.get(req.user.uid, req.params.id)),
    ),
  );
  router.patch(
    "/activities/:id",
    wrap(async (req, res) => {
      const content = text(req.body.content, "Contenu", 30000),
        title = text(req.body.title, "Titre", 160);
      res.json(
        await store.update(req.user.uid, req.params.id, { content, title }),
      );
    }),
  );
  router.delete(
    "/activities/:id",
    wrap(async (req, res) => {
      await store.remove(req.user.uid, req.params.id);
      res.status(204).end();
    }),
  );
  async function generate(req, res, reply = false) {
    if (reply && req.body.documentId) {
      const source = await store.get(
        req.user.uid,
        text(req.body.documentId, "Analyse", 160),
      );
      assert(source.kind === "analysis", 400, "Sélectionnez une analyse.");
      req.body.document = source.sourceText || source.content;
    }
    const input = reply
      ? {
          document: text(req.body.document, "Document", 24000),
          situation: String(req.body.situation || "").slice(0, 6000),
          ton: text(req.body.ton || "Courtois", "Ton", 40),
          title: "Réponse au courrier",
        }
      : {
          type: text(req.body.type, "Catégorie", 80),
          tonLettre: text(req.body.tonLettre || req.body.ton, "Ton", 40),
          nom: text(req.body.nom, "Votre nom", 120),
          destinataire: text(req.body.destinataire, "Destinataire", 200),
          title: text(req.body.title || req.body.objet, "Objet", 160),
          situation: text(
            req.body.situation || req.body.objet,
            "Situation",
            6000,
          ),
        };
    const charged = await store.reserve(req.user.uid);
    try {
      const content = await ai(
        reply
          ? "Rédige une réponse au document reçu, à partir des faits fournis."
          : "Rédige un courrier administratif structuré, sans ajouter de faits.",
        input,
      );
      const activity = await store.save(req.user.uid, {
        kind: "letter",
        type: input.type || "reponse",
        title: input.title,
        content,
        nom: input.nom,
        destinataire: input.destinataire,
      });
      res.status(201).json({ ...activity, lettre: content, reponse: content });
    } catch (e) {
      try {
        await store.refund(req.user.uid, charged);
      } catch {
        console.error(
          JSON.stringify({
            event: "quota_refund_failed",
            requestId: req.requestId,
          }),
        );
      }
      throw e;
    }
  }
  router.post(
    "/letters",
    iaLimit,
    wrap((req, res) => generate(req, res)),
  );
  router.post(
    "/replies",
    iaLimit,
    wrap((req, res) => generate(req, res, true)),
  );
  router.post(
    "/rewrite",
    iaLimit,
    wrap(async (req, res) => {
      const content = await ai(
        "Réécris le courrier selon le style demandé, en conservant strictement les faits.",
        {
          texte: text(req.body.texte, "Texte", 20000),
          style: text(req.body.style, "Style", 80),
        },
      );
      res.json({ content, lettre: content });
    }),
  );
  router.post(
    "/summary",
    iaLimit,
    wrap(async (req, res) => {
      const content = await ai("Résume le courrier en 5 lignes.", {
        texte: text(req.body.texte, "Texte", 20000),
      });
      res.json({ content, resume: content });
    }),
  );
  router.post(
    "/chat",
    iaLimit,
    wrap(async (req, res) =>
      res.json({
        reponse: await ai(
          "Explique la démarche. Ne donne aucun conseil réglementaire non vérifié.",
          { message: text(req.body.message, "Question", 4000) },
        ),
      }),
    ),
  );
  router.post(
    "/document-chat",
    iaLimit,
    wrap(async (req, res) => {
      const row = await store.get(
        req.user.uid,
        text(req.body.id, "Analyse", 160),
      );
      assert(row.kind === "analysis", 400, "Sélectionnez une analyse.");
      res.json({
        reponse: await ai(
          "Réponds uniquement à partir du document, distingue les informations manquantes.",
          {
            question: text(req.body.question, "Question", 2000),
            document: row.sourceText || row.content,
          },
        ),
      });
    }),
  );
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 2 },
  });
  let activeDocuments = 0;
  router.post(
    "/documents",
    iaLimit,
    upload.fields([
      { name: "document", maxCount: 1 },
      { name: "documents", maxCount: 1 },
    ]),
    wrap(async (req, res) => {
      assert(
        activeDocuments < 2,
        429,
        "Deux documents sont déjà en cours d’analyse. Réessayez dans un instant.",
      );
      activeDocuments++;
      try {
        req.file = req.files?.document?.[0] || req.files?.documents?.[0];
        const type = validateFile(req.file);
        let extracted = "";
        if (!demo) {
          if (type === "application/pdf") {
            let data;
            try {
              data = await require("pdf-parse")(
                new Uint8Array(req.file.buffer),
                { max: 40 },
              );
            } catch {
              throw new HttpError(
                422,
                "Le PDF est illisible, protégé ou endommagé. Essayez un autre PDF ou une image.",
              );
            }
            assert(
              data.numpages <= 40,
              422,
              "Le PDF dépasse la limite de 40 pages. Importez uniquement les pages utiles.",
            );
            extracted = data.text;
            assert(
              extracted.trim(),
              422,
              "Ce PDF ne contient pas de texte lisible. Importez les pages scannées en PNG ou JPG pour utiliser l’OCR.",
            );
          } else {
            const worker = await require("tesseract.js").createWorker("fra");
            let timer;
            try {
              const result = await Promise.race([
                worker.recognize(req.file.buffer),
                new Promise((resolve, reject) => {
                  timer = setTimeout(
                    () =>
                      reject(
                        new HttpError(
                          422,
                          "La lecture a pris trop de temps. Essayez une image plus petite.",
                        ),
                      ),
                    60000,
                  );
                }),
              ]);
              extracted = result.data.text;
            } finally {
              clearTimeout(timer);
              await worker.terminate();
            }
          }
          assert(
            extracted.trim(),
            422,
            "Aucun texte lisible. Essayez un document plus net.",
          );
        }
        const content = await ai(
          "Analyse le document : SYNTHÈSE, ÉCHÉANCES, ACTIONS SUGGÉRÉES, PASSAGES CITÉS et INCERTITUDES. Cite les passages exacts qui fondent les échéances. Signale si le texte a été tronqué.",
          {
            texte: extracted.slice(0, 24000),
            tronque: extracted.length > 24000,
          },
        );
        const row = await store.save(req.user.uid, {
          kind: "analysis",
          title: req.file.originalname.slice(0, 160),
          content,
          mimeType: type,
          size: req.file.size,
          sourceText: extracted.slice(0, 24000),
        });
        res.status(201).json({
          ...row,
          analyse: row.content,
          nom: row.title,
          type: row.mimeType,
          taille: row.size,
        });
      } finally {
        activeDocuments--;
      }
    }),
  );
  router.post(
    "/export/:format",
    wrap(async (req, res) => {
      const content = text(req.body.content, "Contenu", 30000),
        format = req.params.format;
      assert(["pdf", "docx"].includes(format), 400, "Format invalide.");
      const bytes = await exportsService[format](content);
      res
        .set(
          "Content-Disposition",
          `attachment; filename="courrier-adminfacile.${format}"`,
        )
        .type(
          format === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        .send(bytes);
    }),
  );
  router.get(
    "/subscription",
    wrap(async (req, res) => {
      const p = await store.profile(req.user.uid);
      res.json({
        premium: p.premium === true,
        status: p.subscriptionStatus || "free",
        used: p.used,
        limit: 3,
        cancelAtPeriodEnd: p.cancelAtPeriodEnd || false,
        billingAvailable: billingAvailable(stripe, env),
        billingPriceLabel: env.STRIPE_PRICE_LABEL || null,
      });
    }),
  );
  router.post(
    "/billing/checkout",
    wrap(async (req, res) => {
      assert(
        billingAvailable(stripe, env),
        503,
        "L’offre Premium n’est pas encore ouverte.",
      );
      const p = await store.profile(req.user.uid);
      assert(!p.premium, 409, "Vous disposez déjà d’un abonnement actif.");
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        client_reference_id: req.user.uid,
        ...(p.stripeCustomerId
          ? { customer: p.stripeCustomerId }
          : { customer_email: req.user.email }),
        subscription_data: { metadata: { uid: req.user.uid } },
        line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
        success_url: env.PUBLIC_APP_URL + "/app.html#billing",
        cancel_url: env.PUBLIC_APP_URL + "/app.html#billing",
      });
      res.json({ url: session.url });
    }),
  );
  router.post(
    "/billing/portal",
    wrap(async (req, res) => {
      assert(stripe && env.PUBLIC_APP_URL, 503, "Facturation non configurée.");
      const p = await store.profile(req.user.uid);
      assert(
        p.stripeCustomerId,
        404,
        "Aucun abonnement associé à votre compte.",
      );
      const session = await stripe.billingPortal.sessions.create({
        customer: p.stripeCustomerId,
        ...(env.STRIPE_PORTAL_CONFIGURATION_ID
          ? { configuration: env.STRIPE_PORTAL_CONFIGURATION_ID }
          : {}),
        return_url: env.PUBLIC_APP_URL + "/app.html#billing",
      });
      res.json({ url: session.url });
    }),
  );
  router.delete(
    "/me",
    wrap(async (req, res) => {
      assert(req.body.confirm === "SUPPRIMER", 400, "Confirmation requise.");
      assert(
        demo || Date.now() / 1000 - req.user.auth_time < 300,
        401,
        "Reconnectez-vous avant de supprimer votre compte.",
      );
      const p = await store.profile(req.user.uid);
      assert(
        !p.stripeCustomerId,
        409,
        "Contactez le support pour clôturer votre compte facturé et traiter les obligations de conservation.",
      );
      await store.deleteAccount(req.user.uid);
      if (authAdmin) await authAdmin.deleteUser(req.user.uid);
      res.status(204).end();
    }),
  );
  app.use("/api", router);
  // Compatibilité des anciennes URLs, soumises aux mêmes contrôles que la nouvelle API.
  const aliases = {
    "/generer-lettre": "/letters",
    "/generer-reponse-ia": "/replies",
    "/chat-admin": "/chat",
    "/resumer-lettre": "/summary",
    "/reecrire-lettre": "/rewrite",
    "/create-checkout-session": "/billing/checkout",
    "/create-customer-portal-session": "/billing/portal",
    "/upload-document": "/documents",
    "/chat-document": "/document-chat",
  };
  for (const [old, target] of Object.entries(aliases))
    app.post(old, (req, res, next) => {
      req.url = target;
      router(req, res, next);
    });
  app.get(
    ["/index.html", "/dashboard.html", "/dashboard_v2.html"],
    (req, res) => res.redirect("/app.html"),
  );
  app.get("/", (req, res) => res.sendFile(path.join(root, "app.html")));
  app.get("/app.html", (req, res) => res.sendFile(path.join(root, "app.html")));
  app.use(
    "/frontend",
    express.static(path.join(root, "frontend"), { dotfiles: "deny" }),
  );
  app.use(
    "/assets",
    express.static(path.join(root, "assets"), { dotfiles: "deny" }),
  );
  app.use((req, res) =>
    res.status(404).json({ error: "Page ou route introuvable." }),
  );
  app.use((err, req, res, next) => {
    const status = err instanceof multer.MulterError ? 400 : err.status || 500;
    if (status >= 500)
      console.error(
        JSON.stringify({
          event: "request_failed",
          requestId: req.requestId,
          status,
        }),
      );
    res.status(status).json({
      error:
        err instanceof multer.MulterError
          ? "Fichier refusé : un seul document, de 8 Mo maximum."
          : status >= 500 && !err.status
            ? "Le service est momentanément indisponible. Réessayez."
            : err.message,
      requestId: req.requestId,
    });
  });
  return app;
}
module.exports = { createApp };
