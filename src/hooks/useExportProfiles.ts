"use client";

import { useCallback, useEffect, useState } from "react";
import {
  addProfile,
  deleteProfile,
  parseProfilesDoc,
  PROFILE_STORAGE_KEY,
  renameProfile,
  serializeProfiles,
  type ExportProfile,
  type ProfileChange,
  type ProfileSettings,
} from "@/lib/exportProfiles";

export interface ProfileStoreStatus {
  /** Why profiles can't be saved, or what happened to stored ones, if anything. */
  message: string | null;
  /** Stored profiles came from a newer Reframe: show them, never overwrite them. */
  readOnly: boolean;
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
    : Math.random().toString(36).slice(2, 14);

/**
 * The user's saved export profiles, kept in localStorage. Built-in profiles
 * are code (BUILT_IN_PROFILES) and are never stored. Managing profiles never
 * touches the edit or its undo history; applying one is done by the editor.
 */
export function useExportProfiles() {
  const [profiles, setProfiles] = useState<ExportProfile[]>([]);
  const [status, setStatus] = useState<ProfileStoreStatus>({ message: null, readOnly: false });

  useEffect(() => {
    let text: string | null = null;
    try {
      text = localStorage.getItem(PROFILE_STORAGE_KEY);
    } catch {
      // Genuinely needs an effect: localStorage is a browser-only API.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus({ message: "This browser isn't letting Reframe save profiles; they'll last until you close the tab.", readOnly: false });
      return;
    }
    const loaded = parseProfilesDoc(text);
    if (loaded.status === "ok") {
      setProfiles(loaded.profiles);
      if (loaded.dropped > 0) {
        setStatus({ message: `${loaded.dropped} saved profile${loaded.dropped === 1 ? "" : "s"} couldn't be read and ${loaded.dropped === 1 ? "was" : "were"} skipped.`, readOnly: false });
      }
    } else if (loaded.status === "newer") {
      setStatus({ message: "Your profiles were saved by a newer version of Reframe. Reload the page to use them.", readOnly: true });
    } else if (loaded.status === "unreadable") {
      setStatus({ message: "Saved profiles couldn't be read. Saving a new profile will replace them.", readOnly: false });
    }
  }, []);

  const commit = useCallback(
    (change: ProfileChange): ProfileChange => {
      if (!change.ok) return change;
      if (status.readOnly) return { ok: false, error: "Profiles were saved by a newer version of Reframe. Reload the page first." };
      setProfiles(change.profiles);
      try {
        localStorage.setItem(PROFILE_STORAGE_KEY, serializeProfiles(change.profiles));
        setStatus({ message: null, readOnly: false });
      } catch {
        setStatus({ message: "Couldn't save profiles in this browser; they'll last until you close the tab.", readOnly: false });
      }
      return change;
    },
    [status.readOnly]
  );

  const save = useCallback(
    (name: string, settings: ProfileSettings) => commit(addProfile(profiles, name, settings, newId())),
    [commit, profiles]
  );
  const rename = useCallback((id: string, name: string) => commit(renameProfile(profiles, id, name)), [commit, profiles]);
  const remove = useCallback((id: string) => commit(deleteProfile(profiles, id)), [commit, profiles]);

  return { profiles, status, save, rename, remove };
}
