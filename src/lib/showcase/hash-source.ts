
const SOURCE_PARAM = "source";

export function readHashSource(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.location.hash;
    if (!raw || raw[0] !== "#") return null;
    const value = new URLSearchParams(raw.slice(1)).get(SOURCE_PARAM);
    if (!value) return null;
    const url = value.trim();
    return url.length > 0 ? url : null;
  } catch {
    return null;
  }
}

export function writeHashSource(url: string): void {
  if (typeof window === "undefined") return;
  try {
    const params = hashParams();
    params.set(SOURCE_PARAM, url);
    window.history.replaceState(null, "", "#" + params.toString());
  } catch {
  }
}

export function clearHashSource(): void {
  if (typeof window === "undefined") return;
  try {
    const params = hashParams();
    if (!params.has(SOURCE_PARAM)) return;
    params.delete(SOURCE_PARAM);
    if (params.size > 0) {
      window.history.replaceState(null, "", "#" + params.toString());
    } else {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }
  } catch {
  }
}

function hashParams(): URLSearchParams {
  const raw = window.location.hash;
  if (!raw || raw[0] !== "#") return new URLSearchParams();
  try {
    return new URLSearchParams(raw.slice(1));
  } catch {
    return new URLSearchParams();
  }
}
