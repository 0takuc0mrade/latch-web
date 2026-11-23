import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.9}
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      {children}
    </svg>
  );
}

/** Passkey / key glyph used on every "approve with passkey" action. */
export function PasskeyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="4" />
      <path d="M10.8 10.8L20 20" />
      <path d="M16 16l2-2" />
      <path d="M18.5 18.5l2-2" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon strokeWidth={3} {...props}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Icon>
  );
}

export function CrossIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2.4} {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  );
}
