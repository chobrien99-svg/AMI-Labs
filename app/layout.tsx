import type { Metadata } from "next";
import Script from "next/script";
import { Inter } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "AMI Labs Tracker — The French Tech Journal",
  description: "Independent editorial tracker for AMI Labs (Advanced Machine Intelligence) — news, team, investors, funding, and milestones. A special project by The French Tech Journal.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-GMKGT0Y1EC"
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-GMKGT0Y1EC');
        `}</Script>
        <Nav />
        {children}
      </body>
    </html>
  );
}
