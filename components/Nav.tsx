"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/news", label: "News" },
  { href: "/research", label: "Research" },
  { href: "/explainers", label: "Explainers" },
  { href: "/timeline", label: "Timeline" },
  { href: "/investors", label: "Investors" },
  { href: "/team", label: "Team" },
  { href: "/org-chart", label: "Org Chart" },
  { href: "/activity", label: "Activity" },
  { href: "/docs", label: "Docs" },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/" className="nav-logo">
          <svg className="nav-reticle" viewBox="0 0 17 17" width="17" height="17" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="6.5" fill="none" stroke="#6EA0FF" strokeWidth="1.2" />
            <line x1="8.5" y1="0" x2="8.5" y2="17" stroke="#6EA0FF" strokeWidth="1" />
            <line x1="0" y1="8.5" x2="17" y2="8.5" stroke="#6EA0FF" strokeWidth="1" />
            <circle cx="8.5" cy="8.5" r="1.5" fill="#6EA0FF" />
          </svg>
          AMI Labs
        </Link>
        <div className="nav-links">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`nav-link${pathname === l.href || (l.href !== "/" && pathname.startsWith(l.href)) ? " active" : ""}`}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="nav-right">
          <span className="nav-powered">
            Powered by{" "}
            <a href="https://frenchtechjournal.com" target="_blank" rel="noopener noreferrer">
              The French Tech Journal
            </a>
          </span>
        </div>
      </div>
    </nav>
  );
}
