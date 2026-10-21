import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "Humor Admin", template: "%s · Humor Admin" },
  description: "Superadmin console for The Humor Project.",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
