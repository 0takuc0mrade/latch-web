import Image from "next/image";
import { landingAssets } from "./landing-assets";
import styles from "./landing-page.module.css";

export type ArtworkName = keyof typeof landingAssets;

export function Artwork({
  name,
  className,
  priority = false,
  alt = "",
}: {
  name: ArtworkName;
  className?: string;
  priority?: boolean;
  alt?: string;
}) {
  const { width, height } = landingAssets[name];

  return (
    <Image
      alt={alt}
      aria-hidden={alt ? undefined : true}
      className={`${styles.artwork} ${className ?? ""}`}
      draggable={false}
      height={height}
      fetchPriority={priority ? "high" : undefined}
      loading={priority ? "eager" : "lazy"}
      src={`/landing-assets/${name}`}
      width={width}
    />
  );
}

// Illustrative Stellar contract address; no live account is connected to this card.
const SMART_ACCOUNT_ADDRESS = "CCOPIKM2AEHPST5LLJVQVZHHMVRDWDHLJCMLNOQGXZGEVHX5S64JUTTU";
const SHORT_SMART_ACCOUNT_ADDRESS = `${SMART_ACCOUNT_ADDRESS.slice(0, 6)}...${SMART_ACCOUNT_ADDRESS.slice(-4)}`;

function CopyGlyph() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 16 18">
      <rect height="12" rx="2" stroke="currentColor" strokeWidth="1.4" width="9" x="6" y="1" />
      <path d="M3 5H2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  );
}

export function SmartAccountArtwork() {
  return (
    <div
      aria-label="A Latch Smart Account with a Stellar contract address and multiple signers"
      className={styles.smartCardArt}
      role="img"
    >
      <Artwork name="wallet-card.png" />
      <span aria-hidden="true" className={styles.smartCardAddressBadge}>
        <span>{SHORT_SMART_ACCOUNT_ADDRESS}</span>
        <CopyGlyph />
      </span>
      <span aria-hidden="true" className={styles.smartCardAddressRow}>
        <span>{SHORT_SMART_ACCOUNT_ADDRESS}</span>
        <span className={styles.smartCardCopyLabel}>Copy <CopyGlyph /></span>
      </span>
    </div>
  );
}

const WALLET_TOKENS = [
  { name: "Tether", icon: "usdt-light.png", balance: "$200.78" },
  { name: "Stellar", icon: "stellar-light.png", balance: "$0.78" },
  { name: "USDC", icon: "usdc-light.png", balance: "$0.45" },
] as const;

export function TokensPhone() {
  return (
    <div
      aria-label="Latch wallet showing Tether, Stellar, and USDC, with balances measured in XLM"
      className={styles.tokensPhone}
      role="img"
    >
      <Artwork name="step-phone-tokens.png" />
      <ul aria-hidden="true" className={styles.tokenRows}>
        {WALLET_TOKENS.map((token) => (
          <li className={styles.tokenRow} key={token.name}>
            <span className={`${styles.tokenIcon} ${token.name === "Stellar" ? styles.tokenIconStellar : ""}`}>
              <Image alt="" height={40} sizes="40px" src={`/waitlist-assets/${token.icon}`} width={40} />
            </span>
            <span className={styles.tokenDetails}>
              <span>{token.name}</span>
              <span className={styles.tokenPrice}>$75.67 <span>+0.5%</span></span>
            </span>
            <span className={`${styles.tokenDetails} ${styles.tokenBalance}`}>
              <span>{token.balance}</span>
              <span className={styles.tokenQuantity}>0.0043278 XLM</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Part({
  name,
  position,
  motion,
  nodeId,
}: {
  name: ArtworkName;
  position: string;
  motion?: string;
  nodeId?: string;
}) {
  return (
    <span className={position} data-node-id={nodeId}>
      <Artwork className={motion} name={name} />
    </span>
  );
}

export function KeyMascot({ mirrored = false }: { mirrored?: boolean }) {
  return (
    <div aria-hidden="true" className={`${styles.keyMascot} ${mirrored ? styles.keyMascotLeft : ""}`}>
      <Part name="step-shadow.svg" position={styles.keyShadow} />
      <Part name="key-hand.svg" position={styles.keyHand} />
      <Part name="key-finger-one.svg" position={styles.keyFingerOne} />
      <Part name="key-finger-two.svg" position={styles.keyFingerTwo} />
      <Part name="key-legs.svg" position={styles.keyLegs} />
      <Part name="key-head.svg" position={styles.keyHead} motion={styles.shake} nodeId={mirrored ? "1365:23170" : "1365:22976"} />
      <Part name="key-arm.svg" position={styles.keyArm} />
      <Part name="key-face.svg" position={styles.keyFace} />
      <Part name="key-eye-right.svg" position={styles.keyEyeRight} />
      <Part name="key-eye-left.svg" position={styles.keyEyeLeft} />
      <span className={styles.keyKeysPosition} data-node-id={mirrored ? "1365:23178" : "1365:23000"}>
        <span className={styles.shake}>
          <Artwork className={styles.keysRotation} name="key-keys.svg" />
        </span>
      </span>
      <Part name="key-mouth.svg" position={styles.keyMouth} />
      <span className={styles.keyCoinPosition} data-node-id={mirrored ? "1365:23186" : "1365:23016"}>
        <span className={styles.coinFloat}>
          <Artwork className={styles.coinRotation} name="key-coin.svg" />
        </span>
      </span>
      <Part name="key-sparkles.svg" position={styles.keySparkles} motion={styles.sparkleDrop} nodeId={mirrored ? "1365:23189" : "1365:23051"} />
    </div>
  );
}

export function CapeMascot({ left = false }: { left?: boolean }) {
  return (
    <div aria-hidden="true" className={`${styles.capeMascot} ${left ? styles.capeMascotLeft : ""}`}>
      <Part name="step-cape.svg" position={styles.stepCape} motion={styles.capeBreathe} nodeId={left ? "1365:23266" : "1365:22848"} />
      <Part name="cape-arm.svg" position={styles.capeArm} />
      <Part name="cape-foot.svg" position={styles.capeFoot} />
      <Part name="cape-rock.svg" position={styles.capeRock} />
      <Part name="cape-leg.svg" position={styles.capeLeg} />
      <Part name="cape-other-leg.svg" position={styles.capeOtherLeg} />
      <Part name="cape-other-arm.svg" position={styles.capeOtherArm} />
      <Part name="cape-face.svg" position={styles.capeFace} />
      <Part name="cape-eye-right.svg" position={styles.capeEyeRight} />
      <Part name="cape-eye-left.svg" position={styles.capeEyeLeft} />
      <Part name="cape-mouth.svg" position={styles.capeMouth} />
    </div>
  );
}

export function DeveloperMascot() {
  return (
    <div aria-hidden="true" className={styles.developerMascot}>
      <Part name="developer-cape.svg" position={styles.developerCape} />
      <Part name="developer-body.svg" position={styles.developerBody} />
      <Part name="developer-head.svg" position={styles.developerHead} />
      <Part name="developer-coin.svg" position={styles.developerCoin} />
      <Part name="developer-gift.svg" position={styles.developerGift} />
      <Part name="developer-cash.svg" position={styles.developerCash} />
      <span className={styles.developerKeysPosition} data-node-id="1373:25144">
        <span className={styles.shake}>
          <Artwork className={styles.keysRotation} name="developer-keys.svg" />
        </span>
      </span>
    </div>
  );
}
