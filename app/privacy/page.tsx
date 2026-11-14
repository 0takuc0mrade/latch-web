import type { Metadata } from "next";
import { LEGAL, LegalPage, legalStyles as styles } from "../legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy · Latch",
  description: "How Latch collects, uses, and protects your information.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        This Privacy Policy explains how {LEGAL.entity} (&ldquo;Latch&rdquo;, &ldquo;we&rdquo;,
        &ldquo;us&rdquo;) handles information when you use the Latch mobile app for iOS and
        Android, the website at uselatch.app, and the related services that support them
        (together, the &ldquo;Services&rdquo;).
      </p>

      <div className={styles.notice}>
        <p>
          <strong>The short version.</strong> Latch is a non-custodial wallet. Your private keys,
          recovery phrase, and PIN are created and stored on your device. We never see your
          biometrics. We collect only what we need to run the Services. We don&rsquo;t sell your
          data, and we don&rsquo;t use it for advertising.
        </p>
      </div>

      <h2>1. Information that stays on your device</h2>
      <p>
        The following is created and kept on your device, in the operating system&rsquo;s secure
        storage where available. We cannot access it:
      </p>
      <ul>
        <li>Your wallet private keys, passkeys, and recovery phrase. If you turn on the optional
          recovery backup described below, they leave your device only after they have been
          encrypted with a password that only you know.</li>
        <li>Your app PIN and your recovery password.</li>
        <li>Face ID, Touch ID, or fingerprint data. These are handled entirely by your device&rsquo;s
          operating system. Latch only receives a success or failure result.</li>
        <li>Account names and profile images you choose for your wallets.</li>
        <li>Camera images. The camera is used only to scan QR codes, and images are not stored or
          uploaded.</li>
      </ul>

      <h2>2. Information we collect</h2>

      <h3>Email address</h3>
      <p>
        We collect your email address when you join our waitlist, and when you sign in with
        email or set up account recovery in the app. We use it to verify you with one-time codes,
        to link your recovery backup to you, and to send messages about Latch. Every waitlist
        email includes an unsubscribe link.
      </p>

      <h3>Encrypted recovery backup</h3>
      <p>
        Account recovery is optional. If you turn it on, you choose a recovery password, and the
        app uses it to encrypt the credentials needed to restore your wallet (using Argon2id and
        AES-256-GCM) <strong>on your device, before anything is uploaded</strong>. We store only the
        encrypted result, linked to your verified email address. We never receive your recovery
        password or your unencrypted keys, so we cannot read your backup or use it to access your
        wallet. To restore, you verify your email and enter your recovery password on your new
        device. If you forget the password, we cannot recover the backup for you. You can ask us
        to delete your backup at any time.
      </p>

      <h3>Wallet and transaction information</h3>
      <p>
        To create your smart account and submit transactions on your behalf, our servers process
        your public wallet addresses, public keys, and the transactions you sign. For shared
        wallets, we temporarily relay unsigned transactions between the members&rsquo; devices so
        each member can approve them.
      </p>
      <p>
        Transactions on the Stellar network are <strong>public and permanent</strong>. Anyone can
        see wallet addresses, balances, and transaction history on the public ledger. Neither we
        nor anyone else can delete or change this information.
      </p>

      <h3>Device and notification information</h3>
      <p>
        If you allow notifications, we store a push notification token and basic device details,
        such as the device model and operating system. We use these to send you alerts about
        transactions and approval requests.
      </p>

      <h3>Diagnostics</h3>
      <p>
        The app may send crash reports and error diagnostics to help us find and fix bugs. These
        include the device type, operating system and app version, and technical details about
        the error. We do not intentionally include private keys, recovery phrases, or PINs in
        these reports.
      </p>

      <h3>Website analytics</h3>
      <p>
        Our website&rsquo;s homepage uses privacy-friendly analytics to count visits. It does not
        use cookies. Before sending, we remove query strings and URL fragments, and other pages
        are excluded.
      </p>

      <h2>3. Third-party services</h2>
      <p>
        We rely on service providers to operate the Services. They process information only as
        needed to provide their service to us:
      </p>
      <ul>
        <li><strong>Hosting and databases.</strong> Our website and servers run on cloud providers
          such as Vercel and Neon.</li>
        <li><strong>Crash reporting.</strong> Sentry.</li>
        <li><strong>Push notifications.</strong> Apple Push Notification service, Firebase Cloud
          Messaging, and Expo.</li>
        <li><strong>Market data.</strong> The app requests asset prices from providers such as
          CoinGecko. These requests come from your device, so the provider can see your IP
          address.</li>
      </ul>
      <p>
        Some features connect you to services that we do not operate. Their own privacy policies
        apply when you use them:
      </p>
      <ul>
        <li>The Stellar network and its public RPC and Horizon servers.</li>
        <li>Swap providers such as Soroswap and Aquarius.</li>
        <li>WalletConnect, when you connect to a dApp.</li>
        <li>MoonPay, or other on-ramp providers, when you buy crypto. These providers may collect
          identity and payment information directly from you, and we do not receive your payment
          details.</li>
      </ul>

      <h2>4. How we use information</h2>
      <ul>
        <li>To provide, operate, and secure the Services, including account creation, transaction
          submission, recovery, and notifications.</li>
        <li>To communicate with you about Latch, including product updates and launch news. You
          can opt out at any time.</li>
        <li>To diagnose problems, prevent fraud and abuse, and improve the Services.</li>
        <li>To comply with legal obligations.</li>
      </ul>
      <p>
        We do not sell your personal information, share it for cross-context behavioral
        advertising, or use it to train third-party AI models.
      </p>

      <h2>5. Legal bases (EEA and UK users)</h2>
      <p>
        We process your information to perform our contract with you, which means providing the
        Services. We also rely on our legitimate interests in securing and improving the Services,
        on your consent (for example, for marketing emails and notifications), and on legal
        obligations where they apply.
      </p>

      <h2>6. Retention</h2>
      <p>
        We keep information only as long as we need it for the purposes above. Waitlist emails are
        kept until you unsubscribe or ask us to delete them. Recovery backups are kept until you
        delete them or ask us to. Diagnostic data is kept for a limited period. Information
        recorded on the Stellar network is permanent and outside our control.
      </p>

      <h2>7. Your choices and rights</h2>
      <ul>
        <li>Unsubscribe from emails using the link in any message.</li>
        <li>Turn off notifications, camera access, or photo access in your device settings.</li>
        <li>Delete the app to remove the data stored on your device. Keep your recovery phrase
          safe first.</li>
        <li>Ask us to access, correct, export, or delete the information we hold about you,
          including your email address and recovery backup, by contacting{" "}
          <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a>.</li>
      </ul>
      <p>
        Depending on where you live, you may have further rights under laws such as the GDPR or
        the CCPA, including the right to object to or restrict processing and the right to
        complain to your local data protection authority. We will not discriminate against you
        for exercising these rights.
      </p>

      <h2>8. Security</h2>
      <p>
        We use encryption in transit and at rest, access controls, and the security features of
        your device to protect your information. No system is perfectly secure. You are
        responsible for keeping your device, PIN, and recovery phrase safe.
      </p>

      <h2>9. International transfers</h2>
      <p>
        We and our providers may process information in countries other than your own. Where the
        law requires it, we use appropriate safeguards for these transfers, such as standard
        contractual clauses.
      </p>

      <h2>10. Children</h2>
      <p>
        The Services are not intended for anyone under 18, and we do not knowingly collect
        information from children. If you believe a child has given us information, please
        contact us and we will delete it.
      </p>

      <h2>11. Changes to this policy</h2>
      <p>
        We may update this policy from time to time. We will change the &ldquo;Last updated&rdquo;
        date above, and we will notify you in the app or by email if the changes are significant.
      </p>

      <h2>12. Contact</h2>
      <p>
        {LEGAL.entity}
        <br />
        {LEGAL.address}
        <br />
        <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a>
      </p>
    </LegalPage>
  );
}
