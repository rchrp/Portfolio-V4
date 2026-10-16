"use client";

import { Check, CircleAlert, LoaderCircle, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { journeyPeriod } from "@/lib/journey";
import {
  journeyKindLabels,
  journeyKinds,
  type JourneyFormValues,
} from "@/lib/admin/journey-form";
import {
  slugify,
  statusLabels,
  projectStatuses,
  type FieldErrors,
  type ProjectStatusValue,
} from "@/lib/admin/project-form";
import { deleteJourneyAction, saveJourneyAction } from "../_actions/journey";
import { ConfirmButton } from "./confirm-dialog";
import { Field, Section, StringList, TagInput } from "./form-fields";

type Values = JourneyFormValues;
type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

export type ProjectChoice = {
  slug: string;
  title: string;
  status: ProjectStatusValue;
};

export function JourneyEditor({
  entryId,
  initial,
  projects,
}: {
  entryId: string | null;
  initial: Values;
  projects: ProjectChoice[];
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const [slugTouched, setSlugTouched] = useState(entryId !== null);
  const form = useRef<HTMLFormElement>(null);

  const dirty = JSON.stringify(values) !== JSON.stringify(saved);

  const set = useCallback(
    <K extends keyof Values>(key: K, value: Values[K]) => {
      setValues((current) => {
        const next = { ...current, [key]: value };
        if ((key === "organization" || key === "title") && !slugTouched) {
          next.slug = slugify(
            `${next.organization} ${next.startedOn.slice(0, 4)}`,
          );
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
      const result = await saveJourneyAction(entryId, snapshot);
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
      if (!entryId) router.replace(`/admin/journey/${result.id}`);
      else router.refresh();
    } catch {
      setState({
        kind: "error",
        message: "Le serveur ne répond pas. Vos modifications sont intactes.",
      });
    }
  }, [entryId, router, state.kind, values]);

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
    if (!entryId) return;
    const result = await deleteJourneyAction(entryId);
    if (result.ok) {
      setSaved(values);
      router.replace("/admin/journey");
    }
  }

  const error = (path: string) => errors[path];
  const ongoing = !values.endedOn;
  const toggleProject = (slug: string, linked: boolean) =>
    set(
      "projectSlugs",
      linked
        ? [...values.projectSlugs, slug]
        : values.projectSlugs.filter((current) => current !== slug),
    );

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
              hint="Ce qui a été fait, ex. « Développeur fullstack »."
            >
              {(props) => (
                <input
                  {...props}
                  className="adm-input"
                  value={values.title}
                  onChange={(event) => set("title", event.target.value)}
                />
              )}
            </Field>
            <Field
              label="Organisation"
              error={error("organization")}
              hint="Entreprise, école ou cadre, ex. « Visiativ »."
            >
              {(props) => (
                <input
                  {...props}
                  className="adm-input"
                  value={values.organization}
                  onChange={(event) => set("organization", event.target.value)}
                  maxLength={120}
                />
              )}
            </Field>
            <Field label="Type" error={error("kind")}>
              {(props) => (
                <select
                  {...props}
                  className="adm-select"
                  value={values.kind}
                  onChange={(event) =>
                    set("kind", event.target.value as Values["kind"])
                  }
                >
                  {journeyKinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {journeyKindLabels[kind]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Lieu" error={error("location")} hint="Facultatif.">
              {(props) => (
                <input
                  {...props}
                  className="adm-input"
                  value={values.location ?? ""}
                  onChange={(event) => set("location", event.target.value)}
                  placeholder="Lyon, France"
                  maxLength={120}
                />
              )}
            </Field>
            <Field
              label="Slug"
              error={error("slug")}
              hint="Ancre de l’étape : /parcours#slug."
            >
              {(props) => (
                <div className="adm-prefixed">
                  <span>#</span>
                  <input
                    {...props}
                    className="adm-input is-mono"
                    value={values.slug}
                    onChange={(event) => {
                      setSlugTouched(true);
                      set("slug", event.target.value.toLowerCase());
                    }}
                    spellCheck={false}
                    autoCapitalize="off"
                  />
                </div>
              )}
            </Field>
            <Field
              label="Site web"
              error={error("websiteUrl")}
              hint="Facultatif. Celui de l’organisation."
            >
              {(props) => (
                <input
                  {...props}
                  className="adm-input is-mono"
                  value={values.websiteUrl ?? ""}
                  onChange={(event) => set("websiteUrl", event.target.value)}
                  placeholder="https://…"
                  spellCheck={false}
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
              hint="Facultative. Le contexte, ce qui a été appris."
            >
              {(props) => (
                <textarea
                  {...props}
                  className="adm-textarea is-tall"
                  value={values.description ?? ""}
                  onChange={(event) => set("description", event.target.value)}
                />
              )}
            </Field>
          </div>
        </Section>

        <Section index="03" title="Période">
          <div className="adm-fields">
            <Field label="Début" error={error("startedOn")}>
              {(props) => (
                <input
                  {...props}
                  type="month"
                  className="adm-input"
                  value={values.startedOn}
                  onChange={(event) => set("startedOn", event.target.value)}
                  placeholder="2024-07"
                />
              )}
            </Field>
            <Field
              label="Fin"
              error={error("endedOn")}
              hint="Peut être à venir, ex. la fin prévue d’un diplôme."
            >
              {(props) => (
                <div className="adm-stack">
                  <input
                    {...props}
                    type="month"
                    className="adm-input"
                    value={values.endedOn ?? ""}
                    onChange={(event) => set("endedOn", event.target.value)}
                    disabled={ongoing}
                    placeholder="2024-12"
                  />
                  <label className="adm-check">
                    <input
                      type="checkbox"
                      checked={ongoing}
                      onChange={(event) =>
                        set(
                          "endedOn",
                          event.target.checked ? "" : values.startedOn,
                        )
                      }
                    />
                    Sans date de fin
                  </label>
                </div>
              )}
            </Field>
            <label className="adm-switch adm-field is-wide">
              <span>
                Afficher les mois
                <small className="adm-hint">
                  {" "}
                  · Sinon, les années seules, ex. « 2020 – 2023 ».
                </small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={values.showMonths}
                onChange={(event) => set("showMonths", event.target.checked)}
              />
            </label>
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
            placeholder="Ce qui compte dans cette étape…"
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

        <Section
          index="06"
          title="Projets liés"
          description="Réalisés pendant cette étape. Seuls les projets publiés apparaissent sur le site."
        >
          {projects.length ? (
            <div className="adm-choices">
              {projects.map((project) => (
                <label key={project.slug} className="adm-check">
                  <input
                    type="checkbox"
                    checked={values.projectSlugs.includes(project.slug)}
                    onChange={(event) =>
                      toggleProject(project.slug, event.target.checked)
                    }
                  />
                  {project.title}
                  {project.status !== "PUBLISHED" && (
                    <small className="adm-hint">
                      {statusLabels[project.status]}
                    </small>
                  )}
                </label>
              ))}
            </div>
          ) : (
            <p className="adm-hint">Aucun projet pour l’instant.</p>
          )}
        </Section>

        {entryId && (
          <div className="adm-card adm-danger-zone">
            <div className="adm-card-body">
              <div>
                <h2>Supprimer l’étape</h2>
                <p className="adm-hint">
                  Définitif. Pour la retirer du site sans la perdre,
                  archivez-la.
                </p>
              </div>
              <ConfirmButton
                title={`Supprimer « ${saved.title} » ?`}
                description="Cette action est définitive et ne peut pas être annulée."
                confirmLabel="Supprimer"
                onConfirm={remove}
              >
                <Trash2 aria-hidden="true" />
                Supprimer l’étape
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
            <button
              type="submit"
              className="adm-button adm-button-primary adm-button-lg adm-button-block"
              disabled={state.kind === "saving" || (!dirty && entryId !== null)}
            >
              {state.kind === "saving" ? (
                <LoaderCircle className="adm-spin" aria-hidden="true" />
              ) : (
                <Save aria-hidden="true" />
              )}
              {entryId ? "Enregistrer" : "Créer l’étape"}
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

        <section className="adm-card adm-preview" aria-label="Aperçu">
          <div className="adm-preview-body">
            <span className="adm-kicker">
              {journeyKindLabels[values.kind]} ·{" "}
              {/^\d{4}-\d{2}$/.test(values.startedOn)
                ? journeyPeriod({
                    startedOn: values.startedOn,
                    endedOn: values.endedOn || null,
                    showMonths: values.showMonths,
                  })
                : "—"}
            </span>
            <h3>{values.title || "Sans titre"}</h3>
            <p>
              <strong>{values.organization || "Organisation"}</strong>
              {values.location ? ` · ${values.location}` : ""}
            </p>
            <p>{values.summary || "Le résumé de l’étape apparaîtra ici."}</p>
            {values.technologies.length > 0 && (
              <div className="adm-chips">
                {values.technologies.slice(0, 8).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            )}
          </div>
        </section>
      </aside>
    </form>
  );
}
