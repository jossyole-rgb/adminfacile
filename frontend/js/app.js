import { esc } from "./utils.js";
import { icon } from "./icons.js";
import { createApi } from "./api.js";
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const nav = [
  ["home", "Vue d’ensemble", "home"],
  ["letters", "Créer un courrier", "pen"],
  ["documents", "Analyser un document", "file"],
  ["history", "Mes activités", "clock"],
  ["assistant", "Assistant", "spark"],
  ["billing", "Mon abonnement", "diamond"],
];
const state = {
  config: null,
  user: null,
  token: null,
  profile: {},
  items: [],
  total: 0,
  filter: "",
  query: "",
  offset: 0,
  current: null,
  document: null,
  messages: [],
  draft: { type: "logement", tonLettre: "Courtois" },
  step: 1,
  authMode: "login",
  busy: false,
};
let firebase = null,
  toastTimer,
  renderVersion = 0;
const mobileQuery = matchMedia("(max-width: 720px)");
function syncDrawer() {
  const sidebar = $("#sidebar");
  if (!sidebar) return;
  const open = sidebar.classList.contains("open") && mobileQuery.matches;
  sidebar.inert = mobileQuery.matches && !open;
  $(".workspace").inert = open;
  $(".mobile-bottom").inert = open;
}
mobileQuery.addEventListener("change", syncDrawer);
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 5000);
}
const api = createApi(() => state);
async function busy(button, fn, label = "Traitement en cours…") {
  if (!button || button.disabled) return;
  const old = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<span class="spinner" aria-hidden="true"></span>${esc(label)}`;
  try {
    await fn();
  } catch (e) {
    const message = e.code?.startsWith("auth/")
      ? {
          "auth/invalid-credential":
            "Adresse e-mail ou mot de passe incorrect.",
          "auth/email-already-in-use":
            "Cette adresse est déjà associée à un compte.",
          "auth/weak-password": "Choisissez un mot de passe plus robuste.",
          "auth/too-many-requests":
            "Trop de tentatives. Patientez avant de réessayer.",
          "auth/network-request-failed":
            "Connexion interrompue. Vérifiez votre réseau.",
        }[e.code] ||
        "La connexion n’a pas abouti. Vérifiez vos informations et réessayez."
      : e.message;
    toast(message);
    const target = $("#form-error");
    if (target) target.textContent = message;
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.innerHTML = old;
    }
  }
}
const heading = (title, sub) =>
  `<header class="page-heading"><h1 tabindex="-1">${title}</h1><p>${sub}</p></header>`;
const brand = () =>
  '<a class="brand" href="#home" aria-label="AdminFacile, accueil"><span class="brand-mark">a</span>AdminFacile</a>';
const tag = (text, cls = "") => `<span class="tag ${cls}">${esc(text)}</span>`;
const initials = () =>
  esc(
    (state.profile.name || state.user?.email || "AF")
      .split(/[ .@]/)
      .slice(0, 2)
      .map((x) => x[0])
      .join("")
      .toUpperCase(),
  );
const btn = (label, attrs = "", secondary = false) => {
  const extra = attrs.match(/class="([^"]*)"/)?.[1] || "";
  return `<button class="btn ${secondary ? "secondary" : ""} ${extra}" ${attrs.replace(/class="[^"]*"/g, "")}>${label}</button>`;
};
function footer() {
  return '<footer class="page-footer"><span>AdminFacile · Les démarches, avec les idées claires.</span><button data-action="privacy">Confidentialité et données</button></footer>';
}
function shell(route, html) {
  const title = nav.find((n) => n[0] === route)?.[1] || "Mon compte";
  $("#app").innerHTML =
    `<aside class="sidebar" id="sidebar" aria-label="Navigation principale">${brand()}<p class="eyebrow">Votre espace personnel</p><nav class="navigation">${nav.map(([id, label, i]) => `<a class="nav-link ${route === id ? "active" : ""}" href="#${id}" ${route === id ? 'aria-current="page"' : ""}>${icon(i)}${label}</a>`).join("")}</nav><div class="sidebar-footer"><div class="upgrade"><strong>Un peu plus de liberté</strong><p>Découvrez les avantages<br>de l’offre Premium.</p><a href="#billing">Voir les offres &nbsp; →</a></div><a class="user" href="#account"><span class="avatar">${initials()}</span><span><strong>${esc(state.profile.name || "Mon compte")}</strong><small>${state.profile.premium ? "Premium" : "Compte gratuit"}</small></span></a></div></aside><button class="backdrop" aria-label="Fermer le menu" data-action="menu-close"></button><div class="workspace"><header class="topbar"><button class="icon-button menu-toggle" data-action="menu" aria-controls="sidebar" aria-expanded="false" aria-label="Ouvrir le menu">${icon("menu")}</button><span class="topbar-title">${title}</span><div class="topbar-actions"><button class="text-button" data-action="help">Besoin d’aide ?</button><a href="#account" class="avatar" aria-label="Mon compte">${initials()}</a></div></header>${state.config.demo ? '<div class="demo-banner"><strong>DÉMONSTRATION</strong><span>Résultats fictifs · données temporaires · aucun paiement ni appel IA.</span></div>' : ""}<main class="content" id="main">${html}${footer()}</main></div><nav class="mobile-bottom" aria-label="Accès rapides">${[
      ["home", "Accueil", "home"],
      ["letters", "Courriers", "pen"],
      ["documents", "Documents", "file"],
      ["account", "Compte", "user"],
    ]
      .map(
        ([id, label, i]) =>
          `<a href="#${id}" class="${id === route ? "active" : ""}" ${id === route ? 'aria-current="page"' : ""}>${icon(i)}${label}</a>`,
      )
      .join("")}</nav>`;
  syncDrawer();
}
function empty(
  title,
  description,
  cta = "Créer un courrier",
  route = "letters",
) {
  return `<div class="empty"><span class="action-icon">${icon("file")}</span><h3>${title}</h3><p>${description}</p><a class="btn" href="#${route}">${cta} ${icon("arrow")}</a></div>`;
}
function date(v) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(v));
}
function activityRows(items, deletable = false) {
  return items
    .map(
      (r) =>
        `<div class="activity-row"><span class="file-icon">${icon(r.kind === "analysis" ? "file" : "pen")}</span><div class="activity-info"><button class="activity-open" data-open="${esc(r.id)}"><strong>${esc(r.title)}</strong></button><p>${r.kind === "analysis" ? "Analyse de document" : "Courrier"} · ${date(r.createdAt)}</p></div><span class="activity-date">${date(r.createdAt)}</span>${tag(r.kind === "analysis" ? "Analysé" : "Enregistré", "neutral")}${deletable ? `<button class="icon-button" data-delete="${esc(r.id)}" aria-label="Supprimer ${esc(r.title)}">${icon("trash")}</button>` : `<button class="icon-button" data-open="${esc(r.id)}" aria-label="Ouvrir ${esc(r.title)}">${icon("chevron")}</button>`}</div>`,
    )
    .join("");
}
async function loadProfile() {
  state.profile = await api("/me");
}
async function home(version) {
  shell(
    "home",
    heading("Votre espace se prépare…", "Chargement de vos activités."),
  );
  try {
    await loadProfile();
    const result = await api("/activities");
    if (version !== renderVersion) return;
    state.items = result.items;
    state.total = result.total;
    const p = state.profile,
      used = Math.min(p.used || 0, 3),
      analysis = result.items.filter((r) => r.kind === "analysis").length;
    shell(
      "home",
      heading(
        `Bonjour ${esc((p.name || "à vous").split(" ")[0])}, on avance ?`,
        "Un courrier à écrire, un document à comprendre : commencez ici.",
      ) +
        `<section class="hero-card"><div>${tag("À VOTRE RYTHME")}<h2>Moins de paperasse.</h2><p>Plus de place pour votre quotidien.</p></div><div class="hero-actions"><div class="paper-stack" aria-hidden="true"></div><a href="#letters" class="btn">${icon("pen")} Créer un courrier ${icon("arrow")}</a></div></section><div class="stats"><section class="stat"><div class="stat-top">Courriers gratuits utilisés ${icon("pen")}</div><div class="stat-value"><strong>${p.premium ? "Premium" : used + " / 3"}</strong><span>${p.premium ? "Votre abonnement est actif" : 3 - used + " génération" + (3 - used > 1 ? "s" : "") + " disponible" + (3 - used > 1 ? "s" : "")}</span></div>${p.premium ? "" : `<div class="quota-bar" aria-label="${used} générations utilisées sur 3"><div class="quota-fill quota-${used}"></div></div>`}</section><section class="stat"><div class="stat-top">Activités enregistrées ${icon("clock")}</div><div class="stat-value"><strong>${result.total}</strong><span>Vos démarches, bien rangées</span></div></section><section class="stat"><div class="stat-top">Votre offre ${icon("diamond")}</div><div class="stat-value"><strong>${p.premium ? "Premium" : "Gratuite"}</strong><span>Un espace à votre rythme</span></div></section></div><div class="section-heading"><h2>Que souhaitez-vous faire ?</h2></div><div class="actions-grid">${[
          [
            "pen",
            "Écrire un courrier",
            "Une lettre claire, adaptée à votre situation.",
            "letters",
          ],
          [
            "file",
            "Comprendre un document",
            "Les points essentiels et les actions à envisager.",
            "documents",
          ],
          [
            "mail",
            "Répondre à un courrier",
            "Préparez une réponse à partir du document reçu.",
            "documents",
          ],
        ]
          .map(
            ([i, t, d, r]) =>
              `<a href="#${r}" class="action-card"><span class="action-icon">${icon(i)}</span><span class="action-arrow">${icon("arrow")}</span><h3>${t}</h3><p>${d}</p></a>`,
          )
          .join(
            "",
          )}</div><div class="section-heading"><h2>Activités récentes</h2><a href="#history">Tout voir →</a></div><div class="activity-list">${result.items.length ? activityRows(result.items.slice(0, 3)) : empty("Votre première démarche commence ici.", "Rédigez un courrier ou analysez un document. Vous retrouverez vos activités dans cet espace.")}</div>`,
    );
  } catch (e) {
    if (version === renderVersion)
      shell(
        "home",
        heading("Votre espace est indisponible", esc(e.message)) +
          btn("Réessayer", 'data-action="refresh"'),
      );
  }
}
const field = (
  name,
  label,
  value = "",
  placeholder = "",
  type = "text",
  max = 160,
) =>
  `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" placeholder="${placeholder}" maxlength="${max}" required></label>`;
