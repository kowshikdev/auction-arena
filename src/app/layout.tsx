import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/hooks/useAuth";
import { ToastProvider } from "@/components/shared/toast";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Barlow_Condensed({ variable: "--font-display", subsets: ["latin"], weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  title: { default: "AuctionArena", template: "%s · AuctionArena" },
  description: "Run the IPL 2027 mini auction with your friends: real retained squads and purses, live bidding, voice chat and a virtual auctioneer.",
};

export const viewport: Viewport = {
  themeColor: "#05070d",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full">
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
