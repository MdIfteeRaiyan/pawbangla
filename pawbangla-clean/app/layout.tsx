import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PawBangla — Care starts close to home",
  description: "Find free pet rehoming and local animal care resources across Bangladesh, starting in Chattogram.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "PawBangla — Care starts close to home",
    description: "Free pet rehoming, clinic and shop discovery, care information, community photos and immediate Pet SOS reports.",
    type: "website",
    locale: "en_BD",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
