// Editorial copy of the single-page story, kept in one place to be edited
// without touching the components.

export const manifesto = {
  // Words wrapped in *asterisks* are highlighted with the accent color.
  text: "Je conçois et développe des produits web de bout en bout, de l’interface que l’on touche au système qui la fait tenir. *Chaque pixel* a une raison d’être. Chaque ligne de code aussi.",
  disciplines: [
    { label: "Interfaces", detail: "React, Next.js, animation & WebGL" },
    { label: "Systèmes", detail: "Node.js, API, PostgreSQL" },
    { label: "Produit", detail: "Conception, itération, mise en ligne" },
  ],
};

export const projectsChapter = {
  title: "Le terminal",
  lead: "Une sélection de réalisations, une chaîne à la fois.",
};

// Public contact details, shown in the hero and the outro. Each one is
// displayed only once it is set.
export const contact = {
  email: "",
  /** Displayed as written, e.g. "+33 6 12 34 56 78". */
  phone: "",
  linkedin: "",
  github: "",
};

export const outro = {
  title: ["Un projet en tête\u00a0?", "Allumons-le."],
  lead: "Disponible pour des missions freelance : produits web, interfaces sur mesure et expériences interactives.",
  signature: "Conçu et développé pixel par pixel.",
};

// Third-party assets that require attribution (see README).
export const credits = {
  model: {
    title: "Computer Terminal",
    url: "https://skfb.ly/6vrwA",
    author: "Chris Sweetwood",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  },
};
