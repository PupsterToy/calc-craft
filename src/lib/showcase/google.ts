
export interface GoogleUrlParts {
  sid: string;
  gid: string | null;
}

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

export async function fetchSheetCsv(
  url: string,
): Promise<{ text: string; via: "export" | "gviz"; sid: string; gid: string | null }> {
  const parts = parseGoogleUrl(url);
  if (!parts) {
    throw new Error(
      "Не удалось распознать ссылку. Ожидается адрес вида https://docs.google.com/spreadsheets/d/…(#gid=…).",
    );
  }

  try {
    const exportUrl =
      `https://docs.google.com/spreadsheets/d/${parts.sid}/export?format=csv` +
      (parts.gid ? `&gid=${parts.gid}` : "");
    const res = await fetch(exportUrl, { redirect: "follow" });
    const text = await res.text();
    if (res.ok && looksLikeCsv(text)) return { text, via: "export", sid: parts.sid, gid: parts.gid };
  } catch {
  }

  try {
    const gvizUrl =
      `https://docs.google.com/spreadsheets/d/${parts.sid}/gviz/tq?tqx=out:csv` +
      (parts.gid ? `&gid=${parts.gid}` : "");
    const res = await fetch(gvizUrl);
    const text = await res.text();
    if (res.ok && looksLikeCsv(text)) return { text, via: "gviz", sid: parts.sid, gid: parts.gid };
  } catch {
  }

  throw new Error(
    "Не удалось скачать лист по ссылке. Проверьте: (1) доступ «Все, у кого есть ссылка — Читатель»; " +
      "(2) что ссылка ведёт на Google-таблицу (docs.google.com/spreadsheets). " +
      "Если лист закрыт — скачайте файл вручную (Файл → Скачать → xlsx или csv) и загрузите его кнопкой выбора файла.",
  );
}
