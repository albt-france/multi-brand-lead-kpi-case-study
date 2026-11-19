import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
// Self-hosted fonts (OFL), bundled at build time: no font CDN at runtime.
import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/400-italic.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signal Ledger · Multi-brand lead KPI case study",
  description: "Auditing, attributing and reconciling lead data across five fictional local-service brands. Simulated data except where marked PUBLIC DATA.",
  robots: { index: true, follow: true },
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1,
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#F3EFE6" }, { media: "(prefers-color-scheme: dark)", color: "#0D0F12" }],
};

// Applies a saved theme before first paint (no flash). "auto" follows the OS.
const themeScript = `try{var q=new URLSearchParams(location.search).get("theme");var t=q||localStorage.getItem("lk-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
