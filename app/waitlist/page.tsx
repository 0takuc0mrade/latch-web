import type { Metadata } from "next";
import { WaitlistPage } from "../waitlist-page";

export const metadata: Metadata = {
  title: "Join the waitlist | Latch",
  description: "Join the Latch waitlist and follow our road to mainnet on Stellar.",
};

export default function Waitlist() {
  return <WaitlistPage />;
}
