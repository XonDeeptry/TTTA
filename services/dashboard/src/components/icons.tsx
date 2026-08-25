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

export function IconGuide(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M3.5 4.5A1.5 1.5 0 0 1 5 3h4.5v13H5a1.5 1.5 0 0 0-1.5 1.5z" />
      <path d="M16.5 4.5A1.5 1.5 0 0 0 15 3h-4.5v13H15a1.5 1.5 0 0 1 1.5 1.5z" />
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

export function IconUsers(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="7" cy="7" r="2.5" />
      <path d="M2.5 16v-1a4.5 4.5 0 0 1 4.5-4.5" />
      <circle cx="13.5" cy="8" r="2" />
      <path d="M10.5 16v-1a4 4 0 0 1 3-3.87" />
    </IconBase>
  );
}

export function IconAnalytics(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M3 3v14h14" />
      <path d="M6 14v-4M10 14V7M14 14v-6" />
    </IconBase>
  );
}

export function IconKey(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="7" cy="13" r="3" />
      <path d="M9.1 10.9 16 4" />
      <path d="M13 7l2 2" />
    </IconBase>
  );
}

export function IconCourses(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M3 5.5C3 4.7 3.7 4 4.5 4H9v12H4.5A1.5 1.5 0 0 1 3 14.5v-9Z" />
      <path d="M17 5.5c0-.8-.7-1.5-1.5-1.5H11v12h4.5a1.5 1.5 0 0 0 1.5-1.5v-9Z" />
    </IconBase>
  );
}

export function IconTestUpload(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M8 3h4M8.5 3v4.2L5 14a1.5 1.5 0 0 0 1.3 2.2h7.4A1.5 1.5 0 0 0 15 14l-3.5-6.8V3" />
      <path d="M7 13h6" />
    </IconBase>
  );
}

// ─── F12 — drawer / template / authoring icons ─────────────────────────────────────

export function IconClose(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M5 5l10 10M15 5L5 15" />
    </IconBase>
  );
}

export function IconPlus(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M10 4v12M4 10h12" />
    </IconBase>
  );
}

export function IconCopy(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <rect x="7" y="7" width="9" height="9" rx="1" />
      <path d="M4 13V5a1 1 0 0 1 1-1h8" />
    </IconBase>
  );
}

export function IconTrash(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M4 6h12" />
      <path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6" />
      <path d="M5.5 6l.6 9.2A1.5 1.5 0 0 0 7.6 16.5h4.8a1.5 1.5 0 0 0 1.5-1.3L14.5 6" />
    </IconBase>
  );
}

export function IconEye(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z" />
      <circle cx="10" cy="10" r="2.2" />
    </IconBase>
  );
}

export function IconEyeOff(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M2 10s3-5.5 8-5.5c1.6 0 2.9.5 4 1.2M18 10s-1.2 2.2-3.4 3.8M8.3 8.3a2.2 2.2 0 0 0 3.1 3.1" />
      <path d="M3 3l14 14" />
    </IconBase>
  );
}

export function IconRestore(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M4 10a6 6 0 1 0 2-4.5" />
      <path d="M4 3v3.5H7.5" />
    </IconBase>
  );
}

export function IconLock(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
      <path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" />
    </IconBase>
  );
}

export function IconPin(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M10 2.5c-2.2 0-4 1.7-4 4 0 3 4 8.5 4 8.5s4-5.5 4-8.5c0-2.3-1.8-4-4-4Z" />
      <circle cx="10" cy="6.5" r="1.5" />
    </IconBase>
  );
}

export function IconChevronUp(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M5 12l5-5 5 5" />
    </IconBase>
  );
}

export function IconChevronDown(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M5 8l5 5 5-5" />
    </IconBase>
  );
}

export function IconAlertTriangle(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M10 3.5 17.5 16h-15L10 3.5Z" />
      <path d="M10 8.5v3.2M10 14h.01" />
    </IconBase>
  );
}
