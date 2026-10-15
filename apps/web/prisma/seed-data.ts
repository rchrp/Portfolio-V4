import type {
  ProjectKind,
  ProjectLinkKind,
  ProjectStatus,
} from "../src/generated/prisma/client";

export type SeedProject = {
  slug: string;
  title: string;
  summary: string;
  description: string;
  kind: ProjectKind;
  category: string;
  role: string;
  client?: string;
  /** "YYYY-MM" */
  startedOn: string;
  /** "YYYY-MM", or absent while the project is going on. */
  endedOn?: string;
  highlights: string[];
  technologies: string[];
  imageUrl: string;
  imageAlt: string;
  /** Uploaded from the admin panel, or `/projects/<slug>/…`. */
  logoUrl?: string;
  accentColor: string;
  notice?: string;
  featured?: boolean;
  status: ProjectStatus;
  links?: { kind: ProjectLinkKind; label: string; url: string }[];
  media?: { url: string; alt: string; caption?: string }[];
  metrics?: { value: string; label: string }[];
};

// Listed in display order.
export const seedProjects: SeedProject[] = [
  {
    slug: "blame",
    title: "Blame",
    summary:
      "L’environnement de développement où des agents IA codent, et où vous gardez la décision finale.",
    description:
      "Blame est un ADE, un environnement de développement pensé pour les agents de code IA. Chaque user story devient une piste isolée, avec sa branche, son worktree Git, son environnement et sa preview. On suit le travail de l’agent, on teste le résultat dans l’application qui tourne, on relit chaque changement, puis on décide : demander des corrections, rejeter, ou approuver et fusionner. Je conçois et développe le produit de bout en bout, de l’application desktop à l’API, des previews cloud au site et à l’offre Premium.",
    kind: "PRODUCT",
    category: "Application desktop · IA",
    role: "Fondateur · conception, design et développement",
    startedOn: "2026-05",
    highlights: [
      "Un backlog piloté par les user stories, de la file d’attente jusqu’au merge.",
      "Des worktrees Git isolés, chacun avec son environnement, son port et sa preview locale ou cloud.",
      "Un harnais sémantique : navigation syntaxique dans le code, éditions contrôlées et preuves d’exécution.",
      "Plusieurs agents en parallèle, sur le fournisseur d’IA et le modèle les plus adaptés à chaque tâche.",
      "Des Code Practices : les conventions du projet, appliquées par chaque agent.",
      "Une étude expérimentale du harnais, menée sur des protocoles préenregistrés.",
    ],
    technologies: [
      "TypeScript",
      "Electron",
      "React",
      "Tailwind CSS",
      "AdonisJS",
      "MySQL",
      "Next.js",
      "Three.js",
      "Vercel Sandbox",
      "Stripe",
      "Turborepo",
    ],
    imageUrl: "/projects/blame/cover.webp",
    imageAlt:
      "Blame, « The ADE that sets the standard » : l’application desktop et son backlog sur un dégradé bleu nuit.",
    logoUrl: "/projects/blame/c88a50e03f827967abc9fe98.webp",
    accentColor: "#5b4bff",
    featured: true,
    status: "PUBLISHED",
    links: [
      { kind: "WEBSITE", label: "Voir le site", url: "https://blame.so" },
      {
        kind: "DOWNLOAD",
        label: "Télécharger",
        url: "https://blame.so/download",
      },
      {
        kind: "VIDEO",
        label: "Voir la démo",
        url: "https://youtu.be/cD6jASpIKQw",
      },
      {
        kind: "SOURCE",
        label: "Code source",
        url: "https://github.com/AZERK0/Blame",
      },
    ],
    media: [
      {
        url: "/projects/blame/backlog.webp",
        alt: "Le backlog de Blame : des colonnes de user stories, de la file d’attente à la revue.",
        caption: "Le backlog : chaque story avance jusqu’au merge.",
      },
      {
        url: "/projects/blame/preview.webp",
        alt: "Une user story ouverte à côté de la preview de l’application qu’elle modifie.",
        caption: "La preview de la story, à côté de son suivi.",
      },
      {
        url: "/projects/blame/practices.webp",
        alt: "La page Code Practices de Blame, avec les conventions du projet.",
        caption: "Les Code Practices du projet.",
      },
      {
        url: "/projects/blame/new-project.webp",
        alt: "La fenêtre de création d’un nouveau projet dans Blame.",
        caption: "D’un dossier vide à un projet prêt pour les agents.",
      },
    ],
    metrics: [
      { value: "50", label: "fournisseurs d’IA pris en charge" },
      { value: "3", label: "plateformes : macOS, Windows et Linux" },
      { value: "1 300+", label: "commits" },
    ],
  },
  {
    slug: "amazon-analyzer",
    title: "Amazon Analyzer",
    summary:
      "Un SaaS et une extension navigateur qui aident les vendeurs Amazon à trouver, valider et lancer un produit rentable.",
    description:
      "Amazon Analyzer accompagne les vendeurs Amazon de l’idée de produit jusqu’au lancement. L’extension enrichit les pages Amazon en direct ; l’application web réunit l’analyse de marché, la validation produit, le suivi des opportunités et un studio de création. Un copilote IA analyse la concurrence et aide à concevoir un produit compétitif, tandis que le mode Autopilot enchaîne les analyses en autonomie. Le produit est commercialisé sous le nom Sensas.",
    kind: "FREELANCE",
    category: "SaaS · Extension navigateur",
    role: "Développeur full stack · architecture et IA",
    startedOn: "2025-04",
    highlights: [
      "Des analyses de rentabilité et de marché construites sur les données Keepa et Amazon.",
      "Un copilote IA qui analyse la concurrence et aide à concevoir le produit.",
      "Un mode Autopilot : des missions d’analyse menées de bout en bout, adaptées au profil du vendeur.",
      "Un studio IA : fiches produit, noms de marque, photos et logos vectoriels prêts à l’export.",
      "La recherche de mots-clés et la recherche inversée par ASIN.",
    ],
    technologies: [
      "Nuxt",
      "Vue",
      "AdonisJS",
      "TypeScript",
      "MySQL",
      "OpenRouter",
      "Keepa API",
      "Qdrant",
      "Turborepo",
      "Docker",
    ],
    imageUrl: "/projects/amazon-analyzer/opportunity-tracker.webp",
    imageAlt:
      "L’Opportunity Tracker d’Amazon Analyzer : des produits de référence avec leurs prix, ventes et analyses.",
    logoUrl: "/projects/amazon-analyzer/eb44a2b9e100903c3260530f.webp",
    accentColor: "#f2b705",
    status: "PUBLISHED",
    media: [
      {
        url: "/projects/amazon-analyzer/studio.webp",
        alt: "Le studio photo IA : des visuels secondaires générés pour une fiche produit de vélo.",
        caption: "Le studio : des visuels produit générés par l’IA.",
      },
      {
        url: "/projects/amazon-analyzer/ai-synthese.webp",
        alt: "L’écran de synthèse IA d’une analyse de marché.",
        caption: "La synthèse IA d’une analyse de marché.",
      },
    ],
    metrics: [
      { value: "3", label: "applications : extension, web et API" },
      { value: "900+", label: "commits" },
    ],
  },
  {
    slug: "finvio",
    title: "Finvio",
    summary:
      "Une plateforme SaaS pour comprendre, organiser et faire grandir son patrimoine, accompagné pas à pas.",
    description:
      "Finvio aide les particuliers à passer de spectateurs à acteurs de leurs finances. La plateforme réunit le profil de l’investisseur, son budget, ses objectifs et l’ensemble de son patrimoine, des placements financiers à l’immobilier, pour construire une stratégie d’investissement étape par étape, sans vente cachée et avec un accompagnement humain. J’ai développé l’application dans un monorepo full stack, du parcours d’accueil aux tableaux de bord patrimoniaux.",
    kind: "FREELANCE",
    category: "SaaS · Gestion de patrimoine",
    role: "Développeur full stack",
    startedOn: "2025-01",
    endedOn: "2025-12",
    highlights: [
      "Un parcours d’accueil et un profil d’investisseur guidés.",
      "Une vue d’ensemble du patrimoine par classes d’actifs et enveloppes d’investissement.",
      "Le suivi du budget, des revenus, des dépenses et des objectifs.",
      "Un monorepo full stack : Nuxt en front, AdonisJS en back.",
    ],
    technologies: ["Nuxt", "Vue", "AdonisJS", "TypeScript", "Turborepo"],
    imageUrl: "/projects/finvio/home.webp",
    imageAlt:
      "La page d’accueil de Finvio : « Passe de spectateur à acteur de tes finances ».",
    logoUrl: "/projects/finvio/6017bd5616cce9b745964a5b.webp",
    accentColor: "#2f6bff",
    status: "PUBLISHED",
    media: [
      {
        url: "/projects/finvio/wealth.webp",
        alt: "Le tableau de bord du patrimoine, réparti par classes d’actifs et par enveloppes.",
        caption: "Le patrimoine, par classes d’actifs et enveloppes.",
      },
      {
        url: "/projects/finvio/info.webp",
        alt: "Le formulaire des informations principales du profil.",
        caption: "Le profil de l’investisseur.",
      },
      {
        url: "/projects/finvio/welcome.webp",
        alt: "L’écran de bienvenue du parcours d’accueil de Finvio.",
        caption: "Le parcours d’accueil.",
      },
    ],
  },
  {
    slug: "finalyzing",
    title: "Finalyzing",
    summary:
      "Une suite d’analyse financière : marchés, macroéconomie et portefeuilles, réunis sur une même plateforme.",
    description:
      "Finalyzing réunit trois outils d’analyse financière. L’analyse des marchés couvre plus de 150 000 actions dans le monde, avec leurs données fondamentales et techniques. L’analyse macroéconomique donne accès aux indicateurs actuels et historiques de plus de 215 pays. L’analyse de portefeuille, enfin, mesure ses investissements à l’aide de statistiques variées. La plateforme a été développée en collaboration avec EODHD, fournisseur de données financières.",
    kind: "PERSONAL",
    category: "Plateforme d’analyse financière",
    role: "Conception et développement full stack",
    startedOn: "2022-07",
    endedOn: "2024-02",
    highlights: [
      "Des fiches action avec données fondamentales, techniques et graphiques interactifs.",
      "Des tableaux de bord macroéconomiques par pays.",
      "Le suivi et les statistiques de portefeuilles d’investissement.",
      "Une interface responsive, pensée aussi pour le mobile.",
    ],
    technologies: ["Angular", "TypeScript", "Python", "Flask", "EODHD API"],
    imageUrl: "/projects/finalyzing/home.webp",
    imageAlt:
      "La page d’accueil de Finalyzing, « Stay one step ahead », avec ses écrans desktop et mobile.",
    logoUrl: "/projects/finalyzing/b234c52957d6f4135b01cf1b.webp",
    accentColor: "#7c5cff",
    notice:
      "La plateforme n’est plus accessible en ligne : les captures montrent sa dernière version publiée.",
    status: "PUBLISHED",
    media: [
      {
        url: "/projects/finalyzing/markets.webp",
        alt: "L’analyse des marchés : analyse technique et fondamentale sur 150 000 actions.",
        caption: "L’analyse des marchés.",
      },
      {
        url: "/projects/finalyzing/portfolios.webp",
        alt: "L’analyse de portefeuille de Finalyzing.",
        caption: "L’analyse de portefeuille.",
      },
      {
        url: "/projects/finalyzing/macro.webp",
        alt: "Les indicateurs macroéconomiques d’un pays dans Finalyzing.",
        caption: "La macroéconomie, pays par pays.",
      },
    ],
    metrics: [
      { value: "150 000+", label: "actions analysables" },
      { value: "215+", label: "pays couverts" },
      { value: "30+ ans", label: "d’historique de données" },
    ],
  },
  {
    slug: "atelier-sophie-sylvestre",
    title: "Atelier Sophie Sylvestre",
    summary:
      "Le site d’une restauratrice de tableaux, qui met à jour sa galerie en toute autonomie.",
    description:
      "Sophie Sylvestre restaure et conserve des tableaux, avec une spécialité : la peinture à l’huile sur toile. Son site présente son parcours, son atelier et ses interventions, et met ses restaurations en valeur dans une galerie qu’elle alimente elle-même depuis Contentful, sans passer par un développeur. Un formulaire de contact permet de lui demander un devis.",
    kind: "FREELANCE",
    category: "Site vitrine · CMS",
    role: "Conception, développement et mise en ligne",
    client: "Sophie Sylvestre, restauratrice-conservatrice de tableaux",
    startedOn: "2024-12",
    endedOn: "2024-12",
    highlights: [
      "Une galerie administrable par la cliente depuis Contentful.",
      "Des pages dédiées au parcours, à l’atelier, aux interventions et aux études.",
      "Un formulaire de contact et de demande de devis.",
      "Un référencement naturel soigné.",
    ],
    technologies: ["Nuxt", "Vue", "Contentful"],
    imageUrl: "/projects/atelier-sophie-sylvestre/home.webp",
    imageAlt:
      "L’accueil du site de l’Atelier Sophie Sylvestre : un portrait ancien posé sur un chevalet.",
    accentColor: "#c8973f",
    status: "PUBLISHED",
    links: [
      {
        kind: "WEBSITE",
        label: "Voir le site",
        url: "https://atelier-sophie-sylvestre.fr",
      },
    ],
    media: [
      {
        url: "/projects/atelier-sophie-sylvestre/gallery.webp",
        alt: "La galerie des restaurations de l’atelier.",
        caption: "La galerie, gérée depuis Contentful.",
      },
      {
        url: "/projects/atelier-sophie-sylvestre/interventions.webp",
        alt: "La page des interventions de l’atelier.",
        caption: "Les interventions.",
      },
      {
        url: "/projects/atelier-sophie-sylvestre/studies.webp",
        alt: "La page des études et du parcours de Sophie Sylvestre.",
        caption: "Le parcours.",
      },
      {
        url: "/projects/atelier-sophie-sylvestre/contact.webp",
        alt: "Le formulaire de contact du site.",
        caption: "Le formulaire de contact.",
      },
    ],
  },
  {
    slug: "neurastock",
    title: "NeuraStock A.I.",
    summary:
      "Un modèle Transformer entraîné sur 10 000 cotations boursières pour tester des stratégies d’investissement.",
    description:
      "Le projet fondateur de mon parcours. NeuraStock récupère les cotations de 10 000 actions dans le monde via des API et les stocke dans PostgreSQL, puis les nettoie et les prépare avant de les confier à un modèle Transformer développé avec TensorFlow et Keras. Les prédictions passent ensuite par des outils de backtest, qui mesurent la performance des stratégies à travers de nombreuses statistiques.",
    kind: "PERSONAL",
    category: "Intelligence artificielle · Finance",
    role: "Data et machine learning",
    startedOn: "2020-05",
    endedOn: "2021-09",
    highlights: [
      "Un pipeline de collecte, de nettoyage et de préparation des données.",
      "Un modèle Transformer développé avec TensorFlow et Keras.",
      "Des backtests et des statistiques de performance pour chaque stratégie.",
    ],
    technologies: ["Python", "TensorFlow", "Keras", "PostgreSQL"],
    imageUrl: "/projects/neurastock/benefit.webp",
    imageAlt:
      "Les résultats d’un modèle NeuraStock sur l’action Apple : paramètres, statistiques et courbe de bénéfices.",
    accentColor: "#0ea5e9",
    status: "PUBLISHED",
    metrics: [{ value: "10 000", label: "cotations d’entraînement" }],
  },
  {
    slug: "gt3-event",
    title: "GT3 Event",
    summary:
      "Des courses hebdomadaires automatisées pour une communauté Assetto Corsa de 10 000 joueurs.",
    description:
      "Chaque semaine, un script Python organise une course sur un serveur Assetto Corsa pour une communauté Discord de 10 000 joueurs. Les joueurs votent pour la piste, s’inscrivent et courent, puis retrouvent résultats et classements, sans intervention manuelle.",
    kind: "PERSONAL",
    category: "Automatisation · Communauté",
    role: "Conception et développement",
    startedOn: "2024-10",
    endedOn: "2024-10",
    highlights: [
      "Le vote de la piste par la communauté.",
      "La gestion automatique des inscriptions et des courses.",
      "Les résultats et classements publiés sur Discord.",
    ],
    technologies: ["Python", "Discord API"],
    imageUrl: "/projects/gt3-event/gt3-grand-prix.webp",
    imageAlt:
      "L’affiche du GT3 Grand Prix : trois voitures de course GT3 sous des néons rouges et bleus.",
    logoUrl: "/projects/gt3-event/a88cc659605f0adc4fb17681.webp",
    accentColor: "#e5383b",
    status: "PUBLISHED",
    links: [
      {
        kind: "COMMUNITY",
        label: "Rejoindre le Discord",
        url: "https://discord.gg/BHUFmjJUTN",
      },
    ],
    media: [
      {
        url: "/projects/gt3-event/server.webp",
        alt: "Le serveur Assetto Corsa de l’événement.",
        caption: "Le serveur de course.",
      },
    ],
    metrics: [{ value: "10 000", label: "joueurs dans la communauté" }],
  },
  {
    slug: "minishell",
    title: "MiniShell",
    summary:
      "Un interpréteur de commandes Unix écrit en C, des pipes aux redirections.",
    description:
      "Un projet Epitech : réécrire un shell Unix. MiniShell exécute les commandes standard, avec chemins relatifs ou absolus et leurs options, et prend en charge les redirections, les pipes et les variables d’environnement. Le tout repose sur des appels système bas niveau pour créer les processus, gérer les entrées-sorties et coordonner l’exécution.",
    kind: "SCHOOL",
    category: "Programmation système",
    role: "Développement en C",
    startedOn: "2024-03",
    endedOn: "2024-03",
    highlights: [
      "L’exécution des commandes Unix, par chemin relatif ou absolu.",
      "Les redirections (>, <, >>) et les pipes (|).",
      "Les variables d’environnement et les commandes intégrées.",
    ],
    technologies: ["C", "Unix", "Make"],
    imageUrl: "/projects/minishell/demo.webp",
    imageAlt: "Une session de MiniShell dans un terminal.",
    accentColor: "#3fb950",
    status: "PUBLISHED",
  },
  {
    slug: "grossify",
    title: "Grossify",
    summary:
      "Une marketplace qui aide les restaurateurs à trouver les grossistes les plus adaptés, grâce à l’IA.",
    description:
      "Grossify met en relation restaurateurs et grossistes. Grâce à l’IA et à des outils de recherche, les restaurateurs trouvent les fournisseurs les mieux adaptés à leurs besoins et les plus économiques ; les grossistes, eux, gagnent en visibilité et attirent de nouveaux clients.",
    kind: "PERSONAL",
    category: "Marketplace · IA",
    role: "Conception et développement full stack",
    startedOn: "2024-08",
    highlights: [
      "La recherche de grossistes selon les besoins et les prix.",
      "Une recommandation assistée par l’IA.",
      "Un espace de visibilité pour les grossistes.",
    ],
    technologies: ["Nuxt", "Vue", "AdonisJS"],
    imageUrl: "/projects/grossify/home.webp",
    imageAlt: "La page d’accueil de Grossify.",
    accentColor: "#2fa46b",
    status: "DRAFT",
  },
];
