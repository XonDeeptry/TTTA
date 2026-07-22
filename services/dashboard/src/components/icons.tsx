import { SVGProps } from 'react';

/**
 * Small hand-authored outline icon set (Phosphor-inspired, no external icon
 * package dependency — keeps the S1 dependency footprint minimal per F3-ux §0.1).
 * 20x20 viewBox, 1.5px stroke, matches the "Outline / regular weight" look
 * called for in the design spec.
 */
function IconBase(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export function IconGauge(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M3 11a7 7 0 1 1 14 0" />
      <path d="M10 11l3-3" />
      <path d="M10 11h.01" />
    </IconBase>
  );
}

export function IconSettings(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 3v1.5M10 15.5V17M17 10h-1.5M4.5 10H3M15 5l-1 1M6 14l-1 1M15 15l-1-1M6 6 5 5" />
    </IconBase>
  );
}

export function IconOnboarding(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M4 17v-1a4 4 0 0 1 4-4h1" />
      <circle cx="8.5" cy="6.5" r="2.5" />
      <path d="M13 9l2 2 3.5-3.5" />
    </IconBase>
  );
}

export function IconStudents(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M2 8l8-3.5L18 8l-8 3.5L2 8Z" />
      <path d="M5.5 9.7V13c0 1.1 2 2 4.5 2s4.5-.9 4.5-2V9.7" />
    </IconBase>
  );
}

export function IconSubmissions(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M5 3h7l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M12 3v3h3" />
      <path d="M6.5 11h7M6.5 14h4.5" />
    </IconBase>
  );
}

export function IconReports(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M4 16V9M9 16V4M14 16v-6" />
      <path d="M3 17h14" />
    </IconBase>
  );
}

export function IconCriteria(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M4 4h12v12H4z" />
      <path d="M7 8l1.5 1.5L13 6" />
      <path d="M7 13h6" />
    </IconBase>
  );
}

export function IconLogout(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M8 17H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4" />
      <path d="M13 13l4-3-4-3" />
      <path d="M17 10H7" />
    </IconBase>
  );
}

export function IconMenu(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M3 5h14M3 10h14M3 15h14" />
    </IconBase>
  );
}

export function IconSidebar(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <rect x="3" y="4" width="14" height="12" rx="1.5" />
      <path d="M8 4v12" />
    </IconBase>
  );
}

export function IconArrowLeft(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M12 4l-6 6 6 6" />
      <path d="M6 10h10" />
    </IconBase>
  );
}
