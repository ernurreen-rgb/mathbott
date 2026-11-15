"use client";

import { useCallback, useEffect, useState } from "react";

import {
  disableStreakReminder,
  enableStreakReminder,
  getReminderState,
  syncStreakReminder,
  type ReminderState,
} from "@/lib/push-reminders";

/**
 * State of the daily streak reminder on this device. `state` is null until it is known.
 * With `sync`, a reminder that is on is re-sent for the signed-in account (see syncStreakReminder).
 */
export function useStreakReminder(email: string, { sync = false }: { sync?: boolean } = {}) {
  const [state, setState] = useState<ReminderState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getReminderState()
      .then((next) => {
        if (cancelled) return;
        setState(next);
        if (sync && next === "on" && email) void syncStreakReminder(email);
      })
      .catch(() => {
        if (!cancelled) setState("unsupported");
      });
    return () => {
      cancelled = true;
    };
  }, [email, sync]);

  // Must run straight from a click: iOS only asks for permission inside a user gesture.
  const enable = useCallback(async () => {
    if (!email || busy) return false;
    setBusy(true);
    setError(null);
    const result = await enableStreakReminder(email);
    setBusy(false);
    if (result.ok) {
      setState("on");
      return true;
    }
    setError(result.error);
    if (result.state) setState(result.state);
    return false;
  }, [email, busy]);

  const disable = useCallback(async () => {
    if (!email || busy) return false;
    setBusy(true);
    setError(null);
    const result = await disableStreakReminder(email);
    setBusy(false);
    if (result.ok) {
      setState("off");
      return true;
    }
    setError(result.error);
    return false;
  }, [email, busy]);

  return { state, busy, error, enable, disable };
}
