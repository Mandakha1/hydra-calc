/**
 * Politerm Zulu Thermo — full 49 ИТП scheme NAMES index.
 *
 * Lightweight lookup for `_uzvvod.N_schem` / `_ctp.N_schem` integer references
 * (1-49). Used to display scheme name in the Inspector after Zulu .sqlite import.
 *
 * For full topology + components, see `itpSchemes.ts` (15 hand-built detailed
 * schemes). This file is the *index* — name + brief MN translation only.
 *
 * Source: Politerm webhelp /app_schemes_consumer.html (1-49, last 4 added 2021+).
 */

export interface PolitermSchemeIndex {
  no: number;
  name_ru: string;
  name_mn: string;
  brief_mn: string;
  /** "zavisimaya" | "nezavisimaya" */
  conn: "zavisimaya" | "nezavisimaya";
  /** Heating connection family. */
  heating: "direct" | "elevator" | "mixing_pump" | "heat_exchanger" | "pump_supply" | "pump_return";
  /** DHW family. */
  dhw: "none" | "open" | "parallel_1stage" | "sequential_1stage" | "sequential_2stage" | "mixed_2stage";
}

export const POLITERM_SCHEMES: PolitermSchemeIndex[] = [
  { no: 1,  name_ru: "Открытый ГВС + независимое СО и СВ",                       name_mn: "Нээлттэй ГВС + СО, СВ хамааралгүй",            brief_mn: "ГВС магистралаас, СО+СВ ХТС-ээр",        conn: "nezavisimaya", heating: "heat_exchanger", dhw: "open" },
  { no: 2,  name_ru: "Открытый ГВС + элеватор СО",                                name_mn: "Нээлттэй ГВС + СО элеватор",                   brief_mn: "Зөвлөлтийн default, цахилгаангүй",      conn: "zavisimaya",   heating: "elevator",       dhw: "open" },
  { no: 3,  name_ru: "Открытый ГВС + независимое СО",                             name_mn: "Нээлттэй ГВС + СО хамааралгүй",                brief_mn: "СО ХТС, ГВС магистралаас",              conn: "nezavisimaya", heating: "heat_exchanger", dhw: "open" },
  { no: 4,  name_ru: "Открытый ГВС + СО шууд (без подмеса)",                      name_mn: "Нээлттэй ГВС + СО шууд",                       brief_mn: "t1≤105°C-д шууд радиаторт",             conn: "zavisimaya",   heating: "direct",         dhw: "open" },
  { no: 5,  name_ru: "Открытый ГВС + насос на перемычке СО",                      name_mn: "Нээлттэй ГВС + СО перемычка-насос",            brief_mn: "Mix-pump retrofit",                     conn: "zavisimaya",   heating: "mixing_pump",    dhw: "open" },
  { no: 6,  name_ru: "Открытый ГВС + элеватор СО (вариант)",                      name_mn: "Нээлттэй ГВС + СО элеватор (хувилбар)",        brief_mn: "ГВС tap layout өөр",                    conn: "zavisimaya",   heating: "elevator",       dhw: "open" },
  { no: 7,  name_ru: "ГВС двухступ. последовательная + СО элеватор",              name_mn: "ГВС 2-шат цуваа + СО элеватор",                brief_mn: "Магистрал ус ~40% хэмнэлт",             conn: "zavisimaya",   heating: "elevator",       dhw: "sequential_2stage" },
  { no: 8,  name_ru: "ГВС двухступ. последовательная + СО независимая",           name_mn: "ГВС 2-шат цуваа + СО хамааралгүй",            brief_mn: "Шинэ орон сууцны эталон",               conn: "nezavisimaya", heating: "heat_exchanger", dhw: "sequential_2stage" },
  { no: 9,  name_ru: "ГВС двухступ. посл. + насос СО и СВ",                       name_mn: "ГВС 2-шат цуваа + СО, СВ насос",              brief_mn: "Олон функцт, төв агаарлалт",            conn: "zavisimaya",   heating: "mixing_pump",    dhw: "sequential_2stage" },
  { no: 10, name_ru: "ГВС двухступ. посл. + независимое СО и СВ",                 name_mn: "ГВС 2-шат цуваа + СО, СВ хамааралгүй",        brief_mn: "Премиум 4-ХТС, зочид буудал",          conn: "nezavisimaya", heating: "heat_exchanger", dhw: "sequential_2stage" },
  { no: 11, name_ru: "ГВС двухступ. посл. + насос на перемычке СО",               name_mn: "ГВС 2-шат цуваа + СО перемычка-насос",        brief_mn: "Дунд орон сууц, ГВС хэмнэлт",          conn: "zavisimaya",   heating: "mixing_pump",    dhw: "sequential_2stage" },
  { no: 12, name_ru: "ГВС двухступ. посл. + элеватор СО (вариант)",               name_mn: "ГВС 2-шат цуваа + элеватор (хувилбар)",        brief_mn: "Орон сууц, элеваторын Δp хүрэлцэх",     conn: "zavisimaya",   heating: "elevator",       dhw: "sequential_2stage" },
  { no: 13, name_ru: "ГВС двухступ. смешанная + СО элеватор",                     name_mn: "ГВС 2-шат холимог + СО элеватор",             brief_mn: "Орон сууц, ГВС-ийн пик ачаалал том",   conn: "zavisimaya",   heating: "elevator",       dhw: "mixed_2stage" },
  { no: 14, name_ru: "ГВС двухступ. смешанная + СО независимая",                  name_mn: "ГВС 2-шат холимог + СО хамааралгүй",          brief_mn: "Шинэ орон сууцны эталон Москва",       conn: "nezavisimaya", heating: "heat_exchanger", dhw: "mixed_2stage" },
  { no: 15, name_ru: "ГВС двухступ. смеш. + насос СО и СВ",                       name_mn: "ГВС 2-шат холимог + СО, СВ насос",            brief_mn: "Оффис+орон сууц, төв агаарлалт",       conn: "zavisimaya",   heating: "mixing_pump",    dhw: "mixed_2stage" },
  { no: 16, name_ru: "ГВС двухступ. смеш. + независимое СО и СВ",                 name_mn: "ГВС 2-шат холимог + СО, СВ хамааралгүй",      brief_mn: "Премиум 4-ХТС, эмнэлэг",               conn: "nezavisimaya", heating: "heat_exchanger", dhw: "mixed_2stage" },
  { no: 17, name_ru: "ГВС двухступ. смеш. + насосное СО",                         name_mn: "ГВС 2-шат холимог + СО насос",                brief_mn: "Орон сууц, СО CAPEX-хэмнэлт",          conn: "zavisimaya",   heating: "mixing_pump",    dhw: "mixed_2stage" },
  { no: 18, name_ru: "ГВС двухступ. смеш. + элеватор СО",                         name_mn: "ГВС 2-шат холимог + элеватор",                brief_mn: "Элеваторын Δp хүрэлцэх",                conn: "zavisimaya",   heating: "elevator",       dhw: "mixed_2stage" },
  { no: 19, name_ru: "ГВС параллельная одноступ. + элеватор СО",                  name_mn: "ГВС параллел 1-шат + СО элеватор",            brief_mn: "Жижиг орон сууц",                       conn: "zavisimaya",   heating: "elevator",       dhw: "parallel_1stage" },
  { no: 20, name_ru: "ГВС параллельная одноступ. + СО независимая",               name_mn: "ГВС параллел 1-шат + СО хамааралгүй",         brief_mn: "Шинэ дунд оврын орон сууц",            conn: "nezavisimaya", heating: "heat_exchanger", dhw: "parallel_1stage" },
  { no: 21, name_ru: "ГВС параллельная + насос на перемычке СО и СВ",             name_mn: "ГВС параллел + СО, СВ перемычка-насос",       brief_mn: "Олон функцт оффис",                     conn: "zavisimaya",   heating: "mixing_pump",    dhw: "parallel_1stage" },
  { no: 22, name_ru: "ГВС параллельная + независимое СО и СВ",                    name_mn: "ГВС параллел + СО, СВ хамааралгүй",           brief_mn: "Зочид буудал, оффис",                   conn: "nezavisimaya", heating: "heat_exchanger", dhw: "parallel_1stage" },
  { no: 23, name_ru: "ГВС параллельная + насос на перемычке СО",                  name_mn: "ГВС параллел + СО перемычка-насос",           brief_mn: "Орон сууц, СО хямд",                    conn: "zavisimaya",   heating: "mixing_pump",    dhw: "parallel_1stage" },
  { no: 24, name_ru: "ГВС параллельная + элеватор СО",                            name_mn: "ГВС параллел + СО элеватор",                  brief_mn: "Хуучин орон сууцны retrofit",          conn: "zavisimaya",   heating: "elevator",       dhw: "parallel_1stage" },
  { no: 25, name_ru: "Потребитель с вентиляционной нагрузкой",                    name_mn: "Зөвхөн агаарлалттай хэрэглэгч",                brief_mn: "AHU калорифер",                          conn: "nezavisimaya", heating: "heat_exchanger", dhw: "none" },
  { no: 26, name_ru: "Открытый ГВС с циркуляционной линией",                      name_mn: "Нээлттэй ГВС эргэлтийн loop-той",              brief_mn: "Их давхар орон сууц",                   conn: "zavisimaya",   heating: "direct",         dhw: "open" },
  { no: 27, name_ru: "Только подогреватели ГВС",                                  name_mn: "Зөвхөн ГВС халаагуурь",                        brief_mn: "Зочид буудал, угаалгын газар",         conn: "nezavisimaya", heating: "direct",         dhw: "parallel_1stage" },
  { no: 28, name_ru: "ГВС параллельная + СО шууд",                                name_mn: "ГВС параллел + СО шууд",                       brief_mn: "Жижиг агуулах + ГВС",                   conn: "zavisimaya",   heating: "direct",         dhw: "parallel_1stage" },
  { no: 29, name_ru: "ГВС последовательная одноступ. + элеватор СО",              name_mn: "ГВС 1-шат цуваа + СО элеватор",                brief_mn: "Жижиг орон сууц",                       conn: "zavisimaya",   heating: "elevator",       dhw: "sequential_1stage" },
  { no: 30, name_ru: "ГВС последовательная одноступ. + насос СО",                 name_mn: "ГВС 1-шат цуваа + СО перемычка-насос",        brief_mn: "Дунд орон сууц retrofit",               conn: "zavisimaya",   heating: "mixing_pump",    dhw: "sequential_1stage" },
  { no: 31, name_ru: "ГВС последовательная + независимое СО и СВ",                name_mn: "ГВС 1-шат цуваа + СО, СВ хамааралгүй",        brief_mn: "Олон функцт цогцолбор",                conn: "nezavisimaya", heating: "heat_exchanger", dhw: "sequential_1stage" },
  { no: 32, name_ru: "ГВС двухступ. смеш. + СО шууд",                             name_mn: "ГВС 2-шат холимог + СО шууд",                  brief_mn: "Нам t° график",                         conn: "zavisimaya",   heating: "direct",         dhw: "mixed_2stage" },
  { no: 33, name_ru: "ГВС двухступ. посл. + СО шууд",                             name_mn: "ГВС 2-шат цуваа + СО шууд",                    brief_mn: "Нам t° график орон сууц",              conn: "zavisimaya",   heating: "direct",         dhw: "sequential_2stage" },
  { no: 34, name_ru: "Только ГВС двухступ. смешанная",                            name_mn: "Зөвхөн ГВС 2-шат холимог",                     brief_mn: "Зочид буудал, СО өөр эх үүсвэрээс",   conn: "nezavisimaya", heating: "direct",         dhw: "mixed_2stage" },
  { no: 35, name_ru: "ГВС последовательная одноступ. + СО шууд",                  name_mn: "ГВС 1-шат цуваа + СО шууд",                    brief_mn: "Нам t°, ГВС жижиг",                     conn: "zavisimaya",   heating: "direct",         dhw: "sequential_1stage" },
  { no: 36, name_ru: "Открытый ГВС + насос на подающем СО",                       name_mn: "Нээлттэй ГВС + СО supply booster",            brief_mn: "Магистрал Δp бага хороолол",            conn: "zavisimaya",   heating: "pump_supply",    dhw: "open" },
  { no: 37, name_ru: "Открытый ГВС + насос на обратном СО",                       name_mn: "Нээлттэй ГВС + СО буцах booster",             brief_mn: "Магистрал буцах Δp шаардсан",          conn: "zavisimaya",   heating: "pump_return",    dhw: "open" },
  { no: 38, name_ru: "ГВС параллельная + насос на подающем СО",                   name_mn: "ГВС параллел + СО supply booster",            brief_mn: "Зайтай орон сууцны массив",            conn: "zavisimaya",   heating: "pump_supply",    dhw: "parallel_1stage" },
  { no: 39, name_ru: "ГВС параллельная + насос на обратном СО",                   name_mn: "ГВС параллел + СО буцах booster",             brief_mn: "Магистрал буцах Δp",                    conn: "zavisimaya",   heating: "pump_return",    dhw: "parallel_1stage" },
  { no: 40, name_ru: "ГВС двухступ. смеш. + насос на подающем СО",                name_mn: "ГВС 2-шат холимог + СО supply booster",       brief_mn: "Зайтай массив, ГВС-том",                conn: "zavisimaya",   heating: "pump_supply",    dhw: "mixed_2stage" },
  { no: 41, name_ru: "ГВС двухступ. смеш. + насос на обратном СО",                name_mn: "ГВС 2-шат холимог + СО буцах booster",        brief_mn: "Буцах Δp + ГВС-том",                    conn: "zavisimaya",   heating: "pump_return",    dhw: "mixed_2stage" },
  { no: 42, name_ru: "ГВС двухступ. посл. + насос на подающем СО",                name_mn: "ГВС 2-шат цуваа + СО supply booster",         brief_mn: "Зайтай массив",                         conn: "zavisimaya",   heating: "pump_supply",    dhw: "sequential_2stage" },
  { no: 43, name_ru: "ГВС двухступ. посл. + насос на обратном СО",                name_mn: "ГВС 2-шат цуваа + СО буцах booster",          brief_mn: "Буцах Δp шаардсан төгсгөл",            conn: "zavisimaya",   heating: "pump_return",    dhw: "sequential_2stage" },
  { no: 44, name_ru: "Подключение к обратному трубопроводу",                      name_mn: "Хэрэглэгчийг буцах шугаманд холбох",          brief_mn: "Cascading нам t° хэрэглэгч",            conn: "zavisimaya",   heating: "direct",         dhw: "none" },
  { no: 45, name_ru: "Только СО шууд (без ГВС)",                                  name_mn: "Зөвхөн СО шууд (ГВС-гүй)",                     brief_mn: "Жижиг агуулах, гараж — 2021+",         conn: "zavisimaya",   heating: "direct",         dhw: "none" },
  { no: 46, name_ru: "Только открытый ГВС (без отопления)",                       name_mn: "Зөвхөн нээлттэй ГВС",                          brief_mn: "Зуны ГВС-станц — 2021+",                conn: "zavisimaya",   heating: "direct",         dhw: "open" },
  { no: 47, name_ru: "Открытый ГВС + насос на подающем (вентиль после)",          name_mn: "Нээлттэй ГВС + supply pump-after-valve",      brief_mn: "Нэмэлт vent layout",                    conn: "zavisimaya",   heating: "pump_supply",    dhw: "open" },
  { no: 48, name_ru: "Открытый ГВС + насос на обратном (вентиль после)",          name_mn: "Нээлттэй ГВС + return pump-after-valve",      brief_mn: "Нэмэлт vent layout",                    conn: "zavisimaya",   heating: "pump_return",    dhw: "open" },
  { no: 49, name_ru: "Расширенная схема с раздельной арматурой",                  name_mn: "Тусгаарлагдсан арматуртай өргөтгөл",          brief_mn: "Politerm 2021+ retrofit",               conn: "zavisimaya",   heating: "mixing_pump",    dhw: "open" },
];

/** Fast lookup by Politerm n_schem id (1..49). */
export const POLITERM_SCHEME_BY_NO: Map<number, PolitermSchemeIndex> = new Map(
  POLITERM_SCHEMES.map((s) => [s.no, s] as const),
);

/** Get human-readable Mongolian name for a given Politerm scheme number. */
export function politermSchemeName(no: number): string {
  const entry = POLITERM_SCHEME_BY_NO.get(no);
  return entry ? `№${no} ${entry.name_mn}` : `Politerm scheme №${no}`;
}
