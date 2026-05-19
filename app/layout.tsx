import type React from "react"
import type { Metadata, Viewport } from "next"
import "./globals.css"

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#0f172a",
}

export const metadata: Metadata = {
  title: "Warehouse Ramp Status",
  description: "Professional status board for warehouse loading ramps",
  applicationName: "Warehouse Ramps",
  icons: {
    icon: [{ url: "/warehouse-icon.png" }],
    apple: [{ url: "/warehouse-icon.png" }],
    shortcut: [{ url: "/warehouse-icon.png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Warehouse Ramps",
    statusBarStyle: "default",
  },
  manifest: "/manifest.json",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
