"use client";

import {
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  ImagePlus,
  LoaderCircle,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { projectPeriod, publicUrl } from "@/lib/projects";
import {
  MAX_UPLOAD_BYTES,
  SLUG_PATTERN,
  UPLOAD_TYPES,
} from "@/lib/uploaded-images";
import {
  kindLabels,
  linkKindLabels,
  projectKinds,
  projectLinkKinds,
  projectStatuses,
  slugify,
  statusLabels,
  type FieldErrors,
  type ProjectFormValues,
} from "@/lib/admin/project-form";
import { deleteProjectAction, saveProjectAction } from "../_actions/projects";
import { uploadProjectImageAction } from "../_actions/uploads";
import { ConfirmButton } from "./confirm-dialog";

type Values = ProjectFormValues;
type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

export function ProjectEditor({
  projectId,
  initial,
}: {
  projectId: string | null;
  initial: Values;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const [slugTouched, setSlugTouched] = useState(projectId !== null);
  const form = useRef<HTMLFormElement>(null);

  const dirty = JSON.stringify(values) !== JSON.stringify(saved);

  const set = useCallback(
    <K extends keyof Values>(key: K, value: Values[K]) => {
      setValues((current) => {
        const next = { ...current, [key]: value };
        if (key === "title" && !slugTouched) {
          next.slug = slugify(String(value));
        }
        return next;
      });
      setState((current) =>
        current.kind === "saved" ? { kind: "idle" } : current,
      );
    },
    [slugTouched],
  );

  const save = useCallback(async () => {
    if (state.kind === "saving") return;
    setState({ kind: "saving" });
    const snapshot = values;
    try {
      const result = await saveProjectAction(projectId, snapshot);
      if (!result.ok) {
        setErrors(result.fields ?? {});
        setState({ kind: "error", message: result.error });
        requestAnimationFrame(() =>
          form.current
            ?.querySelector<HTMLElement>('[aria-invalid="true"]')
            ?.focus(),
        );
        return;
      }
      setErrors({});
      setSaved(snapshot);
      setState({ kind: "saved" });
      if (!projectId) router.replace(`/admin/projects/${result.id}`);
      else router.refresh();
    } catch {
      setState({
        kind: "error",
        message: "Le serveur ne répond pas. Vos modifications sont intactes.",
      });
    }
  }, [projectId, router, state.kind, values]);

  // ⌘S / Ctrl+S saves; leaving with unsaved changes asks first.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  async function remove() {
    if (!projectId) return;
    const result = await deleteProjectAction(projectId);
    if (result.ok) {
      setSaved(values);
      router.replace("/admin");
    }
  }

  // Uploads resolve later: apply them to the latest values, not a snapshot.
  const editMedia = useCallback(
    (edit: (media: Values["media"]) => Values["media"]) => {
      setValues((current) => ({ ...current, media: edit(current.media) }));
      setState((current) =>
        current.kind === "saved" ? { kind: "idle" } : current,
      );
    },
    [],
  );
  const appendMedia = useCallback(
    (url: string) =>
      editMedia((media) =>
        media.length >= MAX_MEDIA
          ? media
          : [...media, { url, alt: "", caption: "" }],
      ),
    [editMedia],
  );
  const setMediaUrl = useCallback(
    (index: number, url: string) =>
      editMedia((media) =>
        media.map((item, at) => (at === index ? { ...item, url } : item)),
      ),
    [editMedia],
  );

  const error = (path: string) => errors[path];

  return (
    <form
      ref={form}
      className="adm-editor"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      noValidate
    >
      <div className="adm-editor-main">
        {state.kind === "error" && (
          <p className="adm-banner" role="alert">
            <CircleAlert aria-hidden="true" />
            {state.message}
          </p>
        )}

        <Section index="01" title="Identité">
          <div className="adm-fields">
            <Field
              label="Titre"
              error={error("title")}
              count={values.title.length}
              max={120}
            >
              {(props) => (
                <input
                  {...props}
                  className="adm-input"
                  value={values.title}
                  onChange={(event) => set("title", event.target.value)}
                  placeholder="Blame"
                />
              )}
            </Field>
            <Field
              label="Slug"
              error={error("slug")}
              hint="Identifiant unique, en minuscules."
            >
              {(props) => (
                <div className="adm-prefixed">
                  <span>/</span>
                  <input
                    {...props}
                    className="adm-input is-mono"
                    value={values.slug}
                    onChange={(event) => {
                      setSlugTouched(true);
                      set("slug", event.target.value.toLowerCase());
                    }}
                    placeholder="blame"
                    spellCheck={false}
                    autoCapitalize="off"
                  />
                </div>
              )}
            </Field>
            <Field label="Cadre" error={error("kind")}>
              {(props) => (
                <select
                  {...props}
                  className="adm-select"
                  value={values.kind}
                  onChange={(event) =>
                    set("kind", event.target.value as Values["kind"])
                  }
                >
                  {projectKinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {kindLabels[kind]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field
              label="Catégorie"
              error={error("category")}
              hint="Ex. « Application desktop »."
            >
              {(props) => (
                <input
                  {...props}
                  className="adm-input"
                  value={values.category}
                  onChange={(event) => set("category", event.target.value)}
                  maxLength={80}
                />
              )}
            </Field>
            <Field label="Rôle" error={error("role")}>
              {(props) => (
                <input
                  {...props}
                  className="adm-input"
                  value={values.role}
                  onChange={(event) => set("role", event.target.value)}
                  placeholder="Développeur full stack"
                  maxLength={120}
                />
              )}
            </Field>
            <Field label="Client" error={error("client")} hint="Facultatif.">
              {(props) => (
                <input
                  {...props}
                  className="adm-input"
                  value={values.client ?? ""}
                  onChange={(event) => set("client", event.target.value)}
                  maxLength={120}
                />
              )}
            </Field>
          </div>
        </Section>

        <Section index="02" title="Récit">
          <div className="adm-fields">
            <Field
              label="Résumé"
              wide
              error={error("summary")}
              count={values.summary.length}
              max={320}
              hint="Une phrase, affichée sous le titre."
            >
              {(props) => (
                <textarea
                  {...props}
                  className="adm-textarea"
                  rows={2}
                  value={values.summary}
                  onChange={(event) => set("summary", event.target.value)}
                />
              )}
            </Field>
            <Field
              label="Description"
              wide
              error={error("description")}
              count={values.description.length}
              max={20_000}
            >
              {(props) => (
                <textarea
                  {...props}
                  className="adm-textarea is-tall"
                  value={values.description}
                  onChange={(event) => set("description", event.target.value)}
                />
              )}
            </Field>
            <Field
              label="Avertissement"
              wide
              error={error("notice")}
              count={(values.notice ?? "").length}
              max={400}
              hint="Facultatif. À lire en premier, ex. « Plateforme fermée en 2024 »."
            >
              {(props) => (
                <textarea
                  {...props}
                  className="adm-textarea"
                  rows={2}
                  value={values.notice ?? ""}
                  onChange={(event) => set("notice", event.target.value)}
                />
              )}
            </Field>
          </div>
        </Section>

        <Section index="03" title="Période">
          <div className="adm-fields">
            <Field
              label="Début"
              error={error("startedOn")}
              hint="Mois et année."
            >
              {(props) => (
                <input
                  {...props}
                  type="month"
                  className="adm-input"
                  value={values.startedOn}
                  onChange={(event) => set("startedOn", event.target.value)}
                  placeholder="2025-01"
                />
              )}
            </Field>
            <Field label="Fin" error={error("endedOn")}>
              {(props) => (
                <div className="adm-stack">
                  <input
                    {...props}
                    type="month"
                    className="adm-input"
                    value={values.endedOn ?? ""}
                    onChange={(event) => set("endedOn", event.target.value)}
                    disabled={ongoing(values)}
                    placeholder="2025-12"
                  />
                  <label className="adm-check">
                    <input
                      type="checkbox"
                      checked={ongoing(values)}
                      onChange={(event) =>
                        set(
                          "endedOn",
                          event.target.checked ? "" : values.startedOn,
                        )
                      }
                    />
                    Projet en cours
                  </label>
                </div>
              )}
            </Field>
          </div>
        </Section>

        <Section
          index="04"
          title="Points clés"
          description="Une phrase courte chacun. Jusqu’à 12."
        >
          <StringList
            items={values.highlights}
            onChange={(items) => set("highlights", items)}
            errors={errors}
            path="highlights"
            max={12}
            placeholder="Ce que le projet fait de remarquable…"
            addLabel="Ajouter un point"
          />
        </Section>

        <Section
          index="05"
          title="Technologies"
          description="Entrée ou virgule pour ajouter."
        >
          <TagInput
            tags={values.technologies}
            onChange={(tags) => set("technologies", tags)}
            error={error("technologies")}
          />
        </Section>

        <Section index="06" title="Visuels">
          <div className="adm-fields">
            <Field
              label="Image de couverture"
              wide
              error={error("imageUrl")}
              hint="Importée, ou un chemin dans /public (ex. /projects/blame/cover.webp) ou une URL https. Paysage, environ 16:9."
            >
              {(props) => (
                <ImageDrop
                  url={values.imageUrl}
                  slug={values.slug}
                  purpose="cover"
                  onUploaded={(url) => set("imageUrl", url)}
                >
                  <input
                    {...props}
                    className="adm-input is-mono"
                    value={values.imageUrl ?? ""}
                    onChange={(event) => set("imageUrl", event.target.value)}
                    placeholder="/projects/…"
                    spellCheck={false}
                  />
                </ImageDrop>
              )}
            </Field>
            <Field
              label="Texte alternatif de la couverture"
              wide
              error={error("imageAlt")}
              count={(values.imageAlt ?? "").length}
              max={240}
            >
              {(props) => (
                <input
                  {...props}
                  className="adm-input"
                  value={values.imageAlt ?? ""}
                  onChange={(event) => set("imageAlt", event.target.value)}
                />
              )}
            </Field>
          </div>
          <GalleryDrop
            slug={values.slug}
            room={MAX_MEDIA - values.media.length}
            onUploaded={appendMedia}
          >
            <p className="adm-label">
              Galerie
              <small>
                {values.media.length}/{MAX_MEDIA}
              </small>
            </p>
            <ObjectList
              items={values.media}
              onChange={(items) => set("media", items)}
              max={MAX_MEDIA}
              blank={{ url: "", alt: "", caption: "" }}
              addLabel="Ajouter une capture"
              render={(item, index, update) => (
                <ImageDrop
                  url={item.url}
                  slug={values.slug}
                  purpose="media"
                  compact
                  onUploaded={(url) => setMediaUrl(index, url)}
                >
                  <InlineInput
                    label="URL"
                    value={item.url}
                    onChange={(url) => update({ ...item, url })}
                    error={error(`media.${index}.url`)}
                    mono
                    placeholder="/projects/…"
                  />
                  <InlineInput
                    label="Texte alternatif"
                    value={item.alt}
                    onChange={(alt) => update({ ...item, alt })}
                    error={error(`media.${index}.alt`)}
                  />
                  <InlineInput
                    label="Légende (facultative)"
                    value={item.caption ?? ""}
                    onChange={(caption) => update({ ...item, caption })}
                    error={error(`media.${index}.caption`)}
                  />
                </ImageDrop>
              )}
            />
          </GalleryDrop>
        </Section>

        <Section index="07" title="Liens">
          <ObjectList
            items={values.links}
            onChange={(items) => set("links", items)}
            max={10}
            blank={{ kind: "WEBSITE" as const, label: "", url: "" }}
            addLabel="Ajouter un lien"
            render={(item, index, update) => (
              <div className="adm-repeat-fields is-row">
                <InlineSelect
                  label="Type"
                  value={item.kind}
                  onChange={(kind) =>
                    update({ ...item, kind: kind as typeof item.kind })
                  }
                  options={projectLinkKinds.map((kind) => [
                    kind,
                    linkKindLabels[kind],
                  ])}
                />
                <InlineInput
                  label="Libellé"
                  value={item.label}
                  onChange={(label) => update({ ...item, label })}
                  error={error(`links.${index}.label`)}
                  placeholder="Voir le site"
                />
                <InlineInput
                  label="URL"
                  value={item.url}
                  onChange={(url) => update({ ...item, url })}
                  error={error(`links.${index}.url`)}
                  mono
                  placeholder="https://…"
                />
              </div>
            )}
          />
        </Section>

        <Section
          index="08"
          title="Chiffres"
          description="Jusqu’à 8, ex. « 10 000 » joueurs."
        >
          <ObjectList
            items={values.metrics}
            onChange={(items) => set("metrics", items)}
            max={8}
            blank={{ value: "", label: "" }}
            addLabel="Ajouter un chiffre"
            render={(item, index, update) => (
              <div className="adm-repeat-fields is-metric">
                <InlineInput
                  label="Valeur"
                  value={item.value}
                  onChange={(value) => update({ ...item, value })}
                  error={error(`metrics.${index}.value`)}
                  placeholder="1 300+"
                />
                <InlineInput
                  label="Libellé"
                  value={item.label}
                  onChange={(label) => update({ ...item, label })}
                  error={error(`metrics.${index}.label`)}
                  placeholder="commits"
                />
              </div>
            )}
          />
        </Section>

        {projectId && (
          <div className="adm-card adm-danger-zone">
            <div className="adm-card-body">
              <div>
                <h2>Supprimer le projet</h2>
                <p className="adm-hint">
                  Définitif : liens, galerie et chiffres partent avec lui. Pour
                  le retirer du site sans le perdre, archivez-le.
                </p>
              </div>
              <ConfirmButton
                title={`Supprimer « ${saved.title} » ?`}
                description="Cette action est définitive et ne peut pas être annulée."
                confirmLabel="Supprimer"
                onConfirm={remove}
              >
                <Trash2 aria-hidden="true" />
                Supprimer le projet
              </ConfirmButton>
            </div>
          </div>
        )}
      </div>

      <aside className="adm-editor-aside">
        <div className="adm-card">
          <div className="adm-card-body adm-save">
            <span className="adm-kicker">Publication</span>
            <div
              className="adm-segmented"
              role="radiogroup"
              aria-label="Statut"
            >
              {projectStatuses.map((status) => (
                <label key={status}>
                  <input
                    type="radio"
                    name="status"
                    value={status}
                    checked={values.status === status}
                    onChange={() => set("status", status)}
                  />
                  {statusLabels[status]}
                </label>
              ))}
            </div>
            <label className="adm-switch">
              <span>Mis en avant</span>
              <input
                type="checkbox"
                role="switch"
                checked={values.featured}
                onChange={(event) => set("featured", event.target.checked)}
              />
            </label>
            <div className="adm-field">
              <span className="adm-label">Couleur d’accent</span>
              <div className="adm-color">
                <input
                  type="color"
                  value={
                    /^#[0-9a-f]{6}$/i.test(values.accentColor ?? "")
                      ? values.accentColor
                      : "#f15a24"
                  }
                  onChange={(event) => set("accentColor", event.target.value)}
                  aria-label="Choisir la couleur d’accent"
                />
                <input
                  className="adm-input is-mono"
                  value={values.accentColor}
                  onChange={(event) => set("accentColor", event.target.value)}
                  aria-label="Couleur d’accent (hexadécimal)"
                  aria-invalid={Boolean(error("accentColor"))}
                  maxLength={7}
                />
              </div>
              {error("accentColor") && (
                <FieldError message={error("accentColor")!} />
              )}
            </div>
            <button
              type="submit"
              className="adm-button adm-button-primary adm-button-lg adm-button-block"
              disabled={
                state.kind === "saving" || (!dirty && projectId !== null)
              }
            >
              {state.kind === "saving" ? (
                <LoaderCircle className="adm-spin" aria-hidden="true" />
              ) : (
                <Save aria-hidden="true" />
              )}
              {projectId ? "Enregistrer" : "Créer le projet"}
            </button>
            <p
              className={`adm-save-state${dirty ? " is-dirty" : state.kind === "saved" ? " is-saved" : ""}`}
              aria-live="polite"
            >
              {state.kind === "saving" ? (
                "Enregistrement…"
              ) : dirty ? (
                <>
                  Modifications non enregistrées ·{" "}
                  <span className="adm-kbd">⌘S</span>
                </>
              ) : state.kind === "saved" ? (
                <>
                  <Check aria-hidden="true" /> Enregistré
                </>
              ) : (
                "À jour"
              )}
            </p>
          </div>
        </div>

        <Preview values={values} />
      </aside>
    </form>
  );
}

const ongoing = (values: Values) => !values.endedOn;
const MAX_MEDIA = 20;

// ─── Building blocks ─────────────────────────────────────────────────────────

function Section({
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

function Field({
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

function FieldError({ id, message }: { id?: string; message: string }) {
  return (
    <span id={id} className="adm-error">
      <CircleAlert size={12} aria-hidden="true" />
      {message}
    </span>
  );
}

function InlineInput({
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

function InlineSelect({
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

function ObjectList<T>({
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

function StringList({
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

function TagInput({
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

// ─── Image upload ────────────────────────────────────────────────────────────

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading"; count: number }
  | { kind: "error"; message: string };

/** Checks one file, sends it, and returns its URL (or null, with the reason). */
function useImageUpload(slug: string, purpose: "cover" | "media") {
  const [state, setState] = useState<UploadState>({ kind: "idle" });

  const upload = useCallback(
    async (files: File[], onUploaded: (url: string) => void) => {
      if (!SLUG_PATTERN.test(slug)) {
        setState({
          kind: "error",
          message: "Renseignez un slug valide avant d’importer.",
        });
        return;
      }
      for (const [index, file] of files.entries()) {
        // The server sniffs the real type; some systems send none at all.
        const problem =
          file.type && !UPLOAD_TYPES.includes(file.type)
            ? "Formats acceptés : PNG, JPEG, WebP."
            : file.size > MAX_UPLOAD_BYTES
              ? "8 Mo au maximum par image."
              : null;
        if (problem) {
          setState({ kind: "error", message: `${file.name} : ${problem}` });
          return;
        }
        setState({ kind: "uploading", count: files.length - index });
        const data = new FormData();
        data.set("slug", slug);
        data.set("purpose", purpose);
        data.set("file", file);
        try {
          const result = await uploadProjectImageAction(data);
          if (!result.ok) {
            setState({ kind: "error", message: result.error });
            return;
          }
          onUploaded(result.url);
        } catch {
          setState({
            kind: "error",
            message: "Le serveur ne répond pas. Réessayez.",
          });
          return;
        }
      }
      setState({ kind: "idle" });
    },
    [purpose, slug],
  );

  return { state, upload };
}

/** Drag-and-drop target: highlights while image files hover over it. */
function useFileDrop(onFiles: (files: File[]) => void, enabled: boolean) {
  const [over, setOver] = useState(false);
  const accepts = (event: React.DragEvent) =>
    enabled && event.dataTransfer.types.includes("Files");
  return {
    over,
    handlers: {
      onDragOver: (event: React.DragEvent) => {
        if (!accepts(event)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
        setOver(true);
      },
      onDragLeave: (event: React.DragEvent) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOver(false);
        }
      },
      onDrop: (event: React.DragEvent) => {
        if (!accepts(event)) return;
        event.preventDefault();
        event.stopPropagation();
        setOver(false);
        onFiles(Array.from(event.dataTransfer.files));
      },
    },
  };
}

function ImageDrop({
  url,
  slug,
  purpose,
  compact,
  onUploaded,
  children,
}: {
  url: string | null | undefined;
  slug: string;
  purpose: "cover" | "media";
  compact?: boolean;
  onUploaded: (url: string) => void;
  children: ReactNode;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const { state, upload } = useImageUpload(slug, purpose);
  const busy = state.kind === "uploading";
  const take = (files: File[]) => {
    if (files.length && !busy) void upload(files.slice(0, 1), onUploaded);
  };
  const { over, handlers } = useFileDrop(take, !busy);

  return (
    <div
      className={`adm-upload${compact ? " is-compact" : ""}${over ? " is-over" : ""}`}
      {...handlers}
    >
      <div className="adm-upload-side">
        <div className="adm-media-thumb adm-upload-thumb">
          {url ? (
            <Thumbnail url={url} />
          ) : (
            <ImagePlus className="adm-upload-empty" aria-hidden="true" />
          )}
          {busy && (
            <span className="adm-upload-busy">
              <LoaderCircle className="adm-spin" aria-hidden="true" />
            </span>
          )}
        </div>
        <button
          type="button"
          className="adm-button adm-button-sm"
          onClick={() => picker.current?.click()}
          disabled={busy}
        >
          <Upload aria-hidden="true" />
          {busy ? "Import…" : "Importer"}
        </button>
        <input
          ref={picker}
          type="file"
          accept={UPLOAD_TYPES.join(",")}
          hidden
          tabIndex={-1}
          onChange={(event) => {
            take(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      </div>
      <div className="adm-upload-fields">
        {children}
        {!compact && (
          <span className="adm-hint">
            Glissez une image ici · PNG, JPEG ou WebP, 8 Mo max · convertie en
            WebP, métadonnées retirées.
          </span>
        )}
        <UploadStatus state={state} />
      </div>
    </div>
  );
}

/** Wraps the gallery: dropped or picked files become new screenshots. */
function GalleryDrop({
  slug,
  room,
  onUploaded,
  children,
}: {
  slug: string;
  room: number;
  onUploaded: (url: string) => void;
  children: ReactNode;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const { state, upload } = useImageUpload(slug, "media");
  const busy = state.kind === "uploading";
  const take = (files: File[]) => {
    if (files.length && !busy && room > 0) {
      void upload(files.slice(0, room), onUploaded);
    }
  };
  const { over, handlers } = useFileDrop(take, !busy && room > 0);

  return (
    <div className={`adm-gallery${over ? " is-over" : ""}`} {...handlers}>
      {children}
      {room > 0 && (
        <div className="adm-gallery-import">
          <button
            type="button"
            className="adm-button"
            onClick={() => picker.current?.click()}
            disabled={busy}
          >
            {busy ? (
              <LoaderCircle className="adm-spin" aria-hidden="true" />
            ) : (
              <Upload aria-hidden="true" />
            )}
            Importer des captures
          </button>
          <span className="adm-hint">ou glissez-les sur la galerie.</span>
          <input
            ref={picker}
            type="file"
            accept={UPLOAD_TYPES.join(",")}
            multiple
            hidden
            tabIndex={-1}
            onChange={(event) => {
              take(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
        </div>
      )}
      <UploadStatus state={state} />
    </div>
  );
}

function UploadStatus({ state }: { state: UploadState }) {
  return (
    <span aria-live="polite" className="adm-upload-status">
      {state.kind === "error" ? (
        <FieldError message={state.message} />
      ) : state.kind === "uploading" ? (
        <span className="adm-hint">
          {state.count > 1
            ? `Import en cours… (${state.count} restantes)`
            : "Import en cours…"}
        </span>
      ) : null}
    </span>
  );
}

function Thumbnail({ url }: { url: string | null | undefined }) {
  const src = publicUrl(url ?? null, true);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" loading="lazy" /> : null;
}

function Preview({ values }: { values: Values }) {
  const accent = /^#[0-9a-f]{6}$/i.test(values.accentColor ?? "")
    ? values.accentColor
    : "#f15a24";
  const startYear =
    Number(values.startedOn.slice(0, 4)) || new Date().getFullYear();
  const endYear = values.endedOn ? Number(values.endedOn.slice(0, 4)) : null;
  return (
    <section
      className="adm-card adm-preview"
      style={{ "--adm-preview-accent": accent } as React.CSSProperties}
      aria-label="Aperçu"
    >
      <div className="adm-preview-cover">
        <Thumbnail url={values.imageUrl} />
      </div>
      <div className="adm-preview-body">
        <span className="adm-kicker">
          {kindLabels[values.kind]} · {projectPeriod({ startYear, endYear })}
        </span>
        <h3>{values.title || "Sans titre"}</h3>
        <p>{values.summary || "Le résumé du projet apparaîtra ici."}</p>
        {values.technologies.length > 0 && (
          <div className="adm-chips">
            {values.technologies.slice(0, 8).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
