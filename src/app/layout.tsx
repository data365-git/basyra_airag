import type { Metadata, Viewport } from "next";
import { Toaster } from "react-hot-toast";
import { LanguageProvider } from "@/providers/LanguageProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    template: "%s | AttendTrack",
    default: "AttendTrack — Training Attendance",
  },
  description: "Track attendance across multiple trainings with QR code scanning",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AttendTrack",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#3B82F6",
  width: "device-width",
  initialScale: 1,
  // NOTE: maximumScale and userScalable intentionally removed —
  // iOS Safari 15+ blocks getUserMedia when zoom is disabled via viewport meta
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        {/* Inline fallback: survives service worker caching + Railway proxy stripping */}
        <meta http-equiv="Permissions-Policy" content="camera=*" />
      </head>
      <body className="h-full bg-gray-50 font-sans antialiased">
        <LanguageProvider>
          {children}
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 3000,
            }}
          />
        </LanguageProvider>
      </body>
    </html>
  );
}
