import type { Metadata } from "next";
import { accentFont, stackSans } from "../fonts";
import { DemoPage } from "./demo-page";

export const metadata: Metadata = {
  title: "Try a Smart Account | Latch",
  description:
    "A four-minute guided demo on Stellar testnet: create a passkey account, add test funds, set a spending rule and watch the account enforce it.",
};

export default function Demo() {
  return (
    <div className={`${stackSans.variable} ${accentFont.variable}`}>
      <DemoPage />
    </div>
  );
}
