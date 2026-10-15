"use client";

import { ChevronDown, ChevronUp, Pencil, Star } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { projectPeriod } from "@/lib/projects";
import {
  kindLabels,
  projectStatuses,
  statusLabels,
  type ProjectStatusValue,
} from "@/lib/admin/project-form";
import type { ProjectRow } from "@/lib/admin/projects";
import {
  moveProjectAction,
  setProjectStatusAction,
} from "../_actions/projects";

export function ProjectList({
  projects,
  reorderable,
}: {
  projects: ProjectRow[];
  reorderable: boolean;
}) {
  return (
    <ol className="adm-project-list">
      {projects.map((project, index) => (
        <ProjectItem
          key={project.id}
          project={project}
          first={index === 0}
          last={index === projects.length - 1}
          reorderable={reorderable}
        />
      ))}
    </ol>
  );
}

function ProjectItem({
  project,
  first,
  last,
  reorderable,
}: {
  project: ProjectRow;
  first: boolean;
  last: boolean;
  reorderable: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const href = `/admin/projects/${project.id}`;

  const move = (direction: -1 | 1) =>
    startTransition(async () => {
      await moveProjectAction(project.id, direction);
    });
  const setStatus = (status: ProjectStatusValue) =>
    startTransition(async () => {
      await setProjectStatusAction(project.id, status);
    });

  return (
    <li
      className={`adm-project${pending ? " is-pending" : ""}`}
      aria-busy={pending}
    >
      <div className="adm-order">
        {reorderable && (
          <>
            <button
              type="button"
              className="adm-icon-button"
              onClick={() => move(-1)}
              disabled={first || pending}
              aria-label={`Monter ${project.title}`}
            >
              <ChevronUp aria-hidden="true" />
            </button>
            <button
              type="button"
              className="adm-icon-button"
              onClick={() => move(1)}
              disabled={last || pending}
              aria-label={`Descendre ${project.title}`}
            >
              <ChevronDown aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      <div
        className="adm-thumb"
        style={
          { "--adm-thumb-accent": project.accentColor } as React.CSSProperties
        }
      >
        {project.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={project.imageUrl} alt="" loading="lazy" decoding="async" />
        )}
      </div>

      <div className="adm-project-main">
        <div className="adm-project-title">
          <Link href={href}>{project.title}</Link>
          {project.featured && (
            <Star
              className="adm-star"
              size={14}
              fill="currentColor"
              aria-label="Mis en avant"
            />
          )}
        </div>
        <div className="adm-project-meta">
          <span>{kindLabels[project.kind]}</span>
          <span>{projectPeriod(project)}</span>
          <span className="adm-mono">/{project.slug}</span>
        </div>
        <p className="adm-project-summary">{project.summary}</p>
      </div>

      <div className="adm-project-status">
        <select
          className={`adm-status-select is-${project.status}`}
          value={project.status}
          onChange={(event) =>
            setStatus(event.target.value as ProjectStatusValue)
          }
          disabled={pending}
          aria-label={`Statut de ${project.title}`}
        >
          {projectStatuses.map((value) => (
            <option key={value} value={value}>
              {statusLabels[value]}
            </option>
          ))}
        </select>
      </div>

      <div className="adm-project-actions">
        <Link
          href={href}
          className="adm-icon-button"
          aria-label={`Modifier ${project.title}`}
        >
          <Pencil aria-hidden="true" />
        </Link>
      </div>
    </li>
  );
}
