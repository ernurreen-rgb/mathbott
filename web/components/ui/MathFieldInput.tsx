"use client";

import { useEffect, useRef } from "react";

type MathFieldElement = HTMLElement & {
  value: string;
  mode?: "math" | "text" | "latex";
  mathModeSpace?: string;
  getValue?: () => string;
  setValue?: (value: string, options?: { silenceNotifications?: boolean }) => void;
  insert?: (value: string, options?: { format?: "latex" | "ascii-math"; mode?: "math" | "text" | "latex" }) => boolean;
  executeCommand?: (selector: string | [string, ...unknown[]], ...args: unknown[]) => boolean;
  keybindings?: unknown[];
  focus: () => void;
};

interface MathFieldInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
  readOnly?: boolean;
  virtualKeyboardPolicy?: "auto" | "manual";
  openVirtualKeyboardOnFocus?: boolean;
}

type MathVirtualKeyboard = {
  show?: () => void;
  hide?: () => void;
};

type InternalMathfield = {
  ariaLiveText?: { textContent: string };
  host?: EventTarget | null;
  element?: Element | null;
  constructor: InternalMathfieldCtor;
};

type InternalMathfieldCtor = {
  _globallyFocusedMathfield?: InternalMathfield;
  __codexFocusDisposePatched?: boolean;
  prototype: {
    dispose?: (...args: unknown[]) => unknown;
    onFocus?: (options?: unknown) => unknown;
    onBlur?: (options?: unknown) => unknown;
  };
};

type MathfieldElementStaticConfig = {
  soundsDirectory?: string | null;
  keypressSound?: unknown;
  plonkSound?: string | null;
  keypressVibration?: boolean;
  __codexDisconnectedPatched?: boolean;
  prototype?: {
    disconnectedCallback?: (...args: unknown[]) => unknown;
  };
};

const getVirtualKeyboard = (): MathVirtualKeyboard | undefined =>
  (globalThis as { mathVirtualKeyboard?: MathVirtualKeyboard }).mathVirtualKeyboard;

const getInternalMathfield = (el: MathFieldElement | null): InternalMathfield | undefined =>
  (el as unknown as { _mathfield?: InternalMathfield } | null)?._mathfield;

const clearStaleGlobalMathfield = (el: MathFieldElement | null) => {
  const internal = getInternalMathfield(el);
  const ctor = internal?.constructor;
  if (!ctor) return;
  const previous = ctor._globallyFocusedMathfield;
  if (!previous || previous === internal) return;
  if (!previous.ariaLiveText || !previous.host || !previous.element) {
    ctor._globallyFocusedMathfield = undefined;
  }
};

const patchMathfieldElementDisconnectGuard = (mfe: MathfieldElementStaticConfig | undefined) => {
  if (!mfe || mfe.__codexDisconnectedPatched) return;
  const proto = mfe.prototype;
  if (!proto || typeof proto.disconnectedCallback !== "function") {
    mfe.__codexDisconnectedPatched = true;
    return;
  }
  const originalDisconnected = proto.disconnectedCallback;
  proto.disconnectedCallback = function patchedDisconnected(
    this: { _mathfield?: InternalMathfield },
    ...args: unknown[]
  ) {
    const internal = this?._mathfield;
    const ctor = internal?.constructor;
    if (ctor && ctor._globallyFocusedMathfield === internal) {
      ctor._globallyFocusedMathfield = undefined;
    }
    return originalDisconnected.apply(this, args);
  };
  mfe.__codexDisconnectedPatched = true;
};

const patchMathfieldFocusDisposeGuards = (el: MathFieldElement | null) => {
  const internal = getInternalMathfield(el);
  const ctor = internal?.constructor;
  if (!ctor || ctor.__codexFocusDisposePatched) return;

  const proto = ctor.prototype;
  const originalOnFocus = proto.onFocus;
  if (typeof originalOnFocus === "function") {
    proto.onFocus = function patchedOnFocus(this: InternalMathfield, options?: unknown) {
      const previous = ctor._globallyFocusedMathfield;
      if (previous && previous !== this && (!previous.ariaLiveText || !previous.host || !previous.element)) {
        ctor._globallyFocusedMathfield = undefined;
      }
      return originalOnFocus.call(this, options);
    };
  }

  const originalOnBlur = proto.onBlur;
  if (typeof originalOnBlur === "function") {
    proto.onBlur = function patchedOnBlur(this: InternalMathfield, options?: unknown) {
      // Guard against stale disposed instances left in MathLive global focus reference.
      if (!this.ariaLiveText) {
        if (ctor._globallyFocusedMathfield === this) {
          ctor._globallyFocusedMathfield = undefined;
        }
        return;
      }
      return originalOnBlur.call(this, options);
    };
  }

  const originalDispose = proto.dispose;
  if (typeof originalDispose === "function") {
    proto.dispose = function patchedDispose(this: InternalMathfield, ...args: unknown[]) {
      if (ctor._globallyFocusedMathfield === this) {
        ctor._globallyFocusedMathfield = undefined;
      }
      return originalDispose.apply(this, args);
    };
  }

  ctor.__codexFocusDisposePatched = true;
};

