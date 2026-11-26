import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Hero } from "../app/demo/hero";

const ADDRESS = "CAUQKJ37S7EGCW4Y2K4L3DODEOMX6OV4TZOMH4FS7W4MIBACF4FQX2V3";
const noop = () => {};
const base = {
  dark: false,
  recovering: false,
  createPhase: "idle" as const,
  completedSteps: [],
  createError: null,
  slowCreate: false,
  signingIn: false,
  checking: false,
  notice: null,
  offsite: null,
  simulated: false,
  showExplorerLinks: true,
  onCreate: noop,
  onSignIn: noop,
  onCheck: noop,
  onStartOver: noop,
};

/** The phone-only account card under the hero actions, as HTML. */
function mobileCard(html: string): string | null {
  const start = html.indexOf('data-testid="hero-account-mobile"');
  if (start === -1) return null;
  return html.slice(start, html.indexOf("Copy address", start) === -1 ? start + 2000 : html.indexOf("Copy address", start) + 20);
}

describe("hero: account card on phones", () => {
  test("after Create, the card follows the actions with the address and Copy address", () => {
    const html = renderToStaticMarkup(<Hero {...base} account={{ address: ADDRESS, credentialId: "c" }} />);
    const card = mobileCard(html);
    expect(card).not.toBeNull();
    expect(card).toContain("Your account is ready.");
    expect(card).toContain(ADDRESS);
    expect(card).toContain("Copy address");
    // It sits after the hero's own actions ("Next: add test funds").
    expect(html.indexOf("Next: add test funds")).toBeLessThan(html.indexOf('data-testid="hero-account-mobile"'));
    // Same content as the desktop card: the address appears in both.
    expect(html.split(ADDRESS).length - 1).toBeGreaterThanOrEqual(2);
  });

  test("no card before an account exists, while restoring, or off the passkey host", () => {
    expect(mobileCard(renderToStaticMarkup(<Hero {...base} account={null} />))).toBeNull();
    expect(mobileCard(renderToStaticMarkup(<Hero {...base} account={{ address: ADDRESS, credentialId: "c" }} recovering />))).toBeNull();
    expect(mobileCard(renderToStaticMarkup(<Hero {...base} account={{ address: ADDRESS, credentialId: "c" }} offsite={{ devHint: false }} />))).toBeNull();
  });

  test("the simulated walkthrough says nothing is deployed on the phone card too", () => {
    const html = renderToStaticMarkup(<Hero {...base} account={{ address: ADDRESS, credentialId: "c" }} simulated showExplorerLinks={false} />);
    expect(mobileCard(html)).toContain("In this simulation nothing is deployed");
  });
});
