import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import QueryProvider from "@/app/providers/QueryProvider";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
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
    statusBarStyle: "default",
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
        {/* theme-color itself comes from the `viewport` export below (Next's
            Metadata API) rather than a hardcoded tag here -- nested layouts
            (e.g. app/planner/layout.tsx) override it per-route, and a
            static tag here would coexist with that override ambiguously. */}
        <meta name="color-scheme" content="dark" />
      </head>
      <body
        className={`${outfit.variable} antialiased`}
        style={{ background: "#111111", colorScheme: "dark" }}
      >
        <ServiceWorkerRegistration />
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
