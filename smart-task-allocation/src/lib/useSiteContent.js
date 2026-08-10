"use client";

import { useEffect, useState } from "react";
import { SITE_CONTENT_DEFAULTS } from "@/lib/siteContentSchema";

// Module-scoped so every component on a page (nav, hero, footer, ...) shares
// one network request instead of each firing its own.
let cachedContentPromise = null;

function fetchSiteContent() {
  if (!cachedContentPromise) {
    cachedContentPromise = fetch("/api/site-content")
      .then((response) => (response.ok ? response.json() : { content: {} }))
      .then((data) => data.content ?? {})
      .catch(() => ({}));
  }

  return cachedContentPromise;
}

// Returns this section's live CMS content merged over its hardcoded default.
// Renders the default synchronously on first paint (no flash of empty
// content, safe under SSR) and swaps in the fetched copy once it resolves.
export function useSiteContent(sectionKey) {
  const [content, setContent] = useState(SITE_CONTENT_DEFAULTS[sectionKey]);

  useEffect(() => {
    let active = true;

    fetchSiteContent().then((all) => {
      if (active && all[sectionKey]) {
        setContent({ ...SITE_CONTENT_DEFAULTS[sectionKey], ...all[sectionKey] });
      }
    });

    return () => {
      active = false;
    };
  }, [sectionKey]);

  return content;
}
