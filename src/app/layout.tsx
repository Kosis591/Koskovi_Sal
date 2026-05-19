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
  title: "Koskovi | Dostupnost sálu",
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
                var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
                var isDark = savedTheme ? savedTheme === "dark" : prefersDark;
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
