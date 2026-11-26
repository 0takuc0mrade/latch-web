import Image from "next/image";
import styles from "./mascot-scene.module.css";

const ASSET_ROOT = "/waitlist-assets";

function FillAsset({ src, className }: { src: string; className?: string }) {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className={`${styles.asset} ${className ?? ""}`}
      draggable={false}
      fill
      sizes="120px"
      src={`${ASSET_ROOT}/${src}`}
    />
  );
}

interface MascotSceneProps {
  /** Dark mode swaps the ground shadow for the dark-theme asset, as on /waitlist. */
  dark?: boolean;
  className?: string;
  /**
   * Draw the ground shadow as a soft gradient in --mascot-shadow-color instead
   * of the light/dark asset (which is made to sit on a coloured disc). For
   * pages that show the mascot on the plain page background, like /demo.
   */
  softShadow?: boolean;
}

/**
 * The meditating mascot with floating coins, wallet, cash and sparkles, built
 * from the same layered assets and animation as the /waitlist mascot.
 * Decorative: the caller provides any accessible label.
 */
export function MascotScene({ dark = false, className, softShadow = false }: MascotSceneProps) {
  return (
    <div aria-hidden="true" className={`${styles.scene} ${className ?? ""}`}>
      <div className={styles.sparkleLayer}>
        <span className={styles.sparkleLarge}>
          <FillAsset src="sparkle-large-light.svg" />
        </span>
        <span className={styles.sparkleSmall}>
          <FillAsset src="sparkle-small-light.svg" />
        </span>
      </div>

      <div className={styles.mascotFrame}>
        <span className={styles.leftArm}>
          <FillAsset src="arm-left-light.svg" />
        </span>
        <span className={styles.rightArm}>
          <FillAsset src="arm-right-light.svg" />
        </span>
        <span className={styles.mascotBody}>
          <FillAsset src="mascot-light.svg" />
        </span>
        {softShadow ? (
          <span className={`${styles.mascotShadow} ${styles.softShadow}`} />
        ) : (
          <span className={styles.mascotShadow}>
            <FillAsset src={dark ? "shadow-dark.svg" : "shadow-light.svg"} />
          </span>
        )}
      </div>

      <div className={styles.coinLayer}>
        <div className={styles.coinUsdc}>
          <div className={styles.usdcCoinShape}>
            <div className={styles.usdcCoinShapeInner}>
              <div className={styles.usdcCoinShapeAsset}>
                <FillAsset src="coin-usdc-light.svg" />
              </div>
            </div>
          </div>
          <div className={styles.usdcCoinLogo}>
            <div className={styles.usdcCoinLogoInner}>
              <div className={styles.usdcCoinLogoAsset}>
                <FillAsset className={styles.coverAsset} src="usdc-light.png" />
              </div>
            </div>
          </div>
        </div>

        <div className={styles.coinUsdt}>
          <div className={styles.usdtCoinShape}>
            <div className={styles.usdtCoinShapeInner}>
              <div className={styles.usdtCoinShapeAsset}>
                <FillAsset src="coin-usdt-light.svg" />
              </div>
            </div>
          </div>
          <div className={styles.usdtCoinLogo}>
            <div className={styles.usdtCoinLogoInner}>
              <div className={styles.usdtCoinLogoAsset}>
                <FillAsset className={styles.coverAsset} src="usdt-light.png" />
              </div>
            </div>
          </div>
        </div>

        <div className={styles.coinStellar}>
          <div className={styles.stellarCoinShape}>
            <div className={styles.stellarCoinShapeInner}>
              <div className={styles.stellarCoinShapeAsset}>
                <FillAsset src="coin-stellar-light.svg" />
              </div>
            </div>
          </div>
          <div className={styles.stellarCoinLogo}>
            <div className={styles.stellarCoinLogoInner}>
              <div className={styles.stellarCoinLogoAsset}>
                <FillAsset className={styles.coverAsset} src="stellar-light.png" />
              </div>
            </div>
          </div>
        </div>

        <div className={styles.walletCoin}>
          <div className={styles.walletRotation}>
            <div className={styles.walletViewport}>
              <div className={styles.walletAsset}>
                <FillAsset src="wallet-light.svg" />
              </div>
            </div>
          </div>
        </div>

        <div className={styles.cashCoin}>
          <div className={styles.cashRotation}>
            <div className={styles.cashViewport}>
              <div className={styles.cashAsset}>
                <FillAsset src="cash-light.svg" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
