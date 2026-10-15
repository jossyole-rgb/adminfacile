const { assert } = require("./core");
const collections = { letter: "lettres", analysis: "analyses" };
const clean = (d) =>
  Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined));
function normalize(d, kind) {
  const v = d.data();
  const raw = v.createdAt || v.date;
  const french =
    typeof raw === "string" && /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  const date = french
    ? new Date(Date.UTC(+french[3], +french[2] - 1, +french[1])).toISOString()
    : raw?.toDate
      ? raw.toDate().toISOString()
      : typeof raw === "string" && /^\d{4}-/.test(raw)
        ? raw
        : "1970-01-01T00:00:00.000Z";
  return {
    ...v,
    id: `${kind}:${d.id}`,
    kind,
    title: String(v.title || v.typeDocument || v.type || v.nom || "Courrier"),
    content: v.content || v.contenu || v.analyseComplete || v.resume || "",
    createdAt: date,
  };
}
class FirestoreStore {
  constructor(db) {
    this.db = db;
  }
  async list(uid, kind) {
    const kinds = kind ? [kind] : Object.keys(collections);
    const lists = await Promise.all(
      kinds.map(async (k) => {
        const q = await this.db
          .collection(collections[k])
          .where("userId", "==", uid)
          .get();
        return q.docs.map((d) => normalize(d, k));
      }),
    );
    return lists
      .flat()
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
      );
  }
  ref(id) {
    const [kind, key, ...extra] = id.split(":");
    assert(
      collections[kind] && key && !extra.length,
      404,
      "Activité introuvable.",
    );
    return { kind, ref: this.db.collection(collections[kind]).doc(key) };
  }
  async get(uid, id) {
    const { kind, ref } = this.ref(id);
    const d = await ref.get();
    assert(d.exists && d.data().userId === uid, 404, "Activité introuvable.");
    return normalize(d, kind);
  }
  async save(uid, row) {
    const ref = this.db.collection(collections[row.kind]).doc();
    const data = clean({
      ...row,
      userId: uid,
      createdAt: new Date().toISOString(),
    });
    await ref.set(data);
    return normalize({ id: ref.id, data: () => data }, row.kind);
  }
  async update(uid, id, data) {
    await this.get(uid, id);
    const { kind, ref } = this.ref(id);
    await ref.update({ ...clean(data), updatedAt: new Date().toISOString() });
    return normalize(await ref.get(), kind);
  }
  async remove(uid, id) {
    await this.get(uid, id);
    await this.ref(id).ref.delete();
  }
  async profile(uid) {
    const [user, usage, subscription] = await Promise.all([
      this.db.collection("users").doc(uid).get(),
      this.db.collection("usage").doc(uid).get(),
      this.db.collection("subscriptions").doc(uid).get(),
    ]);
    const data = user.data() || {};
    const billing = subscription.data() || {};
    return {
      ...data,
      stripeCustomerId: billing.stripeCustomerId || null,
      stripeSubscriptionId: billing.stripeSubscriptionId || null,
      subscriptionStatus: billing.subscriptionStatus || "free",
      cancelAtPeriodEnd: billing.cancelAtPeriodEnd || false,
      premium:
        billing.premium === true &&
        ["active", "trialing"].includes(billing.subscriptionStatus),
      used: usage.exists
        ? usage.data().lettersUsed
        : (await this.list(uid, "letter")).length,
    };
  }
  async reserve(uid) {
    const ref = this.db.collection("usage").doc(uid),
      userRef = this.db.collection("subscriptions").doc(uid);
    return this.db.runTransaction(async (tx) => {
      const [usage, user] = await Promise.all([tx.get(ref), tx.get(userRef)]);
      const p = user.data() || {},
        premium =
          p.premium === true &&
          ["active", "trialing"].includes(p.subscriptionStatus);
      let used = usage.data()?.lettersUsed;
      if (used === undefined) {
        const old = await tx.get(
          this.db.collection("lettres").where("userId", "==", uid),
        );
        used = old.size;
      }
      assert(
        premium || used < 3,
        402,
        "Vos 3 générations gratuites sont utilisées.",
      );
      if (!premium)
        tx.set(
          ref,
          { lettersUsed: used + 1, updatedAt: new Date().toISOString() },
          { merge: true },
        );
      return !premium;
    });
  }
  async refund(uid, charged) {
    if (!charged) return;
    const ref = this.db.collection("usage").doc(uid);
    await this.db.runTransaction(async (tx) => {
      const d = await tx.get(ref);
      tx.set(
        ref,
        { lettersUsed: Math.max(0, (d.data()?.lettersUsed || 0) - 1) },
        { merge: true },
      );
    });
  }
  async deleteAccount(uid) {
    for (const name of [
      "lettres",
      "analyses",
      "documentChats",
      "documents",
      "reminders",
    ]) {
      let snap;
      do {
        snap = await this.db
          .collection(name)
          .where("userId", "==", uid)
          .limit(300)
          .get();
        if (snap.empty) break;
        const b = this.db.batch();
        snap.docs.forEach((d) => b.delete(d.ref));
        await b.commit();
      } while (snap.size === 300);
    }
    await this.db.collection("usage").doc(uid).delete();
    await this.db.collection("subscriptions").doc(uid).delete();
    await this.db.collection("users").doc(uid).delete();
  }
}
module.exports = { FirestoreStore };
