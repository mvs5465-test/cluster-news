import type { Metadata } from "next";
import { Cormorant_Garamond, Source_Sans_3 } from "next/font/google";
import Link from "next/link";
import { SITE_NAME } from "@/lib/config";
import "./globals.css";

const headlineFont = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-headline",
});

const bodyFont = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: SITE_NAME,
  description: "A modern self-hosted news front page for curated feeds and briefings.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${headlineFont.variable} ${bodyFont.variable}`}>
        <div className="site-shell">
          <header className="site-header">
            <div className="site-header__masthead">
              <p className="site-kicker">Self-hosted world desk</p>
              <Link href="/" className="site-logo">
                {SITE_NAME}
              </Link>
            </div>
            <nav className="site-nav" aria-label="Primary">
              <Link href="/">Latest</Link>
              <Link href="/briefing">Briefing</Link>
              <Link href="/saved">Saved</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
