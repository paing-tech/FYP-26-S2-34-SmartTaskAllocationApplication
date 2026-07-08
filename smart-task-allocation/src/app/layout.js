import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppearanceProvider } from "@/components/appearance/AppearanceContext";

/* eslint-disable @next/next/google-font-display, @next/next/no-page-custom-font */

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Optima",
  description: "Smart task allocation application",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=amp_stories%2Carrow_drop_down%2Cauto_awesome%2Ccalendar_month%2Ccheck%2Ccheck_small%2Cclose%2Cexpand_all%2Cexpand_content%2Ckeyboard_arrow_down%2Ckeyboard_arrow_right%2Ckeyboard_arrow_up%2Cleft_panel_close%2Cleft_panel_open%2Cperson_add%2Cpriority_high%2Cproductivity%2Crepeat%2Crule%2Cschedule&display=block"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <AppearanceProvider>{children}</AppearanceProvider>
      </body>
    </html>
  );
}
