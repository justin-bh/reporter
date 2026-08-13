/** reporter mark: a stylized capture/aperture in the brand accent. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="reporter" role="img">
      <rect x="2" y="2" width="28" height="28" rx="8" fill="var(--accent)" />
      <circle cx="16" cy="16" r="7" fill="none" stroke="var(--accent-contrast)" strokeWidth="2.5" />
      <circle cx="16" cy="16" r="2.5" fill="var(--accent-contrast)" />
      <path d="M16 5 v3 M16 24 v3 M5 16 h3 M24 16 h3" stroke="var(--accent-contrast)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
