import type { Metadata } from "next";
import localFont from "next/font/local";
import { GeistPixelSquare } from "geist/font/pixel";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://json-render.dev"),
  title: "json-render playground",
  description: "Prompt-to-UI playground",
  keywords: [
    "json-render",
    "generative UI",
    "AI UI generation",
    "user-generated interfaces",
    "React components",
    "React Native",
    "guardrails",
    "structured output",
    "dashboard builder",
  ],
  authors: [{ name: "Vercel Labs" }],
  creator: "Vercel Labs",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://json-render.dev",
    siteName: "json-render",
    title: "json-render | The Generative UI Framework",
    description:
      "The Generative UI framework. Generate dashboards, widgets, and apps from prompts — safely constrained to components you define.",
    images: [
      {
        url: "/og",
        width: 1200,
        height: 630,
        alt: "json-render - The Generative UI Framework",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "json-render | The Generative UI Framework",
    description:
      "The Generative UI framework. Generate dashboards, widgets, and apps from prompts — safely constrained to components you define.",
    images: ["/og"],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${GeistPixelSquare.variable}`}
      >
        <ThemeProvider>{children}</ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
