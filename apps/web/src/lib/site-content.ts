// Editorial copy of the home page, kept in one place to be edited without
// touching the components.

export const hero = {
  firstName: "Raphaël",
  lastName: "Charpentier",
  role: "Software engineer · Freelance",
  lead: "Disponible pour des missions freelance : produits web, interfaces sur mesure et expériences interactives.",
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

// Public contact details, shown in the contact section. Each one is
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
};
