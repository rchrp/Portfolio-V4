import {
  contact,
  hero,
  manifesto,
  monitorCopy,
  outro,
} from "@/lib/site-content";
import type { MonitorScreens } from "./monitor-renderer";
import type { CardAction, ContactRow } from "./screen-cards";

// What the monitor's glass shows in each chapter, from the site's copy. The
// ids of the actions are those of the controls laid over them (see
// ScreenControls, HeroScreen and SiteOutro).

const displayUrl = (url: string) =>
  url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

const profiles: CardAction[] = [
  ...(contact.linkedin ? [{ id: "linkedin", label: "LinkedIn" }] : []),
  ...(contact.github ? [{ id: "github", label: "GitHub" }] : []),
];

const rows: ContactRow[] = [];
if (contact.email)
  rows.push({
    id: "email",
    label: "E-mail",
    value: contact.email,
    action: { kind: "copy", id: "copy-email" },
  });
if (contact.phone)
  rows.push({
    id: "phone",
    label: "Téléphone",
    value: contact.phone,
    action: { kind: "copy", id: "copy-phone" },
  });
if (contact.linkedin)
  rows.push({
    id: "linkedin",
    label: "LinkedIn",
    value: displayUrl(contact.linkedin),
    action: { kind: "open" },
  });
if (contact.github)
  rows.push({
    id: "github",
    label: "GitHub",
    value: displayUrl(contact.github),
    action: { kind: "open" },
  });

export const monitorScreens: MonitorScreens = {
  hero: {
    ...hero,
    actions: [
      ...(contact.email || contact.phone
        ? [{ id: "contact", label: "Me contacter" }]
        : []),
      ...profiles,
    ],
  },
  contact: {
    kicker: monitorCopy.contactKicker,
    close: { id: "close", label: monitorCopy.close },
    rows,
  },
  manifesto: { kicker: monitorCopy.manifestoKicker, ...manifesto },
  terminal: monitorCopy.terminal,
  cta: {
    kicker: monitorCopy.ctaKicker,
    aside: contact.email,
    title: [outro.title[0], outro.title[1]],
    lead: outro.lead,
    actions: [
      ...(contact.email ? [{ id: "email", label: "Écrire un e-mail" }] : []),
      ...profiles,
    ],
  },
};
