import type { Metadata } from "next";
import { HomepageAnalytics } from "./analytics";
import "./globals.css";

export const metadata: Metadata = {
  title: "Latch",
  description:
    "Your passkey to Stellar. Meet Latch, the new smart account wallet for sending, receiving, and managing your tokens.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        {children}
        <HomepageAnalytics />
      </body>
    </html>
  );
}
