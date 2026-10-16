"use client";

// Form building blocks shared by the admin editors.
import {
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import type { FieldErrors } from "@/lib/admin/project-form";

export function Section({
  index,
  title,
  description,
  children,
}: {
  index: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="adm-card" aria-labelledby={id}>
      <header className="adm-card-head">
        <div>
          <h2 id={id} className="adm-section-title">
            <span className="adm-kicker">{index}</span>
            {title}
          </h2>
          {description && <p>{description}</p>}
        </div>
      </header>
      <div className="adm-card-body">{children}</div>
    </section>
  );
}

type ControlProps = {
  id: string;
  "aria-invalid": boolean;
  "aria-describedby"?: string;
};

export function Field({
  label,
  hint,
  error,
  count,
  max,
  wide,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  count?: number;
  max?: number;
  wide?: boolean;
  children: (props: ControlProps) => ReactNode;
}) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={`adm-field${wide ? " is-wide" : ""}`}>
      <label htmlFor={id} className="adm-label">
        {label}
        {max !== undefined && count !== undefined && (
          <small className={count > max ? "is-over" : undefined}>
            {count}/{max}
          </small>
        )}
      </label>
      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": describedBy || undefined,
      })}
      {error ? (
        <FieldError id={`${id}-error`} message={error} />
      ) : (
        hint && (
          <span id={`${id}-hint`} className="adm-hint">
            {hint}
          </span>
        )
      )}
    </div>
  );
}

export function FieldError({ id, message }: { id?: string; message: string }) {
  return (
    <span id={id} className="adm-error">
      <CircleAlert size={12} aria-hidden="true" />
      {message}
    </span>
  );
}

export function InlineInput({
  label,
  value,
  onChange,
  error,
  mono,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  mono?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="adm-field">
      <label htmlFor={id} className="adm-hint">
        {label}
      </label>
      <input
        id={id}
        className={`adm-input${mono ? " is-mono" : ""}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        placeholder={placeholder}
        spellCheck={mono ? false : undefined}
      />
      {error && <FieldError id={`${id}-error`} message={error} />}
    </div>
  );
}

export function InlineSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  const id = useId();
  return (
    <div className="adm-field">
      <label htmlFor={id} className="adm-hint">
        {label}
      </label>
      <select
        id={id}
        className="adm-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([option, text]) => (
          <option key={option} value={option}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

function move<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

function ItemTools({
  index,
  count,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="adm-repeat-tools">
      <button
        type="button"
        className="adm-icon-button"
        onClick={() => onMove(index - 1)}
        disabled={index === 0}
        aria-label="Monter"
      >
        <ChevronUp aria-hidden="true" />
      </button>
      <button
        type="button"
        className="adm-icon-button"
        onClick={() => onMove(index + 1)}
        disabled={index === count - 1}
        aria-label="Descendre"
      >
        <ChevronDown aria-hidden="true" />
      </button>
      <button
        type="button"
        className="adm-icon-button is-danger"
        onClick={onRemove}
        aria-label="Retirer"
      >
        <Trash2 aria-hidden="true" />
      </button>
    </div>
  );
}

export function ObjectList<T>({
  items,
  onChange,
  max,
  blank,
  addLabel,
  render,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  max: number;
  blank: T;
  addLabel: string;
  render: (item: T, index: number, update: (item: T) => void) => ReactNode;
}) {
  return (
    <div className="adm-repeat">
      {items.map((item, index) => (
        <div key={index} className="adm-repeat-item">
          {render(item, index, (next) =>
            onChange(
              items.map((current, at) => (at === index ? next : current)),
            ),
          )}
          <ItemTools
            index={index}
            count={items.length}
            onMove={(to) => onChange(move(items, index, to))}
            onRemove={() => onChange(items.filter((_, at) => at !== index))}
          />
        </div>
      ))}
      {items.length < max && (
        <button
          type="button"
          className="adm-button adm-add"
          onClick={() => onChange([...items, { ...blank }])}
        >
          <Plus aria-hidden="true" />
          {addLabel}
        </button>
      )}
    </div>
  );
}

export function StringList({
  items,
  onChange,
  errors,
  path,
  max,
  placeholder,
  addLabel,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  errors: FieldErrors;
  path: string;
  max: number;
  placeholder: string;
  addLabel: string;
}) {
  return (
    <div className="adm-repeat">
      {items.map((item, index) => {
        const error = errors[`${path}.${index}`];
        return (
          <div key={index} className="adm-repeat-item is-inline">
            <div className="adm-field">
              <div className="adm-row">
                <span className="adm-repeat-index" aria-hidden="true">
                  {index + 1}
                </span>
                <input
                  className="adm-input"
                  value={item}
                  onChange={(event) =>
                    onChange(
                      items.map((current, at) =>
                        at === index ? event.target.value : current,
                      ),
                    )
                  }
                  aria-label={`Point ${index + 1}`}
                  aria-invalid={Boolean(error)}
                  placeholder={placeholder}
                  maxLength={240}
                />
              </div>
              {error && <FieldError message={error} />}
            </div>
            <ItemTools
              index={index}
              count={items.length}
              onMove={(to) => onChange(move(items, index, to))}
              onRemove={() => onChange(items.filter((_, at) => at !== index))}
            />
          </div>
        );
      })}
      {items.length < max && (
        <button
          type="button"
          className="adm-button adm-add"
          onClick={() => onChange([...items, ""])}
        >
          <Plus aria-hidden="true" />
          {addLabel}
        </button>
      )}
    </div>
  );
}

export function TagInput({
  tags,
  onChange,
  error,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  error?: string;
}) {
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);

  function commit(value = draft) {
    const additions = value
      .split(",")
      .map((tag) => tag.trim().slice(0, 40))
      .filter((tag) => tag && !tags.includes(tag));
    if (additions.length) onChange([...tags, ...additions].slice(0, 30));
    setDraft("");
  }

  return (
    <div className="adm-field">
      <div className="adm-tags" onClick={() => input.current?.focus()}>
        {tags.map((tag) => (
          <span key={tag} className="adm-tag">
            {tag}
            <button
              type="button"
              onClick={() =>
                onChange(tags.filter((current) => current !== tag))
              }
              aria-label={`Retirer ${tag}`}
            >
              <X aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          ref={input}
          value={draft}
          onChange={(event) => {
            const value = event.target.value;
            if (value.includes(",")) commit(value);
            else setDraft(value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            } else if (event.key === "Backspace" && !draft && tags.length) {
              onChange(tags.slice(0, -1));
            }
          }}
          onBlur={() => commit()}
          placeholder={tags.length ? "" : "Next.js, TypeScript…"}
          aria-label="Ajouter une technologie"
          aria-invalid={Boolean(error)}
        />
      </div>
      {error && <FieldError message={error} />}
    </div>
  );
}