const getEventPath = (event: Event): EventTarget[] => {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  if (path.length > 0) return path;
  return event.target ? [event.target] : [];
};

const isMathFieldTarget = (target: EventTarget): boolean => {
  if (target instanceof Element) {
    if (target.matches("math-field") || target.closest("math-field")) return true;
  }
  if (target instanceof ShadowRoot) {
    const host = target.host;
    if (host instanceof Element && (host.matches("math-field") || host.closest("math-field"))) {
      return true;
    }
  }
  return false;
};

const isVirtualKeyboardTarget = (target: EventTarget): boolean => {
  if (target instanceof Element) {
    if (target.matches(".ML__keyboard") || target.closest(".ML__keyboard")) return true;
  }
  if (target instanceof ShadowRoot) {
    const host = target.host;
    if (host instanceof Element && (host.matches(".ML__keyboard") || host.closest(".ML__keyboard"))) {
      return true;
    }
  }
  return false;
};

const isEventInsideMathField = (event: Event): boolean => {
  for (const target of getEventPath(event)) {
    if (isMathFieldTarget(target)) return true;
  }
  return false;
};

const isEventInsideVirtualKeyboard = (event: Event): boolean => {
  for (const target of getEventPath(event)) {
    if (isVirtualKeyboardTarget(target)) return true;
  }
  return false;
};

const hasFocusedMathField = (): boolean => {
  const active = document.activeElement;
  if (!(active instanceof Element)) return false;
  return active.matches("math-field") || Boolean(active.closest("math-field"));
};

const hasFocusedVirtualKeyboard = (): boolean => {
  const active = document.activeElement;
  if (!(active instanceof Element)) return false;
  return active.matches(".ML__keyboard") || Boolean(active.closest(".ML__keyboard"));
};

const getMathValue = (el: MathFieldElement): string => {
  if (typeof el.getValue === "function") {
    return el.getValue();
  }
  return el.value || "";
};

const normalizeMathFieldOutput = (raw: string): string => raw.replace(/\\text\{\s*\}/g, " ");

const setMathValue = (el: MathFieldElement, nextValue: string) => {
  if (typeof el.setValue === "function") {
    el.setValue(nextValue, { silenceNotifications: true });
    return;
  }
  el.value = nextValue;
};

