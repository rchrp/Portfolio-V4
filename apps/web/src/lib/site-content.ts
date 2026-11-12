// Editorial copy of the single-page story, kept in one place to be edited
// without touching the components.

// The story's chapters, in page order: `id` is the id of each section.
export const chapters = [
  { id: "accueil", label: "Accueil" },
  { id: "manifeste", label: "Manifeste" },
  { id: "projets", label: "Projets" },
  { id: "contact", label: "Contact" },
];

export const hero = {
  firstName: "Raphaël",
  lastName: "Charpentier",
};

export const manifesto = {
  // Words wrapped in *asterisks* are highlighted with the accent color.
  text: "Le web est rempli de sites qu’on oublie sitôt l’onglet fermé. J’essaie de construire *les autres.*",
  disciplines: [
    { label: "Interfaces", detail: "React, Next.js, animation & WebGL" },
    { label: "Systèmes", detail: "Node.js, API, PostgreSQL" },
    { label: "Produit", detail: "Conception, itération, mise en ligne" },
  ],
};

export const projectsChapter = {
  title: "Mes projets",
  lead: "Une sélection de réalisations, une chaîne à la fois.",
};

// Public contact details, shown in the hero and the outro. Each one is
// displayed only once it is set.
export const contact = {
  email: "raphael@rchrp.fr",
  /** Displayed as written, e.g. "+33 6 12 34 56 78". */
  phone: "+33 6 67 28 12 29",
  linkedin: "https://www.linkedin.com/in/raphael-charpentier-38b51720b",
  github: "https://github.com/rchrp",
};

export const outro = {
  title: ["Un projet en tête\u00a0?", "Parlons-en."],
  lead: "Disponible pour des missions freelance : produits web, interfaces sur mesure et expériences interactives.",
};

// What the monitor's glass says around the chapters it carries.
export const monitorCopy = {
  manifestoKicker: "01 — Manifeste",
  // Shown as the projects come in.
  terminal: { kicker: "02", text: "Mes projets" },
  ctaKicker: "03 — Contact",
  contactKicker: "Contact",
  close: "Fermer",
};

// Third-party assets that require attribution (see README).
export const credits = {
  model: {
    title: "Monitor IV",
    url: "https://sketchfab.com/3d-models/monitor-iv-c22e137779e7439b8825bf734de9a471",
    author: "re1monsen",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  },
};
