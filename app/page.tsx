import localFont from "next/font/local";
import { LandingPage } from "./landing-page";

const stackSans = localFont({
  src: "../public/fonts/stack-sans-headline.ttf",
  display: "swap",
  variable: "--font-stack-sans",
  weight: "200 700",
});

export default function Home() {
  return (
    <div className={stackSans.variable}>
      <LandingPage />
    </div>
  );
}
