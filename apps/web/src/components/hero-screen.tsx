"use client";

import { useEffect, useState } from "react";
import { useMonitor } from "@/components/monitor-stage";
import {
  ScreenControls,
  type ScreenControl,
} from "@/components/screen-controls";
import { contact, hero } from "@/lib/site-content";

const { email, phone, linkedin, github } = contact;

const profiles: ScreenControl[] = [
  ...(linkedin
    ? [
        {
          id: "linkedin",
          label: "LinkedIn (nouvel onglet)",
          href: linkedin,
          external: true,
        },
      ]
    : []),
  ...(github
    ? [
        {
          id: "github",
          label: "GitHub (nouvel onglet)",
          href: github,
          external: true,
        },
      ]
    : []),
];

// The hero's card on the monitor: the name and its actions; "contact" brings
// the monitor forward with the contact details, until Escape, the close
// button, a click elsewhere or a scroll.
export function HeroScreen() {
  const { renderer } = useMonitor();
  const [open, setOpen] = useState(false);
  // After closing from the card, the focus goes back to its trigger.
  const [returning, setReturning] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    renderer?.setContactOpen(open);
  }, [renderer, open]);

  // Once the card is back, the focus has returned.
  useEffect(() => {
    if (!returning) return;
    const timeout = window.setTimeout(() => setReturning(false), 1000);
    return () => window.clearTimeout(timeout);
  }, [returning]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setReturning(true);
      setOpen(false);
    };
    const onScroll = () => {
      if (window.scrollY > 24) setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest(".screen-control")
      )
        setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const copy = (id: string, value: string, what: string) => () => {
    void navigator.clipboard?.writeText(value).then(() => {
      renderer?.setCopied(id);
      setNotice(`${what} copié.`);
      window.setTimeout(() => renderer?.setCopied(null), 1600);
    });
  };

  const details: ScreenControl[] = [
    ...(email
      ? [
          { id: "email", label: `Écrire à ${email}`, href: `mailto:${email}` },
          {
            id: "copy-email",
            label: "Copier l’adresse e-mail",
            onActivate: copy("copy-email", email, "Adresse e-mail"),
          },
        ]
      : []),
    ...(phone
      ? [
          {
            id: "phone",
            label: `Appeler le ${phone}`,
            href: `tel:${phone.replace(/[^\d+]/g, "")}`,
          },
          {
            id: "copy-phone",
            label: "Copier le numéro",
            onActivate: copy("copy-phone", phone, "Numéro"),
          },
        ]
      : []),
    ...profiles,
    {
      id: "close",
      label: "Fermer les coordonnées",
      onActivate: () => {
        setReturning(true);
        setOpen(false);
      },
    },
  ];

  return (
    <>
      <ScreenControls
        showing="hero"
        label={`${hero.firstName} ${hero.lastName}`}
        focus={returning ? "contact" : null}
        controls={[
          ...(email || phone
            ? [
                {
                  id: "contact",
                  label: "Afficher les coordonnées",
                  onActivate: () => {
                    setReturning(false);
                    setOpen(true);
                  },
                },
              ]
            : []),
          ...profiles,
        ]}
      />
      <ScreenControls
        showing="contact"
        label="Coordonnées"
        focus={open ? details[0]?.id : null}
        controls={details}
      />
      <p className="sr-only" aria-live="polite">
        {notice}
      </p>
    </>
  );
}
