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
