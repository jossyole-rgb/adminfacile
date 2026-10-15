const fs = require("node:fs");
const path = require("node:path");
function updateEnv(values, filename = path.resolve(__dirname, "../.env")) {
  let source = fs.existsSync(filename) ? fs.readFileSync(filename, "utf8") : "";
  for (const [key, value] of Object.entries(values)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw Error("Variable invalide.");
    const raw = String(value);
    // dotenv retire les délimiteurs mais ne déséchappe pas les guillemets JSON.
    const delimiter = ["'", "`", '"'].find(
      (q) => !raw.includes(q) && (q !== '"' || !raw.includes("\\n")),
    );
    if (
      !delimiter &&
      (/[#\r\n]/.test(raw) || raw.trim() !== raw || /^["'`]/.test(raw))
    )
      throw Error(
        "Valeur incompatible avec le format .env ; utiliser un fichier secret.",
      );
    const line = key + "=" + (delimiter ? delimiter + raw + delimiter : raw);
    const pattern = new RegExp("^" + key + "=.*$", "m");
    source = pattern.test(source)
      ? source.replace(pattern, () => line)
      : source.replace(/\s*$/, "") + "\n" + line + "\n";
  }
  const temp = filename + ".tmp";
  fs.writeFileSync(temp, source, { mode: 0o600 });
  fs.chmodSync(temp, 0o600);
  fs.renameSync(temp, filename);
  fs.chmodSync(filename, 0o600);
}
module.exports = { updateEnv };
