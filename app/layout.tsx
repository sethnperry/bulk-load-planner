import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#111111",
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
};

export const metadata: Metadata = {
  title: "ProTankr",
  description: "Verify your load before you cross the scale.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ProTankr",
  },
  icons: {
    icon: "/icons/favicon.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ colorScheme: "dark", background: "#111111" }}>
      <head>
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#111111" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#111111" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#111111" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ background: "#111111", colorScheme: "dark" }}
      >
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
