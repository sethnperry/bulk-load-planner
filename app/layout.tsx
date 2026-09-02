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

// viewportFit:"cover" is what makes env(safe-area-inset-*) resolve to
// real, non-zero values at all -- without it every safe-area-inset-*
// used anywhere in this app (Header's own top-inset padding already
// relied on this) is silently 0, and more importantly the page's layout
// viewport stays narrower than the physical screen on a device with an
// on-screen edge (a notch, rounded corners, or -- the concrete case that
// prompted this, confirmed live on a real Android phone in landscape --
// a soft-navigation bar occupying a vertical strip on one side of the
// screen). Without "cover," the browser doesn't extend the page's own
// background into that area at all; it paints its own default (here,
// black) behind/around the app, which is exactly the black bars down
// both edges the user was pointing at. "cover" extends the layout
// viewport (and this app's own backgrounds) all the way to the physical
// screen edges; CalculatorLayoutClient.tsx's Header and ShellChrome then
// add matching env(safe-area-inset-left/right) PADDING (not applied
// here, app-wide, since most routes -- the marketing site, /admin --
// have no reason to care about a landscape phone's nav-bar strip) so
// actual CONTENT still stays clear of the unsafe edges while the
// background color underneath extends the full physical width.
export const viewport: Viewport = {
  themeColor: "#111111",
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
  viewportFit: "cover",
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
