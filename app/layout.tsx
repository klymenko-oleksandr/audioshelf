import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next"
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AudioPlayerProvider } from "@/components/audio-player-context";
import { GlobalAudioPlayer } from "@/components/global-audio-player";
import { AudioProgressPersister } from "@/components/audio-progress-persister";
import { QueryProvider } from "@/components/query-provider";
import packageJson from "@/package.json";

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  preload: true,
});

export const metadata: Metadata = {
  title: "Audio Shelf",
  description: "Your audiobook library",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={jetbrainsMono.variable} suppressHydrationWarning>
      <body className="antialiased">
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
        <SpeedInsights />
      </body>
    </html>
  );
}
