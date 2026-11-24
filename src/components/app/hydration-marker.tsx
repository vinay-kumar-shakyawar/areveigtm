"use client";

import { useEffect } from "react";

/** Marks the document once React has hydrated; used by browser smoke tests to avoid acting too early. */
export function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "1";
    return () => {
      delete document.documentElement.dataset.hydrated;
    };
  }, []);
  return null;
}