export default function MathFieldInput({
  value,
  onChange,
  placeholder,
  className,
  autoFocus = false,
  onBlur,
  readOnly = false,
  virtualKeyboardPolicy = "manual",
  openVirtualKeyboardOnFocus = true,
}: MathFieldInputProps) {
  const fieldRef = useRef<MathFieldElement | null>(null);
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);

  onChangeRef.current = onChange;
  onBlurRef.current = onBlur;

  useEffect(() => {
    let disposed = false;

    void import("mathlive").then((mod) => {
      if (disposed) return;
      const mfe = (
        ((mod as unknown as { MathfieldElement?: MathfieldElementStaticConfig }).MathfieldElement ??
          (globalThis as unknown as { MathfieldElement?: MathfieldElementStaticConfig }).MathfieldElement)
      ) as MathfieldElementStaticConfig | undefined;

      if (!mfe) return;
      patchMathfieldElementDisconnectGuard(mfe);

      // Avoid 404s for default sound assets in Next.js chunks and mute plonk.
      mfe.soundsDirectory = null;
      mfe.keypressSound = null;
      mfe.plonkSound = null;
      mfe.keypressVibration = false;
    });

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;

    el.setAttribute("default-mode", "text");
    el.setAttribute("smart-mode", "on");
    // In math mode, Space navigates by default.
    // Use a regular text-like space so natural-language text is editable.
    el.setAttribute("math-mode-space", "\\text{ }");
    el.mathModeSpace = "\\text{ }";
    el.setAttribute("math-virtual-keyboard-policy", virtualKeyboardPolicy);

    // Keep space key deterministic in math mode.
    if (Array.isArray(el.keybindings)) {
      const customSpaceKeybinding = { key: "space", ifMode: "math", command: ["insert", "\\text{ }"] };
      const filtered = el.keybindings.filter((binding) => {
        if (!binding || typeof binding !== "object") return true;
        const b = binding as { key?: unknown; ifMode?: unknown };
        return !(b.key === "space" && b.ifMode === "math");
      });
      el.keybindings = [customSpaceKeybinding, ...filtered];
    }

    if (placeholder) {
      el.setAttribute("placeholder", placeholder);
    } else {
      el.removeAttribute("placeholder");
    }

    if (readOnly) {
      el.setAttribute("read-only", "");
    } else {
      el.removeAttribute("read-only");
    }
  }, [placeholder, readOnly, virtualKeyboardPolicy]);

  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;

    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const maxAttempts = 200;

    const installGuards = () => {
      if (cancelled) return;
      patchMathfieldFocusDisposeGuards(el);
      clearStaleGlobalMathfield(el);
      if (!getInternalMathfield(el) && attempts < maxAttempts) {
        attempts += 1;
        timerId = setTimeout(installGuards, 25);
      }
    };

    installGuards();

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, []);

  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;

    const current = normalizeMathFieldOutput(getMathValue(el));
    const next = value || "";
    if (current !== normalizeMathFieldOutput(next)) {
      setMathValue(el, next);
    }
  }, [value]);

  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;

    let disposePointerDownListener: (() => void) | null = null;

    const hideVirtualKeyboard = () => {
      getVirtualKeyboard()?.hide?.();
    };

    const removePointerDownListener = () => {
      if (!disposePointerDownListener) return;
      disposePointerDownListener();
      disposePointerDownListener = null;
    };

    const addPointerDownListener = () => {
      if (disposePointerDownListener || readOnly) return;

      const handleDocumentPointerDown = (event: PointerEvent) => {
        const target = event.target;
        if (target instanceof Node && (target === el || el.contains(target))) {
          return;
        }
        // Keep keyboard open while interacting with MathLive itself.
        if (isEventInsideMathField(event) || isEventInsideVirtualKeyboard(event)) {
          return;
        }
        // Blur only if this exact field still owns focus.
        if (document.activeElement === el) {
          el.blur();
          return;
        }
        // Fallback: hide only when no MathLive focus remains.
        setTimeout(() => {
          if (!hasFocusedMathField() && !hasFocusedVirtualKeyboard()) {
            hideVirtualKeyboard();
          }
        }, 0);
      };

      document.addEventListener("pointerdown", handleDocumentPointerDown, true);
      disposePointerDownListener = () => {
        document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
      };
    };

    const showVirtualKeyboard = () => {
      if (!openVirtualKeyboardOnFocus || readOnly) return;
      getVirtualKeyboard()?.show?.();
    };

    const emitValueChange = () => {
      onChangeRef.current(normalizeMathFieldOutput(getMathValue(el)));
    };

    const handleInput = () => {
      emitValueChange();
    };

    const handleFocus = () => {
      patchMathfieldFocusDisposeGuards(el);
      clearStaleGlobalMathfield(el);
      // New fields should start in text mode for normal typing (including spaces).
      if (!getMathValue(el)) {
        el.mode = "text";
      }
      showVirtualKeyboard();
      addPointerDownListener();
    };

    const handleKeyDown = (event: Event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key !== " " || readOnly) return;

      // Fallback: if MathLive still treats Space as navigation in math mode,
      // force-insert a text-space token.
      if (el.mode === "math") {
        keyboardEvent.preventDefault();
        const inserted =
          el.executeCommand?.(["insert", "\\text{ }"]) ??
          el.insert?.("\\text{ }", { format: "latex", mode: "math" });
        if (inserted === false) {
          el.executeCommand?.(["insert", "\\:"]);
        }
        emitValueChange();
      }
    };

    const handleBeforeInput = (event: Event) => {
      const inputEvent = event as InputEvent;
      if (readOnly) return;
      if (inputEvent.data !== " " || el.mode !== "math") return;

      inputEvent.preventDefault();
      const inserted =
        el.executeCommand?.(["insert", "\\text{ }"]) ??
        el.insert?.("\\text{ }", { format: "latex", mode: "math" });
      if (inserted === false) {
        el.executeCommand?.(["insert", "\\:"]);
      }
      emitValueChange();
    };

    const handleBlur = () => {
      removePointerDownListener();
      // Delay hide to allow focus transition to another <math-field>.
      setTimeout(() => {
        if (!hasFocusedMathField() && !hasFocusedVirtualKeyboard()) {
          hideVirtualKeyboard();
        }
      }, 0);
      onBlurRef.current?.();
    };

    el.addEventListener("input", handleInput);
    el.addEventListener("focus", handleFocus);
    el.addEventListener("blur", handleBlur);
    el.addEventListener("keydown", handleKeyDown);
    el.addEventListener("beforeinput", handleBeforeInput);

    if (autoFocus) {
      const focusAndShow = () => {
        el.focus();
        showVirtualKeyboard();
      };

      const timers = [
        setTimeout(focusAndShow, 0),
        setTimeout(focusAndShow, 80),
        setTimeout(focusAndShow, 180),
      ];

      return () => {
        timers.forEach(clearTimeout);
        el.removeEventListener("input", handleInput);
        el.removeEventListener("focus", handleFocus);
        el.removeEventListener("blur", handleBlur);
        el.removeEventListener("keydown", handleKeyDown);
        el.removeEventListener("beforeinput", handleBeforeInput);
        removePointerDownListener();
      };
    }

    return () => {
      el.removeEventListener("input", handleInput);
      el.removeEventListener("focus", handleFocus);
      el.removeEventListener("blur", handleBlur);
      el.removeEventListener("keydown", handleKeyDown);
      el.removeEventListener("beforeinput", handleBeforeInput);
      removePointerDownListener();
    };
  }, [autoFocus, openVirtualKeyboardOnFocus, readOnly]);

  useEffect(() => {
    const el = fieldRef.current;
    return () => {
      if (!el) return;
      if (document.activeElement === el) {
        el.blur();
      }
    };
  }, []);

  return (
    <math-field
      ref={fieldRef}
      className={`math-field-input ${className || ""}`.trim()}
    />
  );
}
