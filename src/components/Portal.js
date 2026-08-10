"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Renders children into document.body so fixed-position overlays escape
// ancestors with a CSS filter/backdrop-blur, which otherwise become the
// containing block for `position: fixed` and break full-viewport overlays.
export default function Portal({ children }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  if (!mounted) return null;

  return createPortal(children, document.body);
}
