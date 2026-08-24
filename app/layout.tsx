import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { SITE } from "@/lib/site";
import { getAllArticles } from "@/lib/articles";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const playfairDisplay = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `The Ledger | ${SITE.name}`,
    template: `%s | The Ledger`,
  },
  description:
    "A thought leadership publication by Derrick Odiwuor covering operations, CRM strategy, and the craft of building reliable systems.",
  keywords: [
    "Salesforce Administrator",
    "Operations",
    "CRM Strategy",
    "Thought Leadership",
    "Derrick Odiwuor",
    SITE.location,
  ].filter(Boolean) as string[],
  openGraph: {
    title: `The Ledger | ${SITE.name}`,
    description:
      "Operations, CRM strategy, and the craft of building reliable systems.",
    type: "website",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const articles = getAllArticles();

  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfairDisplay.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-cream dark:bg-deep text-warm-900 dark:text-warm-100 antialiased grain-bg">
        <Providers>
          <Navbar articles={articles} />
          <main className="pt-16">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}