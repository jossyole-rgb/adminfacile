const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, ".."),
  out = path.join(root, "dist");
fs.mkdirSync(out, { recursive: true });
for (const name of [
  "index.html",
  "app.html",
  "dashboard.html",
  "dashboard_v2.html",
])
  fs.copyFileSync(path.join(root, name), path.join(out, name));
for (const name of ["frontend", "assets"])
  fs.cpSync(path.join(root, name), path.join(out, name), { recursive: true });
console.log(
  "Frontend prêt dans dist/ : aucun fichier serveur ni secret inclus.",
);
