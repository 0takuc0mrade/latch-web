import { stackSans } from "./fonts";
import { LandingPage } from "./landing-page";

export default function Home() {
  return (
    <div className={stackSans.variable}>
      <LandingPage />
    </div>
  );
}
