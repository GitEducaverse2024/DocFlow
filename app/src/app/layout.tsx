import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DocFlow",
  description: "Gestión de proyectos de documentación inteligente",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <body className={`${inter.className} bg-zinc-950 text-zinc-50 flex h-screen overflow-hidden`}>
        <TooltipProvider>
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
          <Toaster theme="dark" />
        </TooltipProvider>
      </body>
    </html>
  );
}
