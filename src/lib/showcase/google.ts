/**
 * Загрузка листа Google-таблицы в CSV прямо из браузера.
 *
 * Почему CSV, а не xlsx: эндпоинт /export?format=csv отдаёт CORS-заголовки
 * (проверено: echo Origin + финальный access-control-allow-origin: *),
 * поэтому браузер может скачать лист сам, без сервера. Эндпоинт
 * /export?format=xlsx из браузера недоступен (нет CORS) — его по-прежнему
 * можно скачать вручную и загрузить файлом.
 */

export interface GoogleUrlParts {
  sid: string;
  gid: string | null;
}

/** Разбирает ссылку Google-таблицы: id книги и gid листа. */
export function parseGoogleUrl(url: string): GoogleUrlParts | null {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) return null;
  const g = url.match(/[#&?]gid=(\d+)/);
  return { sid: m[1], gid: g ? g[1] : null };
}

function looksLikeCsv(text: string): boolean {
  const t = text.trimStart();
  return t.length > 0 && !t.startsWith("<");
}

/**
 * Скачивает лист в CSV.
 * Основной путь: /export?format=csv&gid=... — точное выравнивание строк листа,
 * все значения (включая формулы со ссылками на другие листы — напр. автора).
 * Запасной: gviz (/gviz/tq?tqx=out:csv&gid=...) — тоже отдаёт CORS,
 * но (1) пропускает пустые строки, (2) не вычисляет межлистовые ссылки
 * (ячейки с автором приходят пустыми). Парсер по якорям «Team» устойчив к (1);
 * позиционные метки слотов и все числа/имена/ротации читаются корректно.
 */
export async function fetchSheetCsv(url: string): Promise<{ text: string; via: "export" | "gviz" }> {
  const parts = parseGoogleUrl(url);
  if (!parts) {
    throw new Error(
      "Не удалось распознать ссылку. Ожидается адрес вида https://docs.google.com/spreadsheets/d/…(#gid=…).",
    );
  }

  // 1) основной эндпоинт
  try {
    const exportUrl =
      `https://docs.google.com/spreadsheets/d/${parts.sid}/export?format=csv` +
      (parts.gid ? `&gid=${parts.gid}` : "");
    const res = await fetch(exportUrl, { redirect: "follow" });
    const text = await res.text();
    if (res.ok && looksLikeCsv(text)) return { text, via: "export" };
  } catch {
    // сеть/CORS — пробуем запасной эндпоинт ниже
  }

  // 2) gviz-запасной
  try {
    const gvizUrl =
      `https://docs.google.com/spreadsheets/d/${parts.sid}/gviz/tq?tqx=out:csv` +
      (parts.gid ? `&gid=${parts.gid}` : "");
    const res = await fetch(gvizUrl);
    const text = await res.text();
    if (res.ok && looksLikeCsv(text)) return { text, via: "gviz" };
  } catch {
    // переходим к понятной ошибке
  }

  throw new Error(
    "Не удалось скачать лист по ссылке. Проверьте: (1) доступ «Все, у кого есть ссылка — Читатель»; " +
      "(2) что ссылка ведёт на Google-таблицу (docs.google.com/spreadsheets). " +
      "Если лист закрыт — скачайте файл вручную (Файл → Скачать → xlsx или csv) и загрузите его кнопкой выбора файла.",
  );
}
