import type { Metadata } from "next";
import { accentFont, stackSans } from "../fonts";
import { DemoPage } from "./demo-page";

const title = "Try a Smart Account | Latch";
const description =
  "A four-minute guided demo on Stellar testnet: create a passkey account, add test funds, set a spending rule and watch the account enforce it.";

// Share images come from opengraph-image.png / twitter-image.png in this folder
// (Next file convention; regenerate with scripts/generate-demo-og-image.mjs).
export const metadata: Metadata = {
  metadataBase: new URL("https://uselatch.app"),
  title,
  description,
  alternates: { canonical: "/demo" },
  openGraph: { type: "website", url: "/demo", siteName: "Latch", title, description },
  twitter: { card: "summary_large_image", title, description },
};

export default function Demo() {
  return (
    <div className={`${stackSans.variable} ${accentFont.variable}`}>
      <DemoPage />
    </div>
  );
}
