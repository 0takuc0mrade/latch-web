"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

export function filterHomepageEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  const url = new URL(event.url);

  if (url.pathname !== "/") return null;

  url.search = "";
  url.hash = "";
  return { ...event, url: url.toString() };
}

export function HomepageAnalytics() {
  return <Analytics beforeSend={filterHomepageEvent} />;
}
