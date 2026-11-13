import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "leaflet/dist/leaflet.css";
import { AuthReturn } from "@/components/auth/AuthReturn";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Waypoint — Travel Planning",
  description:
    "Organize booking emails in one place and let AI build a personalized trip around your reservations and preferences.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`} suppressHydrationWarning>
        <AuthReturn />
        {children}
      </body>
    </html>
  );
}
