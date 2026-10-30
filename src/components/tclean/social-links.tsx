export type SocialId = "facebook" | "instagram" | "tiktok";

export const SOCIAL_LINKS: { id: SocialId; label: string; href: string }[] = [
  { id: "facebook", label: "Facebook", href: "https://www.facebook.com/share/19mnxPuTcG/?mibextid=wwXIfr" },
  { id: "instagram", label: "Instagram", href: "https://www.instagram.com/tclean.strasbourg" },
  { id: "tiktok", label: "TikTok", href: "https://www.tiktok.com/@tclean.strasbourg" },
];

export function SocialIcon({ id, size = 22 }: { id: SocialId; size?: number }) {
  if (id === "facebook")
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="12" fill="#1877F2" />
        <path
          d="M16.5 15.5l.5-3.5h-3.3V9.8c0-1 .5-1.9 2-1.9H17V5c0 0-1.4-.2-2.7-.2-2.8 0-4.6 1.7-4.6 4.7V12H6.8v3.5h2.9V24c.6.1 1.2.1 1.8.1s1.2 0 1.8-.1v-8.5h2.9z"
          fill="#fff"
        />
      </svg>
    );
  if (id === "instagram")
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <radialGradient id="igGrad" cx="30%" cy="107%" r="150%">
            <stop offset="0" stopColor="#fdf497" />
            <stop offset="0.05" stopColor="#fdf497" />
            <stop offset="0.45" stopColor="#fd5949" />
            <stop offset="0.6" stopColor="#d6249f" />
            <stop offset="0.9" stopColor="#285AEB" />
          </radialGradient>
        </defs>
        <rect width="24" height="24" rx="6" fill="url(#igGrad)" />
        <rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="#fff" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="3.3" fill="none" stroke="#fff" strokeWidth="1.8" />
        <circle cx="16.3" cy="7.7" r="1" fill="#fff" />
      </svg>
    );
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#000" />
      <g transform="translate(4.5 4)">
        <path d="M10.6 0h-2.7v11.2a2.4 2.4 0 1 1-2.4-2.4V6a5.1 5.1 0 1 0 5.1 5.1V5.4a6 6 0 0 0 3.6 1.2V3.9A3.6 3.6 0 0 1 10.6 0z" fill="#25F4EE" transform="translate(-0.6 0.4)" />
        <path d="M10.6 0h-2.7v11.2a2.4 2.4 0 1 1-2.4-2.4V6a5.1 5.1 0 1 0 5.1 5.1V5.4a6 6 0 0 0 3.6 1.2V3.9A3.6 3.6 0 0 1 10.6 0z" fill="#FE2C55" transform="translate(0.6 -0.4)" />
        <path d="M10.6 0h-2.7v11.2a2.4 2.4 0 1 1-2.4-2.4V6a5.1 5.1 0 1 0 5.1 5.1V5.4a6 6 0 0 0 3.6 1.2V3.9A3.6 3.6 0 0 1 10.6 0z" fill="#fff" />
      </g>
    </svg>
  );
}

export function SocialBar({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      {SOCIAL_LINKS.map((s) => (
        <a
          key={s.id}
          href={s.href}
          target="_blank"
          rel="noreferrer"
          aria-label={`TClean sur ${s.label}`}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm transition hover:-translate-y-0.5"
        >
          <SocialIcon id={s.id} />
          {s.label}
        </a>
      ))}
    </div>
  );
}
