import type { Metadata } from "next";
import { Inter } from "next/font/google";
import dynamic from "next/dynamic";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { Footer } from "@/components/layout/footer";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getLocale } from 'next-intl/server';

const CatBotPanel = dynamic(() => import("@/components/catbot/catbot-panel").then(m => ({ default: m.CatBotPanel })), { ssr: false });
const ErrorInterceptorProvider = dynamic(() => import("@/components/system/error-interceptor-provider").then(m => ({ default: m.ErrorInterceptorProvider })), { ssr: false });

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "DoCatFlow",
  description: "Intelligent Workflow & Cat-Driven Solutions",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className="dark">
      <body className={`${inter.className} bg-zinc-950 text-zinc-50 flex h-screen overflow-hidden`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <TooltipProvider>
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
              <main className="flex-1 overflow-y-auto animate-fade-in">
                {children}
              </main>
              <Footer />
            </div>
            <Toaster theme="dark" />
            <ErrorInterceptorProvider />
            <CatBotPanel />
          </TooltipProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
