import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Genshin Impact — Showcase команд",
  description:
    "Динамическая страница команд из таблиц-шоукасов Genshin Impact: загрузка xlsx/CSV или ссылки на Google Sheets, парсинг в браузере, карточки команд с уроном и ротациями.",
  keywords: ["Genshin Impact", "Showcase", "DPR", "DPS", "ротации", "парсер"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        // font-sans — ОБЯЗАТЕЛЕН (баг найден 21.09): без него preflight
        // вешает шрифт на <html> как var(--font-sans) → var(--font-geist-sans),
        // но переменная определена на <body> — на <html> цепочка рвалилась,
        // Geist НЕ применялся вообще никогда: сайт рендерился системным
        // шрифтом (Segoe UI на десктопе, Roboto/SF на мобиле), и метрики
        // текста отличались между платформами — отсюда «на десктопе точка
        // не по центру, на мобильном ровно» (фидбек 21.09). Класс на body
        // вычисляет var(--font-geist-sans) там, где она определена:
        // везде один и тот же шрифт, рендеринг одинаков на всех платформах
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased bg-background text-foreground`}
      >
        {/* Pre-paint: если сохранён компактный вид, помечаем <html> ещё до
            первой отрисовки. Статический HTML содержит ОБА списка команд
            (карточки видны, строки скрыты) — метка + CSS (globals.css)
            меняют их местами ещё до гидрации: строки видны в первом же
            кадре, как карточки. page.tsx синхронизирует состояние со
            сохранённым видом и снимает метку. suppressHydrationWarning на
            <html> уже стоит — атрибут ставится извне, вне React.
            Рядом — скроллбар для Firefox: ::-webkit-scrollbar он не знает,
            красим ползунок стандартным scrollbar-color. Ставим ТОЛЬКО в
            Firefox (CSS.supports по -moz-свойству): в Chromium (121+)
            унаследованный scrollbar-color отключает ::-webkit-scrollbar,
            которыми красится и сужается полоса в Chrome/Safari. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{if(localStorage.getItem("showcase-view")==="rows")document.documentElement.setAttribute("data-flash-view","rows")}catch(e){}' +
              'try{if(window.CSS&&CSS.supports&&CSS.supports("-moz-appearance","none"))document.documentElement.style.scrollbarColor="#3d4d6d transparent"}catch(e){}',
          }}
        />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
