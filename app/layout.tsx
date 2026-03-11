import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "AMI Labs — Intelligence Hub",
  description: "Comprehensive tracker for Advanced Machine Intelligence (AMI Labs) — news, team profiles, investors, and org chart.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
