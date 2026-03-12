"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Explorer" },
  { href: "/news", label: "News" },
  { href: "/org-chart", label: "Org Chart" },
  { href: "/activity", label: "Activity" },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="nav">
      <div className="nav-inner">
        <span className="nav-logo">
          <span className="nav-logo-dot" />
          AMI Labs
        </span>
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`nav-link${pathname === l.href ? " active" : ""}`}
          >
            {l.label}
          </Link>
        ))}
        <span className="nav-powered">
          Powered by{" "}
          <a href="https://frenchtechjournal.com" target="_blank" rel="noopener noreferrer">
            The French Tech Journal
          </a>
        </span>
      </div>
    </nav>
  );
}
