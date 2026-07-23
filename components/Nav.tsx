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
          <span className="nav-logo-dot" />
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
          <button className="nav-signin" disabled title="Coming soon">
            Sign In
          </button>
        </div>
      </div>
    </nav>
  );
}
