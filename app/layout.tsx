import type { Metadata } from "next";
import { HomepageAnalytics } from "./analytics";
import "./globals.css";

export const metadata: Metadata = {
  title: "Latch",
  description: "Follow Latch as we prepare for mainnet on Stellar.",
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
