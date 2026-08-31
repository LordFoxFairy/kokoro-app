import type { Metadata } from "next";
import "./globals.css";
import { LocaleProvider } from "@/i18n/context";
import { ThemeProvider } from "@/ui/theme/theme-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DEFAULT_BRAND, DEFAULT_WEB_TITLE } from "@/config/brand";

// 首帧防闪：水合前同步定 documentElement 的 .dark class（读 localStorage 偏好 + 系统色）。
// 与 ThemeProvider 同键（kokoro.theme），运行期切换由 Provider 接管。
const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem("kokoro.theme")||"system";var d=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export const metadata: Metadata = {
  title: DEFAULT_WEB_TITLE,
  description: `${DEFAULT_BRAND.name} User Web`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <TooltipProvider>
            <LocaleProvider>{children}</LocaleProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
