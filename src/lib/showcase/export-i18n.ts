import type { ElementKey } from "./elements";

export type ExportLang = "ru" | "en";

export const EXPORT_LANGS: readonly ExportLang[] = ["ru", "en"];

export interface ExportStrings {
  headers: readonly string[];
  typeCharacter: string;
  typeExtraDamage: string;
  sheetName: string;
  elementLabel: (k: ElementKey) => string;
}

const RU: ExportStrings = {
  headers: [
    "Слот",
    "Команда",
    "Источник",
    "Тип",
    "Имя",
    "Созвездие",
    "Урон",
    "Доля %",
    "Время на поле с",
    "Оружие",
    "Рефайн",
    "Артефакты",
    "ER",
    "Элемент",
    "Редкость",
    "DPS",
    "DPR",
    "Время ротации с",
    "Ротация",
    "Комментарий",
    "Автор",
    "Дата",
    "Заметка",
  ],
  typeCharacter: "персонаж",
  typeExtraDamage: "доп. урон",
  sheetName: "Карточки",
  elementLabel: (k) => ELEMENT_LABELS_RU[k],
};

const EN: ExportStrings = {
  headers: [
    "Slot",
    "Team",
    "Source",
    "Type",
    "Name",
    "Constellation",
    "Damage",
    "Share %",
    "Field time s",
    "Weapon",
    "Refine",
    "Artifacts",
    "ER",
    "Element",
    "Rarity",
    "DPS",
    "DPR",
    "Rotation time s",
    "Rotation",
    "Comment",
    "Author",
    "Date",
    "Note",
  ],
  typeCharacter: "character",
  typeExtraDamage: "extra damage",
  sheetName: "Cards",
  elementLabel: (k) => k,
};

const ELEMENT_LABELS_RU: Record<ElementKey, string> = {
  Pyro: "Пиро",
  Hydro: "Гидро",
  Anemo: "Анемо",
  Electro: "Электро",
  Dendro: "Дендро",
  Cryo: "Крио",
  Geo: "Гео",
};

const TABLE: Record<ExportLang, ExportStrings> = { ru: RU, en: EN };

export function exportStrings(lang: ExportLang): ExportStrings {
  return TABLE[lang] ?? RU;
}
