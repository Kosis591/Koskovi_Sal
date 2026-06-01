import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const firma = localFont({
  variable: "--font-firma",
  display: "swap",
  src: [
    {
      path: "../../public/brand/BR Firma Regular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/brand/BR Firma SemiBold.otf",
      weight: "650",
      style: "normal",
    },
    {
      path: "../../public/brand/BR Firma Bold.otf",
      weight: "700",
      style: "normal",
    },
  ],
});

export const metadata: Metadata = {
  title: "Koškovi | Dostupnost sálu",
  description: "Rezervační kalendář Koškovi.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="cs"
      className={`${firma.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var savedTheme = localStorage.getItem("koskovi-theme");
                var pragueHour = Number(new Intl.DateTimeFormat("cs-CZ", {
                  hour: "numeric",
                  hour12: false,
                  timeZone: "Europe/Prague"
                }).formatToParts(new Date()).find(function (part) {
                  return part.type === "hour";
                })?.value || "12");
                var timeDefaultDark = pragueHour < 6 || pragueHour >= 17;
                var isDark = savedTheme ? savedTheme === "dark" : timeDefaultDark;
                document.documentElement.classList.toggle("dark", isDark);
                document.documentElement.dataset.theme = isDark ? "dark" : "light";
              } catch (_) {}
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
