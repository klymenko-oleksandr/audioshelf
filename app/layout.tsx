import type { Metadata } from "next";
import { Geist, Geist_Mono, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AudioPlayerProvider } from "@/components/audio-player-context";
import { GlobalAudioPlayer } from "@/components/global-audio-player";
import { AudioProgressPersister } from "@/components/audio-progress-persister";
import { QueryProvider } from "@/components/query-provider";
import packageJson from "@/package.json";

const jetbrainsMono = JetBrains_Mono({subsets:['latin'],variable:'--font-sans'});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Audio Shelf",
  description: "Your audiobook library",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={jetbrainsMono.variable} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <QueryProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <AudioPlayerProvider>
              {children}
              <GlobalAudioPlayer />
              <AudioProgressPersister />
              <footer className="fixed bottom-0 right-0 p-2 text-xs text-muted-foreground/50 z-40">
                v{packageJson.version}
              </footer>
            </AudioPlayerProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
