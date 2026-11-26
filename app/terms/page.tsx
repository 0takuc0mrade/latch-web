import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL, LegalPage, legalStyles as styles } from "../legal/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service · Latch",
  description: "The terms that apply when you use Latch.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) are an agreement between you and {LEGAL.entity}{" "}
        (&ldquo;Latch&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). They govern your use of the Latch
        mobile app, the website at uselatch.app, and related services (together, the
        &ldquo;Services&rdquo;). By using the Services, you agree to these Terms. If you do not
        agree, do not use the Services.
      </p>

      <div className={styles.notice}>
        <p>
          <strong>Important.</strong> Latch is a non-custodial wallet. We never hold your funds and
          cannot reverse transactions. If you lose both your device and your recovery method, we
          cannot recover your wallet. Digital assets are risky, and you can lose money.
        </p>
      </div>

      <h2>1. Eligibility</h2>
      <p>
        You must be at least 18 years old and able to form a binding contract to use the
        Services. You may not use the Services if you are located in, or a resident of, a country
        or region subject to comprehensive sanctions. You also may not use them if you are on any
        sanctions list, or if your use would break laws that apply to you.
      </p>

      <h2>2. A non-custodial wallet</h2>
      <p>
        Latch is software that helps you create and use a Stellar smart account that you control.
        Your private keys, passkeys, and recovery phrase are created on your device. Latch does
        not take custody of your digital assets, and it is not a bank, exchange, broker, or money
        transmitter. You alone can authorize transactions from your wallet. Shared wallets need
        approval from as many members as their signing threshold requires.
      </p>

      <h2>3. Your responsibilities</h2>
      <ul>
        <li>Keep your device, PIN, passkeys, and recovery phrase secure and private. Anyone with
          access to them may be able to control your wallet.</li>
        <li>Back up your recovery phrase or set up account recovery. If you lose access without a
          backup, your assets may be lost permanently.</li>
        <li>Check every transaction, including the recipient address, amount, asset, and network,
          before you approve it.</li>
        <li>Pay any taxes that apply to your transactions.</li>
      </ul>

      <h2>4. Transactions and fees</h2>
      <p>
        Transactions are submitted to the Stellar network. Once confirmed, they are{" "}
        <strong>final and cannot be reversed</strong> by us or anyone else. Network fees may apply.
        Some features may also charge a service fee. If one applies, we will show it to you before
        you confirm. We do not guarantee that a transaction will be confirmed, or how quickly.
      </p>

      <h2>5. Account recovery</h2>
      <p>
        Account recovery is optional. If you turn it on, your wallet credentials are encrypted on
        your device with a recovery password you choose, and only the encrypted backup is stored
        with us, as described in our <Link href="/privacy">Privacy Policy</Link>. We never have
        your recovery password and cannot decrypt your backup or reset the password. To restore,
        you need both access to your email account and your recovery password. You are
        responsible for keeping both secure. We are not liable for losses if you forget your
        password or if someone else obtains both.
      </p>

      <h2>6. Third-party services</h2>
      <p>
        The Services may let you use services that we do not operate. These include the Stellar
        network, swap providers, dApps connected through WalletConnect, and on-ramp providers
        such as MoonPay. Your use of them is governed by their own terms. We are not responsible
        for their availability, accuracy, fees, or conduct. Prices, quotes, and market data are
        shown for information only and may be inaccurate or delayed.
      </p>

      <h2>7. No financial advice</h2>
      <p>
        Nothing in the Services is investment, financial, legal, or tax advice. The value of
        digital assets, including stablecoins, can change, and you could lose some or all of what
        you hold. Smart contracts, protocols, and networks can fail, be exploited, or change.
        You use the Services at your own risk.
      </p>

      <h2>8. Pre-release software</h2>
      <p>
        Latch is under active development. Features may change, contain bugs, or be removed. Test
        network (&ldquo;testnet&rdquo;) assets have no value. Please start with small amounts.
      </p>

      <h2>9. Acceptable use</h2>
      <p>You agree not to use the Services to:</p>
      <ul>
        <li>break any law, including anti-money-laundering, counter-terrorist-financing, or
          sanctions laws;</li>
        <li>commit fraud or deal in the proceeds of crime;</li>
        <li>interfere with, attack, overload, or reverse-engineer the Services or our servers,
          except where the law allows it;</li>
        <li>access the Services through automated means in ways that place an unreasonable load on
          them; or</li>
        <li>infringe anyone else&rsquo;s rights.</li>
      </ul>

      <h2>10. Intellectual property</h2>
      <p>
        We and our licensors own the Services, including the Latch name, logo, and design. While
        you follow these Terms, we grant you a limited, personal, non-exclusive, non-transferable,
        revocable license to use the app. Open-source components are licensed under their own
        licenses.
      </p>

      <h2>11. Suspension and termination</h2>
      <p>
        We may suspend or stop providing all or part of the Services at any time, for example if
        you breach these Terms or the law requires it. Because Latch is non-custodial, you keep
        control of your on-chain assets. You can still access them with your recovery phrase in
        compatible software. You may stop using the Services at any time.
      </p>

      <h2>12. Disclaimers</h2>
      <p>
        THE SERVICES ARE PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo;, WITHOUT
        WARRANTIES OF ANY KIND. TO THE FULLEST EXTENT THE LAW ALLOWS, WE DISCLAIM ALL WARRANTIES,
        WHETHER EXPRESS OR IMPLIED. THESE INCLUDE MERCHANTABILITY, FITNESS FOR A PARTICULAR
        PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICES WILL BE UNINTERRUPTED,
        SECURE, OR ERROR-FREE.
      </p>

      <h2>13. Limitation of liability</h2>
      <p>
        TO THE FULLEST EXTENT THE LAW ALLOWS, {LEGAL.entity.toUpperCase()} WILL NOT BE LIABLE FOR ANY
        INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES. WE WILL ALSO NOT BE
        LIABLE FOR ANY LOSS OF DIGITAL ASSETS, PROFITS, OR DATA ARISING FROM YOUR USE OF THE
        SERVICES. THIS INCLUDES LOSSES CAUSED BY LOST CREDENTIALS, USER ERROR, NETWORK FAILURES, OR
        THIRD-PARTY SERVICES. OUR TOTAL LIABILITY FOR ANY CLAIM WILL NOT EXCEED THE GREATER OF THE
        FEES YOU PAID US IN THE 12 MONTHS BEFORE THE CLAIM AND US$100. Some jurisdictions do not
        allow these limitations, so some of them may not apply to you.
      </p>

      <h2>14. Indemnity</h2>
      <p>
        You agree to indemnify us against claims, losses, and expenses, including reasonable legal
        fees, that arise from your breach of these Terms or your misuse of the Services.
      </p>

      <h2>15. Governing law and disputes</h2>
      <p>
        These Terms are governed by the laws of {LEGAL.governingLaw}, without regard to its
        conflict-of-law rules. Disputes will be resolved in the courts of {LEGAL.governingLaw},
        unless the law of your country of residence gives you the right to bring a claim locally.
      </p>

      <h2>16. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. We will change the &ldquo;Last updated&rdquo;
        date above, and we will notify you in the app or by email if the changes are significant.
        If you keep using the Services after a change takes effect, you accept the updated Terms.
      </p>

      <h2>17. General</h2>
      <p>
        These Terms, together with our Privacy Policy, are the entire agreement between you and us
        about the Services. If any provision is found unenforceable, the rest of the Terms remain
        in effect. If we do not enforce a provision, we have not waived it. You may not transfer
        these Terms without our consent. We may transfer them in connection with a merger,
        acquisition, or sale of assets.
      </p>

      <h2>18. Contact</h2>
      <p>
        {LEGAL.entity}
        <br />
        {LEGAL.address}
        <br />
        <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
      </p>
    </LegalPage>
  );
}
