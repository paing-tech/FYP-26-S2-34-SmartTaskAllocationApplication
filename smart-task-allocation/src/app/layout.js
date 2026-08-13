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
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=account_circle_off%2Cadd%2Calternate_email%2Camp_stories%2Carrow_back%2Carrow_circle_down%2Carrow_circle_up%2Carrow_drop_down%2Carrow_upward%2Cassignment%2Cattach_file%2Cauto_awesome%2Cbar_chart%2Cbusiness_center%2Ccake%2Ccalendar_month%2Ccall%2Ccampaign%2Ccheck%2Ccheck_circle%2Ccheck_small%2Cchevron_left%2Cchevron_right%2Cclose%2Ccontact_support%2Cdelete%2Cdescription%2Cdiamond%2Cdo_not_disturb_on%2Cdownload%2Cedit%2Cedit_off%2Cedit_square%2Cevent_note%2Cexpand_all%2Cexpand_content%2Cfamiliar_face_and_zone%2Cfilter_list%2Chealth_cross%2Chelp%2Chome_pin%2Cid_card%2Cinterests%2Ckey%2Ckeyboard_arrow_down%2Ckeyboard_arrow_right%2Ckeyboard_arrow_up%2Cleft_panel_close%2Cleft_panel_open%2Clock%2Clock_open_right%2Clogout%2Cmail%2Cmobile_3%2Cmood%2Cmore_horiz%2Cperson%2Cperson_add%2Cperson_book%2Cperson_search%2Cphoto_camera%2Cpriority_high%2Cproductivity%2Crepeat%2Crule%2Cschedule%2Cschool%2Csearch%2Csend%2Csentiment_stressed%2Csettings_account_box%2Csocial_leaderboard%2Ctrending_down%2Ctrending_up%2Ctrip%2Cupload_file%2Cview_compact_alt%2Cvisibility%2Cvisibility_off%2Cwc&display=block"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <AppearanceProvider>{children}</AppearanceProvider>
      </body>
    </html>
  );
}
