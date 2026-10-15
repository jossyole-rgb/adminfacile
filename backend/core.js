const crypto = require("node:crypto");
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const assert = (condition, status, message) => {
  if (!condition) throw new HttpError(status, message);
};
function text(value, name, max = 6000) {
  assert(
    typeof value === "string" && value.trim() && value.length <= max,
    400,
    `${name} requis (maximum ${max} caractères).`,
  );
  return value.trim();
}
function validateFile(file) {
  assert(file, 400, "Choisissez un fichier.");
  const b = file.buffer;
  const pdf = b.subarray(0, 5).toString() === "%PDF-";
  const png = b
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = b[0] === 255 && b[1] === 216 && b[2] === 255;
  const type = pdf
    ? "application/pdf"
    : png
      ? "image/png"
      : jpeg
        ? "image/jpeg"
        : null;
  assert(
    type && type === file.mimetype,
    400,
    "Le contenu du fichier ne correspond pas à un PDF, PNG ou JPG valide.",
  );
  if (png) {
    assert(b.length >= 24, 400, "Image PNG incomplète.");
    assert(
      b.readUInt32BE(16) * b.readUInt32BE(20) <= 20000000,
      400,
      "Image trop grande : 20 mégapixels maximum.",
    );
  }
  if (jpeg) {
    let offset = 2;
    while (offset + 9 < b.length) {
      if (b[offset] !== 255) break;
      const marker = b[offset + 1];
      if ([192, 193, 194].includes(marker)) {
        assert(
          b.readUInt16BE(offset + 5) * b.readUInt16BE(offset + 7) <= 20000000,
          400,
          "Image trop grande : 20 mégapixels maximum.",
        );
        break;
      }
      const length = b.readUInt16BE(offset + 2);
      if (length < 2) break;
      offset += length + 2;
    }
  }
  return type;
}
class MemoryStore {
  constructor() {
    this.rows = new Map();
    this.usage = new Map();
    this.users = new Map();
    this.events = new Set();
  }
  async list(uid, kind) {
    return [...this.rows.values()]
      .filter((r) => r.userId === uid && (!kind || r.kind === kind))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async get(uid, id) {
    const r = this.rows.get(id);
    assert(r && r.userId === uid, 404, "Activité introuvable.");
    return { ...r };
  }
  async save(uid, row) {
    const r = {
      ...row,
      id: crypto.randomUUID(),
      userId: uid,
      createdAt: new Date().toISOString(),
    };
    this.rows.set(r.id, r);
    return r;
  }
  async update(uid, id, data) {
    const r = await this.get(uid, id);
    Object.assign(r, data, { updatedAt: new Date().toISOString() });
    this.rows.set(id, r);
    return r;
  }
  async remove(uid, id) {
    await this.get(uid, id);
    this.rows.delete(id);
  }
  async profile(uid) {
    return { ...this.users.get(uid), used: this.usage.get(uid) || 0 };
  }
  async reserve(uid) {
    const p = await this.profile(uid);
    const used = this.usage.get(uid) || 0;
    assert(
      p.premium || used < 3,
      402,
      "Vos 3 générations gratuites sont utilisées.",
    );
    this.usage.set(uid, used + 1);
    return !p.premium;
  }
  async refund(uid, charged) {
    if (charged)
      this.usage.set(uid, Math.max(0, (this.usage.get(uid) || 0) - 1));
  }
  async deleteAccount(uid) {
    for (const r of await this.list(uid)) this.rows.delete(r.id);
    this.usage.delete(uid);
    this.users.delete(uid);
  }
}
module.exports = { HttpError, assert, text, validateFile, MemoryStore };
