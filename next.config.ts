import type { NextConfig } from "next";

/**
 * Конфигурация сборки.
 *
 * По умолчанию (без переменных окружения) — обычная сборка платформы
 * (standalone, как требуется песочницей).
 *
 * Для GitHub Pages — статическая сборка:
 *   BUILD_MODE=export next build          -> артефакты в out/ (корень сайта)
 *   NEXT_PUBLIC_BASE_PATH=/repo-name      -> basePath для проекта вида
 *                                             username.github.io/repo-name
 * Статическая сборка пишет промежуточные файлы в .next-export и не трогает
 * .next работающего dev-сервера.
 */
const isStaticExport = process.env.BUILD_MODE === "export";

const nextConfig: NextConfig = {
  output: isStaticExport ? "export" : "standalone",
  ...(isStaticExport ? { distDir: ".next-export" } : {}),
  ...(process.env.NEXT_PUBLIC_BASE_PATH
    ? { basePath: process.env.NEXT_PUBLIC_BASE_PATH }
    : {}),
  // dev-сервер: разрешаем превью-домен песочницы (не влияет на статическую сборку)
  allowedDevOrigins: ["*.space-z.ai"],
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
