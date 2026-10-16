"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { journeyPeriod } from "@/lib/journey";
import { journeyKindLabels } from "@/lib/admin/journey-form";
import type { JourneyRow } from "@/lib/admin/journey";
import {
  projectStatuses,
  statusLabels,
  type ProjectStatusValue,
} from "@/lib/admin/project-form";
import { setJourneyStatusAction } from "../_actions/journey";

export function JourneyList({ entries }: { entries: JourneyRow[] }) {
  return (
    <ol className="adm-project-list">
      {entries.map((entry) => (
        <JourneyItem key={entry.id} entry={entry} />
      ))}
    </ol>
  );
}

function JourneyItem({ entry }: { entry: JourneyRow }) {
  const [pending, startTransition] = useTransition();
  const href = `/admin/journey/${entry.id}`;
  const label = `${entry.title} · ${entry.organization}`;

  const setStatus = (status: ProjectStatusValue) =>
    startTransition(async () => {
      await setJourneyStatusAction(entry.id, status);
    });

  return (
    <li
      className={`adm-project adm-journey${pending ? " is-pending" : ""}`}
      aria-busy={pending}
    >
      <span className="adm-journey-year" aria-hidden="true">
        {entry.startedOn.slice(0, 4)}
      </span>

      <div className="adm-project-main">
        <div className="adm-project-title">
          <Link href={href}>{entry.title}</Link>
        </div>
        <div className="adm-project-meta">
          <span>{journeyKindLabels[entry.kind]}</span>
          <span>{entry.organization}</span>
          <span>{journeyPeriod(entry)}</span>
        </div>
        <p className="adm-project-summary">{entry.summary}</p>
      </div>

      <div className="adm-project-status">
        <select
          className={`adm-status-select is-${entry.status}`}
          value={entry.status}
          onChange={(event) =>
            setStatus(event.target.value as ProjectStatusValue)
          }
          disabled={pending}
          aria-label={`Statut de ${label}`}
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
          aria-label={`Modifier ${label}`}
        >
          <Pencil aria-hidden="true" />
        </Link>
      </div>
    </li>
  );
}
