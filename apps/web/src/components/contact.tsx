"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { GitHubIcon, LinkedInIcon } from "@/components/social-icons";
import { contact, outro } from "@/lib/site-content";

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
      className="contact-copy"
      aria-label={copied ? `${label} copié` : `Copier ${label}`}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => setCopied(true));
      }}
    >
      {copied ? (
        <Check size={16} aria-hidden="true" />
      ) : (
        <Copy size={16} aria-hidden="true" />
      )}
    </button>
  );
}

// The page ends where it began, after dark: the invitation, and every way to
// answer it. On the home page the stage paints the night behind it; anywhere
// else the section carries its own.
export function Contact() {
  const { email, phone, linkedin, github } = contact;

  return (
    <footer
      id="contact"
      className="contact"
      aria-labelledby="contact-heading"
      data-nav-stops="0.42"
    >
      <div className="contact-content" data-calm>
        <h2 id="contact-heading" className="contact-title">
          <span>{outro.title[0]}</span> <span>{outro.title[1]}</span>
        </h2>

        <ul className="contact-ways">
          {email && (
            <li>
              <span className="contact-label">E-mail</span>
              <a className="contact-value" href={`mailto:${email}`}>
                {email}
              </a>
              <CopyButton value={email} label="l’adresse e-mail" />
            </li>
          )}
          {phone && (
            <li>
              <span className="contact-label">Téléphone</span>
              <a
                className="contact-value"
                href={`tel:${phone.replace(/[^+\d]/g, "")}`}
              >
                {phone}
              </a>
              <CopyButton value={phone} label="le numéro" />
            </li>
          )}
        </ul>

        {(linkedin || github) && (
          <div className="contact-profiles">
            {linkedin && (
              <a href={linkedin} target="_blank" rel="noopener noreferrer">
                <LinkedInIcon size={17} />
                LinkedIn
                <span className="sr-only"> (nouvel onglet)</span>
              </a>
            )}
            {github && (
              <a href={github} target="_blank" rel="noopener noreferrer">
                <GitHubIcon size={17} />
                GitHub
                <span className="sr-only"> (nouvel onglet)</span>
              </a>
            )}
          </div>
        )}
        <p className="contact-footer">
          © {new Date().getFullYear()} Raphaël Charpentier
        </p>
      </div>
    </footer>
  );
}
