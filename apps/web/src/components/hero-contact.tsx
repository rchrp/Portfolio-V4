"use client";

import { Check, Copy, Mail, Phone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PixelArrow } from "@/components/pixel-arrow";
import { GitHubIcon, LinkedInIcon } from "@/components/social-icons";
import { contact } from "@/lib/site-content";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  return (
    <button
      type="button"
      className="hero-contact-copy"
      aria-label={copied ? `${label} copié` : `Copier ${label}`}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => setCopied(true));
      }}
    >
      {copied ? (
        <Check size={15} aria-hidden="true" />
      ) : (
        <Copy size={15} aria-hidden="true" />
      )}
    </button>
  );
}

// Contact actions under the hero title: a "contact" button opening e-mail
// and phone details, and profile links. Each item appears once configured.
export function HeroContact() {
  const { email, phone, linkedin, github } = contact;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hasDetails = Boolean(email || phone);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="hero-actions">
      {hasDetails ? (
        <button
          ref={triggerRef}
          type="button"
          className="pixel-button pixel-button-solid"
          aria-expanded={open}
          aria-controls="hero-contact-panel"
          onClick={() => setOpen((value) => !value)}
        >
          Me contacter
          <PixelArrow />
        </button>
      ) : (
        <a className="pixel-button pixel-button-solid" href="#contact">
          Me contacter
          <PixelArrow />
        </a>
      )}

      {linkedin && (
        <a
          className="hero-social"
          href={linkedin}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="LinkedIn (nouvel onglet)"
        >
          <LinkedInIcon />
        </a>
      )}
      {github && (
        <a
          className="hero-social"
          href={github}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub (nouvel onglet)"
        >
          <GitHubIcon />
        </a>
      )}

      {hasDetails && (
        <div
          id="hero-contact-panel"
          className="hero-contact-panel"
          data-open={open}
          hidden={!open}
        >
          {email && (
            <div className="hero-contact-row">
              <Mail size={16} aria-hidden="true" />
              <a href={`mailto:${email}`}>{email}</a>
              <CopyButton value={email} label="l’adresse e-mail" />
            </div>
          )}
          {phone && (
            <div className="hero-contact-row">
              <Phone size={16} aria-hidden="true" />
              <a href={`tel:${phone.replace(/[^\d+]/g, "")}`}>{phone}</a>
              <CopyButton value={phone} label="le numéro" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
