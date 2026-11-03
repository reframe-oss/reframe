"use client";

import { useState } from "react";
import { Check, Pencil, Trash2 } from "lucide-react";
import {
  BUILT_IN_PROFILES,
  MAX_PROFILE_NAME,
  profileMatches,
  profileNotes,
  profileOutputSize,
  settingsFromRecipe,
  type ExportProfile,
  type ProfileChange,
  type ProfileSettings,
} from "@/lib/exportProfiles";
import type { EditRecipe } from "@/lib/types";
import type { ProfileStoreStatus } from "@/hooks/useExportProfiles";

interface Props {
  recipe: EditRecipe;
  userProfiles: ExportProfile[];
  status: ProfileStoreStatus;
  onApply: (settings: ProfileSettings) => void;
  onSave: (name: string, settings: ProfileSettings) => ProfileChange;
  onRename: (id: string, name: string) => ProfileChange;
  onDelete: (id: string) => ProfileChange;
}

const describe = (p: ExportProfile) => {
  const { width, height } = profileOutputSize(p.settings);
  return `${width} × ${height} · ${p.settings.format.toUpperCase()} · ${p.settings.framing === "fit" ? "Fit" : "Fill"}`;
};

/** Pick, save, rename and delete export profiles. Applying one is a single undo step. */
export default function ExportProfiles({ recipe, userProfiles, status, onApply, onSave, onRename, onDelete }: Props) {
  const [name, setName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const current = settingsFromRecipe(recipe);
  const notes = profileNotes(current);

  const report = (change: ProfileChange, ok: string) =>
    setMessage(change.ok ? { tone: "ok", text: ok } : { tone: "error", text: change.error });

  const row = (p: ExportProfile) => {
    const active = profileMatches(recipe, p.settings);
    if (renamingId === p.id) {
      return (
        <li key={p.id}>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const change = onRename(p.id, renameValue);
              report(change, "Profile renamed.");
              if (change.ok) setRenamingId(null);
            }}
          >
            <label className="sr-only" htmlFor={`rename-${p.id}`}>
              New name for {p.name}
            </label>
            <input
              id={`rename-${p.id}`}
              value={renameValue}
              maxLength={MAX_PROFILE_NAME}
              onChange={(e) => setRenameValue(e.target.value)}
              className="field min-w-0 flex-1 text-sm"
            />
            <button type="submit" className="btn btn-secondary btn-sm">
              Save
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenamingId(null)}>
              Cancel
            </button>
          </form>
        </li>
      );
    }
    return (
      <li key={p.id} className="flex items-stretch gap-1">
        <button
          type="button"
          aria-pressed={active}
          aria-label={`${p.name}, ${describe(p).replace(/ · /g, ", ")}`}
          onClick={() => {
            onApply(p.settings);
            setMessage({ tone: "ok", text: `Applied “${p.name}”. Undo restores the previous settings.` });
          }}
          className="btn btn-ghost btn-sm min-w-0 flex-1 justify-start text-left"
        >
          <span className="flex min-w-0 flex-1 flex-col items-start">
            <span className="truncate font-medium">{p.name}</span>
            <span className="tabular text-2xs text-[var(--muted)]">{describe(p)}</span>
          </span>
          {active && <Check size={14} aria-hidden="true" className="shrink-0 text-[var(--accent-text)]" />}
        </button>
        {!p.builtIn &&
          (confirmDeleteId === p.id ? (
            <span className="flex items-center gap-1">
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => {
                  report(onDelete(p.id), `Deleted “${p.name}”.`);
                  setConfirmDeleteId(null);
                }}
              >
                Delete
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDeleteId(null)}>
                Keep
              </button>
            </span>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                aria-label={`Rename ${p.name}`}
                onClick={() => {
                  setRenamingId(p.id);
                  setRenameValue(p.name);
                }}
              >
                <Pencil size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                aria-label={`Delete ${p.name}`}
                onClick={() => setConfirmDeleteId(p.id)}
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </>
          ))}
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <ul aria-label="Built-in profiles" className="space-y-1">
        {BUILT_IN_PROFILES.map(row)}
      </ul>

      {userProfiles.length > 0 && (
        <div>
          <p className="mb-1 px-1 text-2xs text-[var(--muted)]">Your profiles</p>
          <ul aria-label="Your profiles" className="space-y-1">
            {userProfiles.map(row)}
          </ul>
        </div>
      )}

      <form
        className="space-y-2 px-1"
        onSubmit={(e) => {
          e.preventDefault();
          const change = onSave(name, current);
          report(change, `Saved “${name.trim()}” with the current size, framing, format and quality.`);
          if (change.ok) setName("");
        }}
      >
        <label htmlFor="profile-name" className="block text-xs text-[var(--text-secondary)]">
          Save the current output settings as a profile
        </label>
        <div className="flex gap-2">
          <input
            id="profile-name"
            value={name}
            maxLength={MAX_PROFILE_NAME}
            placeholder="Profile name"
            onChange={(e) => setName(e.target.value)}
            disabled={status.readOnly}
            className="field min-w-0 flex-1 text-sm"
          />
          <button type="submit" className="btn btn-secondary btn-sm" disabled={status.readOnly || !name.trim()}>
            Save profile
          </button>
        </div>
        <p className="text-2xs text-[var(--muted)]">
          Profiles keep size, framing, format and quality only, never trims, edits or the video. They are saved in
          this browser.
        </p>
      </form>

      {notes.length > 0 && (
        <ul className="callout callout-info flex-col items-stretch gap-1 text-xs" aria-label="Notes about the current output">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      <div aria-live="polite" className="px-1 text-xs">
        {status.message && <p className="text-[var(--warning)]">{status.message}</p>}
        {message && <p className={message.tone === "error" ? "text-[var(--error)]" : "text-[var(--text-secondary)]"}>{message.text}</p>}
      </div>
    </div>
  );
}