function letterForm() {
  const d = state.draft,
    step = state.step;
  shell(
    "letters",
    heading(
      "Les bons mots, sans page blanche.",
      "Décrivez votre besoin. Vous pourrez relire et modifier le résultat.",
    ) +
      `<div class="stepper" aria-label="Étape ${step} sur 3"><div class="step ${step === 1 ? "active" : ""}"><span>1</span>Votre besoin</div><div class="step ${step === 2 ? "active" : ""}"><span>2</span>Vos informations</div><div class="step"><span>3</span>Relecture et export</div></div><div class="columns"><form class="panel" id="letter-form"><h2>${step === 1 ? "Quel courrier souhaitez-vous rédiger ?" : "À qui s’adresse votre demande ?"}</h2>${
        step === 1
          ? `<label class="field"><span>Catégorie</span><select name="type">${[
              ["logement", "Logement et location"],
              ["caf", "CAF et prestations sociales"],
              ["ecole", "Études et scolarité"],
              ["emploi", "Emploi et stage"],
              ["resiliation", "Résiliation de contrat"],
              ["banque", "Banque et assurance"],
              ["prefecture", "Préfecture"],
              ["autre", "Autre demande"],
            ]
              .map(
                ([v, t]) =>
                  `<option value="${v}" ${d.type === v ? "selected" : ""}>${t}</option>`,
              )
              .join(
                "",
              )}</select></label>${field("title", "Objet du courrier", d.title, "Ex. Demande de quittance de loyer")}<label class="field"><span>Votre situation</span><textarea name="situation" maxlength="6000" required placeholder="Décrivez les faits, votre demande et les dates utiles…">${esc(d.situation || "")}</textarea><small>Utilisez uniquement les faits que vous connaissez.</small></label><fieldset class="field tone-fieldset"><legend>Ton du courrier</legend><div class="tone-options">${["Courtois", "Formel", "Ferme"].map((t) => `<label><input type="radio" name="tonLettre" value="${t}" ${d.tonLettre === t ? "checked" : ""}><span>${t}</span></label>`).join("")}</div></fieldset>`
          : `${field("nom", "Votre nom", d.nom, "Prénom et nom", "text", 120)}${field("destinataire", "Destinataire", d.destinataire, "Nom de la personne ou de l’organisme", "text", 200)}<div class="notice info"><strong>Votre demande</strong><p>${esc(d.title)}</p><p>${esc(d.situation)}</p></div>`
      }<p class="inline-error" id="form-error" role="alert"></p><div class="form-actions">${step === 2 ? btn("Retour", 'type="button" data-action="letter-back"', true) : '<span class="small muted">Vos informations restent dans cet onglet.</span>'}${btn(step === 1 ? "Continuer " + icon("arrow") : icon("spark") + " Générer mon courrier", 'type="submit"')}</div></form><aside class="stack"><section class="panel sage-panel"><h3>Un courrier qui vous ressemble</h3><ul class="check-list"><li>Décrivez uniquement les faits connus.</li><li>N’ajoutez que les données nécessaires.</li><li>Relisez avant de télécharger.</li></ul><p>${state.profile.premium ? "Votre offre Premium est active." : Math.max(0, 3 - (state.profile.used || 0)) + " génération(s) gratuite(s) disponible(s)."}</p><p class="small">Une génération échouée est remboursée dans le quota.</p></section><section class="panel"><h3>Vous avez reçu un courrier ?</h3><p>Importez-le pour préparer une réponse adaptée.</p><a class="btn secondary full" href="#documents">Analyser mon document ${icon("arrow")}</a></section></aside></div>`,
  );
  $("#letter-form").onsubmit = (e) => {
    e.preventDefault();
    Object.assign(
      state.draft,
      Object.fromEntries(new FormData(e.currentTarget)),
    );
    if (step === 1) {
      state.step = 2;
      letterForm();
      $("#main h1").focus();
    } else
      busy(
        e.submitter,
        async () => {
          state.current = await api("/letters", {
            method: "POST",
            body: state.draft,
          });
          await loadProfile();
          location.hash = "editor";
          toast("Courrier généré et enregistré.");
        },
        "Rédaction du courrier…",
      );
  };
}
function editor() {
  if (!state.current) {
    location.hash = "letters";
    return;
  }
  const r = state.current;
  shell(
    "letters",
    heading(
      "Votre courrier est prêt à être relu.",
      "Vérifiez les informations et complétez les champs entre crochets.",
    ) +
      `<div class="toolbar">${tag("Brouillon enregistré")}<div class="toolbar-actions">${btn(icon("copy") + " Copier", 'data-action="copy"', true)}${btn(icon("download") + " PDF", 'data-export="pdf"')}${btn(icon("download") + " DOCX", 'data-export="docx"')}</div></div><div class="columns"><section class="panel"><label class="sr-only" for="editor-title">Titre du courrier</label><input id="editor-title" class="editor-title" value="${esc(r.title)}" maxlength="160"><label class="sr-only" for="letter-editor">Contenu du courrier modifiable</label><textarea id="letter-editor" class="letter-editor" maxlength="30000" spellcheck="true">${esc(r.content)}</textarea><div class="form-actions"><span id="save-status" class="small muted" role="status">Modifications à enregistrer avec le bouton.</span>${btn(icon("check") + " Enregistrer", 'data-action="save"')}</div></section><aside class="stack"><section class="panel"><h3>Affiner le résultat</h3><div class="stack refinement">${btn("Rendre plus concis", 'data-rewrite="court"', true)}${btn("Adopter un ton plus formel", 'data-rewrite="formel"', true)}${btn("Résumer le courrier", 'data-action="summary"', true)}</div></section><section class="panel notice"><h3>Avant de l’utiliser</h3><p>Ce texte est une proposition IA. Vérifiez les faits et les destinataires. Aucun courrier n’est envoyé automatiquement.</p></section><a href="#letters" class="btn secondary">Créer un autre courrier ${icon("arrow")}</a></aside></div>`,
  );
  $("#letter-editor").oninput = () => {
    $("#save-status").textContent = "Modifications non enregistrées";
  };
}
function uploadPage() {
  shell(
    "documents",
    heading(
      "Comprendre avant de répondre.",
      "Importez un document pour en dégager les points essentiels.",
    ) +
      `<div class="columns"><section class="panel"><div class="upload-area" id="drop-zone"><span class="action-icon">${icon("upload")}</span><h2>Votre document, en plus clair.</h2><p>Choisissez un fichier ou déposez-le ici.<br>PDF, PNG ou JPG · 8 Mo maximum</p><label class="sr-only" for="document-file">Choisir un document</label><input class="file-input" id="document-file" type="file" accept="application/pdf,image/png,image/jpeg"><p class="small muted">Un seul document par analyse.</p></div><div id="selected-file"></div><p id="form-error" class="inline-error" role="alert"></p><div class="form-actions"><span class="small muted">Le fichier original n’est pas conservé.</span>${btn(icon("spark") + " Analyser le document", 'id="analyze-button" disabled')}</div></section><aside class="stack"><section class="panel sage-panel"><h3>De la lecture à l’action</h3><ul class="check-list"><li>Un résumé en langage clair.</li><li>Les échéances et passages utiles.</li><li>Les actions possibles pour la suite.</li></ul></section><section class="panel"><h3>Vous maîtrisez vos données</h3><p>Ajoutez uniquement les informations nécessaires. L’analyse est enregistrée dans votre historique ; vous pouvez la supprimer.</p><button class="text-button" data-action="privacy">En savoir plus →</button></section></aside></div>`,
  );
  let file;
  function select(f) {
    const error = $("#form-error");
    error.textContent = "";
    if (!f) return;
    if (
      !["application/pdf", "image/png", "image/jpeg"].includes(f.type) ||
      f.size > 8 * 1024 * 1024
    ) {
      error.textContent = "Choisissez un PDF, PNG ou JPG de 8 Mo maximum.";
      file = null;
      $("#analyze-button").disabled = true;
      $("#selected-file").innerHTML = "";
      return;
    }
    file = f;
    $("#selected-file").innerHTML =
      `<div class="file-selected">${icon("file")}<div class="activity-info"><strong>${esc(f.name)}</strong><p>${(f.size / 1024 / 1024).toFixed(2)} Mo · Prêt pour l’analyse</p></div>${icon("check")}</div>`;
    $("#analyze-button").disabled = false;
  }
  $("#document-file").onchange = (e) => select(e.target.files[0]);
  const zone = $("#drop-zone");
  zone.ondragover = (e) => {
    e.preventDefault();
    zone.classList.add("dragover");
  };
  zone.ondragleave = () => zone.classList.remove("dragover");
  zone.ondrop = (e) => {
    e.preventDefault();
    zone.classList.remove("dragover");
    select(e.dataTransfer.files[0]);
  };
  $("#analyze-button").onclick = (e) =>
    busy(
      e.currentTarget,
      async () => {
        const form = new FormData();
        form.append("document", file);
        state.document = await api("/documents", {
          method: "POST",
          body: form,
        });
        location.hash = "analysis";
        toast("Analyse enregistrée dans vos activités.");
      },
      "Lecture et analyse…",
    );
}
function analysis() {
  const r = state.document;
  if (!r) {
    location.hash = "documents";
    return;
  }
  shell(
    "documents",
    heading(
      "Votre document, avec les idées claires.",
      "Relisez les passages cités et vérifiez les informations dans le document original.",
    ) +
      `<div class="panel document-header"><span class="file-icon">${icon("file")}</span><div class="activity-info"><strong>${esc(r.title)}</strong><p>${r.mimeType === "application/pdf" ? "PDF" : "Document"} · ${date(r.createdAt)} · Original non conservé</p></div>${tag("Analyse terminée")}</div><div class="columns"><section class="panel"><div class="section-heading">${tag("SYNTHÈSE")}<button class="text-button" data-action="copy-analysis">${icon("copy")} Copier</button></div><div class="preformatted">${esc(r.content)}</div><div class="notice">L’IA peut se tromper. Une échéance incertaine doit être vérifiée dans le document original.</div></section><aside class="stack"><section class="panel sage-panel"><h3>Préparer la suite</h3><p>Ajoutez les faits utiles à votre réponse, puis choisissez le ton.</p><form id="reply-form"><label class="field"><span>Votre réponse et vos précisions</span><textarea name="situation" maxlength="6000" placeholder="Ex. J’ai transmis le justificatif le 12 octobre…" required></textarea></label><label class="field"><span>Ton de la réponse</span><select name="ton"><option>Courtois</option><option>Formel</option><option>Ferme</option></select></label><button class="btn full" type="submit">${icon("pen")} Préparer une réponse</button></form><p class="small">Une réponse consomme une génération de courrier.</p></section><section class="panel"><h3>Une question sur ce document ?</h3><form id="document-chat"><label class="field"><span>Votre question</span><input name="question" required maxlength="2000" placeholder="Que dois-je vérifier ?"></label><button type="submit" class="btn secondary full">Poser ma question ${icon("arrow")}</button></form><p class="preformatted" id="document-answer" role="status"></p></section><a href="#documents" class="btn secondary">Analyser un autre document</a></aside></div>`,
  );
  $("#reply-form").onsubmit = (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    busy(
      e.submitter,
      async () => {
        state.current = await api("/replies", {
          method: "POST",
          body: { ...data, documentId: r.id },
        });
        await loadProfile();
        location.hash = "editor";
      },
      "Rédaction…",
    );
  };
  $("#document-chat").onsubmit = (e) => {
    e.preventDefault();
    const question = new FormData(e.currentTarget).get("question");
    busy(
      e.submitter,
      async () => {
        $("#document-answer").textContent = (
          await api("/document-chat", {
            method: "POST",
            body: { id: r.id, question },
          })
        ).reponse;
      },
      "Recherche dans l’analyse…",
    );
  };
}
async function history(version) {
  shell(
    "history",
    heading(
      "Tout retrouver, simplement.",
      "Vos courriers et analyses, accessibles depuis votre espace.",
    ) +
      `<form class="search-bar" id="search-form"><label class="sr-only" for="search">Rechercher une activité</label><input class="search-input" id="search" type="search" placeholder="Rechercher un titre…" value="${esc(state.query)}"><button class="btn secondary" type="submit">${icon("search")} Rechercher</button><a class="btn" href="#letters">${icon("pen")} Nouveau courrier</a></form><div class="filters" aria-label="Filtrer les activités">${[
        ["", "Tout"],
        ["letter", "Courriers"],
        ["analysis", "Analyses"],
      ]
        .map(
          ([id, t]) =>
            `<button class="filter ${state.filter === id ? "active" : ""}" data-filter="${id}" aria-pressed="${state.filter === id}">${t}</button>`,
        )
        .join(
          "",
        )}</div><div id="history-results" role="status"><div class="panel muted">Chargement des activités…</div></div>`,
  );
  $("#search-form").onsubmit = (e) => {
    e.preventDefault();
    state.query = $("#search").value;
    state.offset = 0;
    render();
  };
  try {
    const result = await api(
      "/activities?" +
        new URLSearchParams({
          q: state.query,
          kind: state.filter,
          offset: state.offset,
        }),
    );
    if (version !== renderVersion) return;
    state.items = result.items;
    $("#history-results").innerHTML =
      `<div class="activity-list">${result.items.length ? activityRows(result.items, true) : empty("Aucune activité à afficher.", state.query ? "Essayez un autre titre ou retirez le filtre." : "Vos courriers et analyses apparaîtront ici après leur création.")}</div><div class="pagination"><span>${result.total} activité(s)${result.total ? " · " + (state.offset + 1) + "–" + (state.offset + result.items.length) : ""}</span><div class="toolbar-actions">${state.offset ? btn("← Précédent", 'data-page="previous"', true) : ""}${result.nextOffset !== null ? btn("Suivant →", 'data-page="next"', true) : ""}</div></div>`;
  } catch (e) {
    if (version === renderVersion)
      $("#history-results").innerHTML =
        `<div class="notice error">${esc(e.message)}</div>`;
  }
}
function assistant() {
  shell(
    "assistant",
    heading(
      "Une question ? Parlons-en.",
      "Des explications en langage clair pour vous aider à avancer.",
    ) +
      `<section class="panel chat-panel">${tag("ASSISTANT ADMINFACILE")}<div class="chat-messages" id="chat-messages" role="log" aria-label="Conversation avec l’assistant"><div class="message assistant">Bonjour ! Je peux vous aider à comprendre une démarche ou à préparer un courrier. Quel est votre besoin ?</div>${state.messages.map((m) => `<div class="message ${m.role}">${esc(m.text)}</div>`).join("")}</div><div class="suggestions">${["Préparer une demande de quittance", "Demander une attestation de scolarité", "Organiser mes pièces justificatives"].map((t) => `<button data-suggestion="${t}">${t}</button>`).join("")}</div><form class="chat-form" id="chat-form"><label for="chat-input" class="sr-only">Votre question</label><input id="chat-input" name="message" maxlength="4000" required placeholder="Écrivez votre question…" autocomplete="off"><button type="submit" class="btn" aria-label="Envoyer la question"><span class="send-label">Envoyer</span>${icon("send")}</button></form></section><p class="small muted chat-disclaimer">L’IA peut se tromper. Vérifiez les règles auprès de sources officielles datées, notamment <a href="https://www.service-public.gouv.fr" target="_blank" rel="noopener">Service Public</a>.</p>`,
  );
  $("#chat-form").onsubmit = (e) => {
    e.preventDefault();
    const input = $("#chat-input"),
      message = input.value.trim();
    if (!message) return;
    busy(
      e.submitter,
      async () => {
        state.messages.push({ role: "user", text: message });
        appendMessage("user", message);
        input.value = "";
        try {
          const data = await api("/chat", {
            method: "POST",
            body: { message },
          });
          state.messages.push({ role: "assistant", text: data.reponse });
          appendMessage("assistant", data.reponse);
        } catch (error) {
          appendMessage(
            "error",
            error.message + " Votre question peut être renvoyée.",
          );
          input.value = message;
          throw error;
        }
      },
      "Réponse…",
    );
  };
}
function appendMessage(role, text) {
  const el = document.createElement("div");
  el.className = "message " + role;
  el.textContent = text;
  $("#chat-messages").append(el);
  el.scrollIntoView({ block: "nearest" });
}
async function billing(version) {
  await loadProfile();
  if (version !== renderVersion) return;
  const p = state.profile,
    available = state.config.billingAvailable;
  shell(
    "billing",
    heading(
      "Une offre adaptée à vos besoins.",
      "Les prix et limites Premium seront confirmés avant la commercialisation.",
    ) +
      `${p.subscriptionStatus && p.subscriptionStatus !== "active" ? `<div class="notice">État de l’abonnement : ${esc(p.subscriptionStatus)}. Consultez votre espace de facturation pour connaître les actions à effectuer.</div>` : ""}<div class="plans"><section class="panel plan"><span class="tag neutral">${p.premium ? "Offre gratuite" : "Votre offre actuelle"}</span><h2>Gratuit</h2><div class="price">0 €</div><p>Pour vos premières démarches</p><ul class="check-list"><li>3 générations de courriers</li><li>Édition et exports PDF / DOCX</li><li>Historique personnel</li><li>Analyse de documents, limites à confirmer</li></ul><a href="#letters" class="btn secondary full">Créer un courrier</a></section><section class="panel plan sage-panel"><span class="tag">${p.premium ? "Votre offre actuelle" : "Plus de liberté"}</span><h2>Premium</h2><div class="price">${esc(state.config.billingPriceLabel || (available ? "Voir le tarif" : "Tarif à confirmer"))}</div><p>${available ? "Tarif et conditions affichés avant paiement." : "Offre en préparation"}</p><ul class="check-list"><li>Droits étendus de génération</li><li>Analyse et réponses aux courriers</li><li>Historique personnel</li><li>Quotas définitifs à confirmer</li></ul>${btn(p.stripeCustomerId ? "Gérer mon abonnement" : available ? "Consulter l’offre" : "M’informer sur l’offre", `data-action="${p.stripeCustomerId ? "portal" : available ? "checkout" : "offer-info"}" class="btn full"`)}</section></div><section class="panel billing-info"><h2>Votre abonnement, en toute clarté</h2><p>Après souscription, gérez votre facturation et votre résiliation depuis votre espace client Stripe. Le tarif et les conditions sont présentés avant tout paiement.</p><p class="small">${p.premium ? "Votre abonnement est actif." : Math.max(0, 3 - (p.used || 0)) + " génération(s) gratuite(s) disponible(s)."} ${state.config.demo ? "Aucun achat depuis la démonstration." : ""}</p></section>`,
  );
}
function account() {
  shell(
    "account",
    heading(
      "Votre compte, vos choix.",
      "Gérez votre connexion et les données de votre espace.",
    ) +
      `<div class="columns"><section class="panel"><h2>Informations du compte</h2><label class="field"><span>Adresse e-mail</span><p class="account-email">${esc(state.user.email)}</p></label><div class="field"><span>Offre actuelle</span>${tag(state.profile.premium ? "Premium" : "Gratuite")}</div>${!state.config.demo && !state.user.emailVerified ? `<div class="notice">Votre e-mail n’est pas vérifié. Consultez votre boîte de réception, puis reconnectez-vous.${btn("Renvoyer le lien", 'data-action="verify"', true)}</div>` : ""}<div class="form-actions">${btn(icon("logout") + " Me déconnecter", 'data-action="logout"', true)}</div></section><aside class="stack"><section class="panel sage-panel"><h3>Confidentialité</h3><p>Vos fichiers sont traités pour l’analyse et ne sont pas stockés par cette application. Le texte extrait et les résultats sont conservés dans votre historique jusqu’à leur suppression.</p><button class="text-button" data-action="privacy">Traitement des données →</button></section><section class="panel"><h3>Supprimer mon compte</h3><p>Supprimez vos activités et votre compte. Une reconnexion récente est nécessaire.</p>${btn("Supprimer mon compte", 'data-action="delete-account"', true)}</section></aside></div>`,
  );
}
async function authPage() {
  const register = state.authMode === "register";
  $("#app").innerHTML =
    `<div class="auth-layout"><aside class="auth-story">${brand()}<div>${tag("L’ADMINISTRATIF, ALLÉGÉ")}<h1>Vos démarches.<br>Les idées claires.</h1><p>Rédigez vos courriers, comprenez vos documents et retrouvez vos activités dans un même espace.</p></div><div class="auth-quote"><h2>Vous gardez la main.</h2><p>Relisez, modifiez et exportez.<br>Vous décidez de la suite.</p></div><p class="small">AdminFacile · Votre assistant administratif</p></aside><main class="auth-main" id="main"><div class="auth-form"><h2>${register ? "Votre espace commence ici." : "Heureux de vous retrouver."}</h2><p>${register ? "Créez votre compte pour vos premières démarches." : "Connectez-vous à votre espace personnel."}</p>${state.config.demo ? '<div class="notice info">Démonstration locale : aucune création de compte réelle. Les données sont effacées au redémarrage du serveur.</div>' : ""}<form id="auth-form">${field("email", "Adresse e-mail", "", "vous@exemple.fr", "email", 254)}<label class="field"><span>Mot de passe</span><input name="password" type="password" minlength="${register ? 8 : 1}" maxlength="128" required autocomplete="${register ? "new-password" : "current-password"}" placeholder="Votre mot de passe"></label><div class="auth-links"><span class="small muted">${register ? "8 caractères minimum" : ""}</span><button type="button" class="text-button" data-action="reset">Mot de passe oublié ?</button></div><p id="form-error" class="inline-error" role="alert"></p><button class="btn full" type="submit">${register ? "Créer mon compte" : "Se connecter"} ${icon("arrow")}</button></form>${state.config.demo ? btn("Explorer la démonstration", 'data-action="demo" class="btn secondary full"', true) : ""}<div class="auth-switch">${register ? "Déjà un compte ?" : "Pas encore de compte ?"} <button class="text-button" data-action="auth-switch">${register ? "Me connecter" : "Créer mon compte"}</button></div><p class="auth-legal">L’IA peut se tromper : relisez les résultats avant utilisation.<br><button class="text-button" data-action="privacy">Confidentialité et utilisation des données</button></p></div></main></div>`;
  $("#auth-form").onsubmit = (e) => {
    e.preventDefault();
    if (state.config.demo) {
      enterDemo();
      return;
    }
    const { email, password } = Object.fromEntries(
      new FormData(e.currentTarget),
    );
    busy(
      e.submitter,
      async () => {
        if (!state.config.authConfigured)
          throw Error(
            "Le serveur Firebase doit être configuré avant la connexion.",
          );
        if (!firebase) await loadFirebase();
        const credential = await (
          register
            ? firebase.sdk.createUserWithEmailAndPassword
            : firebase.sdk.signInWithEmailAndPassword
        )(firebase.auth, email, password);
        if (register) {
          await firebase.sdk.sendEmailVerification(credential.user);
          toast("Compte créé. Un lien de vérification vous a été envoyé.");
        }
      },
      register ? "Création du compte…" : "Connexion…",
    );
  };
}
async function loadFirebase() {
  if (firebase) return;
  const [app, sdk] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"),
  ]);
  const auth = sdk.getAuth(app.initializeApp(state.config.firebase));
  firebase = { auth, sdk };
  sdk.onAuthStateChanged(auth, async (user) => {
    state.user = user;
    state.current = null;
    state.document = null;
    state.messages = [];
    if (user) {
      try {
        await loadProfile();
      } catch (e) {
        toast(e.message);
      }
    }
    render();
  });
}
async function enterDemo() {
  state.user = { uid: "demo-camille", email: "camille@example.test" };
  sessionStorage.setItem("adminfacile-demo", "yes");
  try {
    await loadProfile();
    location.hash = "home";
    render();
  } catch (e) {
    toast(e.message);
  }
}
function dialog(title, body, buttons) {
  $("#modal").innerHTML =
    `<h2>${title}</h2>${body}<div class="form-actions">${buttons || btn("Compris", 'data-action="modal-close"')}</div>`;
  $("#modal").showModal();
}
function closeModal() {
  $("#modal").close();
}
function captureEditor() {
  if ($("#letter-editor") && state.current) {
    state.current.content = $("#letter-editor").value;
    state.current.title = $("#editor-title").value;
  }
}
async function render() {
  const version = ++renderVersion;
  const modal = $("#modal");
  if (modal.open) modal.close();
  if (!state.user) {
    authPage();
    return;
  }
  let route = location.hash.slice(1) || "home";
  if (
    ![
      "home",
      "letters",
      "documents",
      "history",
      "assistant",
      "billing",
      "account",
      "editor",
      "analysis",
    ].includes(route)
  )
    route = "home";
  document.title =
    (nav.find((n) => n[0] === route)?.[1] || "Mon espace") + " — AdminFacile";
  try {
    switch (route) {
      case "home":
        await home(version);
        break;
      case "letters":
        letterForm();
        break;
      case "documents":
        uploadPage();
        break;
      case "history":
        await history(version);
        break;
      case "editor":
        editor();
        break;
      case "analysis":
        analysis();
        break;
      case "assistant":
        assistant();
        break;
      case "billing":
        await billing(version);
        break;
      case "account":
        account();
        break;
    }
  } catch (e) {
    if (version === renderVersion)
      shell(
        route,
        heading("Une erreur est survenue", esc(e.message)) +
          btn("Réessayer", 'data-action="refresh"'),
      );
  }
}
window.addEventListener("hashchange", () => {
  captureEditor();
  render();
  window.scrollTo(0, 0);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    $("#sidebar")?.classList.remove("open");
    syncDrawer();
    $('[data-action="menu"]')?.setAttribute("aria-expanded", "false");
    $('[data-action="menu"]')?.focus();
  }
});
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button,a");
  if (!b) return;
  if (b.classList.contains("skip-link")) {
    e.preventDefault();
    $("#main")?.setAttribute("tabindex", "-1");
    $("#main")?.focus();
    return;
  }
  if (b.dataset.open) {
    await busy(b, async () => {
      const row = await api(
        "/activities/" + encodeURIComponent(b.dataset.open),
      );
      if (row.kind === "analysis") {
        state.document = row;
        location.hash = "analysis";
      } else {
        state.current = row;
        location.hash = "editor";
      }
    });
    return;
  }
  if (b.dataset.delete) {
    const id = b.dataset.delete;
    dialog(
      "Supprimer cette activité ?",
      "<p>Le courrier ou l’analyse sera retiré de votre historique. Cette action est définitive.</p>",
      btn("Annuler", 'data-action="modal-close"', true) +
        btn("Supprimer", 'id="confirm-delete"'),
    );
    $("#confirm-delete").onclick = (ev) =>
      busy(ev.currentTarget, async () => {
        await api("/activities/" + encodeURIComponent(id), {
          method: "DELETE",
        });
        closeModal();
        render();
        toast("Activité supprimée.");
      });
    return;
  }
  if (b.hasAttribute("data-filter")) {
    state.filter = b.dataset.filter;
    state.offset = 0;
    render();
    return;
  }
  if (b.dataset.page) {
    state.offset = Math.max(
      0,
      state.offset + (b.dataset.page === "next" ? 20 : -20),
    );
    render();
    return;
  }
  if (b.dataset.suggestion) {
    $("#chat-input").value = b.dataset.suggestion;
    $("#chat-input").focus();
    return;
  }
  if (b.dataset.export) {
    captureEditor();
    busy(b, async () => {
      const blob = await api("/export/" + b.dataset.export, {
        method: "POST",
        body: { content: state.current.content },
        raw: true,
      });
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = "courrier-adminfacile." + b.dataset.export;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast("Votre fichier est prêt.");
    });
    return;
  }
  if (b.dataset.rewrite) {
    captureEditor();
    busy(b, async () => {
      const data = await api("/rewrite", {
        method: "POST",
        body: { texte: state.current.content, style: b.dataset.rewrite },
      });
      state.current.content = data.content;
      editor();
      toast("Texte modifié. Pensez à l’enregistrer.");
    });
    return;
  }
  const action = b.dataset.action;
  if (!action) return;
  switch (action) {
    case "menu": {
      const open = $("#sidebar").classList.toggle("open");
      b.setAttribute("aria-expanded", String(open));
      syncDrawer();
      if (open) $("#sidebar a").focus();
      break;
    }
    case "menu-close":
      $("#sidebar").classList.remove("open");
      syncDrawer();
      $('[data-action="menu"]').setAttribute("aria-expanded", "false");
      $('[data-action="menu"]').focus();
      break;
    case "modal-close":
      closeModal();
      break;
    case "refresh":
      render();
      break;
    case "letter-back":
      Object.assign(
        state.draft,
        Object.fromEntries(new FormData($("#letter-form"))),
      );
      state.step = 1;
      letterForm();
      break;
    case "save":
      captureEditor();
      busy(b, async () => {
        state.current = await api(
          "/activities/" + encodeURIComponent(state.current.id),
          {
            method: "PATCH",
            body: {
              content: state.current.content,
              title: state.current.title,
            },
          },
        );
        $("#save-status").textContent =
          "Toutes les modifications sont enregistrées.";
        toast("Courrier enregistré.");
      });
      break;
    case "copy":
    case "copy-analysis":
      captureEditor();
      try {
        await navigator.clipboard.writeText(
          action === "copy" ? state.current.content : state.document.content,
        );
        toast("Texte copié.");
      } catch {
        toast("Copie indisponible. Sélectionnez le texte pour le copier.");
      }
      break;
    case "summary":
      captureEditor();
      busy(b, async () => {
        const d = await api("/summary", {
          method: "POST",
          body: { texte: state.current.content },
        });
        dialog(
          "Résumé du courrier",
          `<p class="preformatted">${esc(d.content)}</p>`,
        );
      });
      break;
    case "help":
      dialog(
        "Un coup de main pour avancer ?",
        '<p><strong>Courriers :</strong> décrivez votre situation, puis relisez et exportez.</p><p><strong>Documents :</strong> importez un PDF ou une image, consultez la synthèse et préparez votre réponse.</p><p><strong>Activités :</strong> retrouvez, modifiez et supprimez vos contenus.</p><p>Pour une information administrative officielle, consultez <a href="https://www.service-public.gouv.fr" target="_blank" rel="noopener">Service Public</a>.</p>',
      );
      break;
    case "privacy":
      dialog(
        "Vos données, en toute clarté",
        `<p>${state.config.demo ? "Vous utilisez une démonstration locale : les activités restent en mémoire sur ce serveur et disparaissent à son redémarrage. Les résultats sont fictifs." : "L’authentification est assurée par Firebase. Les contenus et analyses sont enregistrés dans Firestore, associés à votre compte. Les textes nécessaires à la génération ou à l’analyse sont transmis au service OpenAI."}</p><p>Le fichier original est traité en mémoire puis libéré. Le texte extrait, les analyses et les courriers sont conservés jusqu’à leur suppression depuis vos activités. La conversation avec l’assistant reste dans cet onglet.</p><p>Les politiques définitives de conservation, les conditions d’utilisation et les mentions légales doivent être validées avant ouverture commerciale. Les sauvegardes et les durées appliquées par les prestataires doivent être documentées.</p>`,
      );
      break;
    case "offer-info":
      dialog(
        "Premium est en préparation",
        "<p>Le tarif et les quotas seront confirmés avant le lancement. Aucune souscription n’est ouverte dans cette configuration.</p>",
      );
      break;
    case "portal":
    case "checkout":
      busy(b, async () => {
        const d = await api(
          "/billing/" + (action === "portal" ? "portal" : "checkout"),
          { method: "POST", body: {} },
        );
        const url = new URL(d.url);
        if (
          url.protocol !== "https:" ||
          !["checkout.stripe.com", "billing.stripe.com"].includes(url.hostname)
        )
          throw Error("Lien de paiement inattendu.");
        location.assign(url.href);
      });
      break;
    case "logout":
      state.draft = { type: "logement", tonLettre: "Courtois" };
      state.step = 1;
      if (state.config.demo) {
        sessionStorage.removeItem("adminfacile-demo");
        state.user = null;
        state.current = null;
        state.document = null;
        state.messages = [];
        state.draft = { type: "logement", tonLettre: "Courtois" };
        state.step = 1;
        render();
      } else await firebase.sdk.signOut(firebase.auth);
      break;
    case "auth-switch":
      state.authMode = state.authMode === "login" ? "register" : "login";
      authPage();
      break;
    case "demo":
      enterDemo();
      break;
    case "reset":
      if (state.config.demo) {
        toast(
          "La récupération de mot de passe est désactivée en démonstration.",
        );
        break;
      }
      busy(b, async () => {
        const input = $('[name="email"]');
        if (!input.reportValidity()) return;
        if (!firebase) await loadFirebase();
        await firebase.sdk.sendPasswordResetEmail(firebase.auth, input.value);
        toast(
          "Si un compte correspond, un lien de réinitialisation vous sera envoyé.",
        );
      });
      break;
    case "verify":
      busy(b, async () => {
        await firebase.sdk.sendEmailVerification(state.user);
        toast("Lien de vérification renvoyé.");
      });
      break;
    case "delete-account":
      dialog(
        "Supprimer mon compte ?",
        '<p>Les activités de votre compte seront supprimées. Cette action est définitive. Si vous avez un compte facturé, contactez le support pour traiter sa clôture.</p><label class="field"><span>Saisissez SUPPRIMER pour confirmer</span><input id="delete-confirm" autocomplete="off"></label>',
        btn("Annuler", 'data-action="modal-close"', true) +
          btn("Supprimer mon compte", 'id="delete-account-confirm"'),
      );
      $("#delete-account-confirm").onclick = (ev) =>
        busy(ev.currentTarget, async () => {
          if ($("#delete-confirm").value !== "SUPPRIMER")
            throw Error("Saisissez SUPPRIMER pour confirmer.");
          await api("/me", {
            method: "DELETE",
            body: { confirm: "SUPPRIMER" },
          });
          closeModal();
          if (firebase) await firebase.sdk.signOut(firebase.auth);
          state.user = null;
          sessionStorage.removeItem("adminfacile-demo");
          render();
          toast("Votre compte et vos activités ont été supprimés.");
        });
      break;
  }
});
async function boot() {
  try {
    state.config = await api("/config");
    if (state.config.demo) {
      if (sessionStorage.getItem("adminfacile-demo") === "yes")
        await enterDemo();
      else authPage();
    } else {
      authPage();
      if (state.config.authConfigured) await loadFirebase();
    }
  } catch (e) {
    $("#app").innerHTML =
      `<main class="content"><div class="panel"><h1>L’application n’a pas pu démarrer.</h1><p>${esc(e.message)}</p><p>Lancez le serveur avec npm run demo ou npm start, puis ouvrez l’adresse locale.</p></div></main>`;
  }
}
boot();
