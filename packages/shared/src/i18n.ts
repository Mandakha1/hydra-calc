// Монгол UI мөрүүдийн single source of truth.
// Faza 3/4-т UI-тай холбож, англи хувилбар нэмнэ.

export const mn = {
  common: {
    loading: "Ачааллаж байна...",
    error: "Алдаа гарлаа",
    save: "Хадгалах",
    cancel: "Цуцлах",
    delete: "Устгах",
    edit: "Засах",
    close: "Хаах",
    back: "Буцах",
    confirm: "Баталгаажуулах",
    yes: "Тийм",
    no: "Үгүй",
  },
  auth: {
    login: "Нэвтрэх",
    register: "Бүртгүүлэх",
    logout: "Гарах",
    email: "И-мэйл",
    password: "Нууц үг",
    forgotPassword: "Нууц үг мартсан?",
    invalidCredentials: "И-мэйл эсвэл нууц үг буруу байна",
    emailTaken: "Энэ и-мэйл бүртгэлтэй байна",
  },
  project: {
    newProject: "Шинэ төсөл",
    myProjects: "Миний төслүүд",
    projectName: "Төслийн нэр",
    share: "Хуваалцах",
    export: "Экспорт",
    exportExcel: "Excel-д экспортлох",
    exportDxf: "DXF-д экспортлох",
  },
  hydraulic: {
    scheme: "Схем",
    heatLoad: "Дулааны ачаалал",
    hydraulicCalc: "Гидравлик тооцоо",
    pipes: "Шугам хоолой",
    nodes: "Зангилаа",
    pumps: "Насос",
    normsCheck: "Норм шалгалт",
  },
} as const;

export type MnDict = typeof mn;
