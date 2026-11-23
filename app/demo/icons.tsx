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

export function ShieldIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </Icon>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <path d="M6 9l6 6 6-6" />
    </Icon>
  );
}

/** "Blocked" glyph: a circle with a bar. */
export function BlockIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
    </Icon>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <Icon strokeWidth={3} {...props}>
      <path d="M6 12h12" />
    </Icon>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </Icon>
  );
}
