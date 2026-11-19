// Shared, server-safe brand pieces (no hooks).
export const FOOTER = "Independent case study built from a public job description · fictional companies and simulated data, except where marked PUBLIC DATA · not affiliated with any client or platform";

export function Logo() {
  return (
    <svg className="glyph" viewBox="0 0 28 28" aria-hidden="true">
      <rect x="1" y="1" width="26" height="26" rx="7" fill="var(--ink)" />
      <path d="M7 9h14M7 14h14M7 19h8" stroke="var(--bg)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="20" cy="19" r="2.6" fill="var(--signal)" />
    </svg>
  );
}
