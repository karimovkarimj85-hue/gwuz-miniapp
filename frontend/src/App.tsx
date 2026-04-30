import { useCallback, useEffect, useMemo, useState } from "react";
import {
  VscAccount,
  VscCommentDiscussion,
  VscEdit,
  VscHome,
  VscSettingsGear,
} from "react-icons/vsc";

import CenterModal from "./components/CenterModal.js";
import Dock from "./components/Dock";
import AnimatedContent from "./AnimatedContent";
import TextType from "./TextType";
import Threads from "./Threads";
import { formatUzPhoneDisplay, normalizeUzPhone } from "./lib/phoneUz";

type SheetMode =
  | null
  | "login"
  | "pickRole"
  | "worker"
  | "employer"
  | "forgot";
type ForgotPhase = "phone" | "code";
type AppTab = "orders" | "chats" | "profile" | "settings";

interface SpecItem {
  id: string;
  label_ru: string;
}

interface UserOut {
  telegram_id: number;
  username: string | null;
  display_name: string | null;
  role: string | null;
  phone_e164?: string | null;
  profile_completed?: boolean;
  age?: number | null;
  about?: string | null;
  specializations?: string[];
  employer_kind?: string | null;
  organization_name?: string | null;
  organization_inn?: string | null;
  employer_note?: string | null;
}

type OrderStatus = "active" | "inactive" | "in_progress" | "completed" | "cancelled";
type ApplicationStatus = "new" | "reviewing" | "approved" | "rejected";
type PriceMode = "fixed" | "negotiable";
type DevUserRecord = { password: string; user: UserOut };
type ChatMessage = { id: string; from: "me" | "them"; text: string; ts: string };
type UploadStub = { name: string; mime: string; size: number };
type LangCode = "ru" | "uz_lat" | "uz_cyrl" | "en";
type ThemeCode = "dark" | "light";

type OrderItem = {
  id: string;
  ownerId: number;
  title: string;
  categoryId: string;
  minRating: number;
  requiresEducation: boolean;
  description: string;
  priceUzs: number;
  priceMode: PriceMode;
  isActive: boolean;
  status: OrderStatus;
  createdAt: string;
};

type ApplicationItem = {
  id: string;
  orderId: string;
  workerId: number;
  workerName: string;
  workerRating: number;
  message: string;
  status: ApplicationStatus;
  proposedPriceUzs?: number | null;
};

/** 9 цифр без префикса 998 → маска +998 … */
function phoneDigitsToDisplay(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 9);
  return formatUzPhoneDisplay(`998${d}`);
}

function normPhone9(digits: string): string {
  const d = digits.replace(/\D/g, "").replace(/^998/, "").slice(0, 9);
  return normalizeUzPhone(d);
}

const THREADS_RGB: [number, number, number] = [0.9, 0.9, 0.93];

const MIN_PASS = 4;
const MIN_WORKER_AGE = 16;
const DEV_BYPASS_TELEGRAM = true; // временно для локальной верстки/тестов без Telegram

const PRICE_HINTS: Record<string, number> = {
  plumber: 450_000,
  electrician: 500_000,
  builder: 550_000,
  mover: 300_000,
  cleaner: 220_000,
  welder: 600_000,
  cook: 350_000,
  gardener: 260_000,
  driver: 400_000,
  painter: 420_000,
  tile_setter: 520_000,
  hvac: 620_000,
  handyman: 320_000,
  it: 700_000,
  other: 300_000,
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  active: "Активен",
  inactive: "Не активен",
  in_progress: "В процессе",
  completed: "Выполнен",
  cancelled: "Отменен",
};

const DEV_USERS_KEY = "gwuz_dev_users_v1";
const DEV_PREFS_KEY = "gwuz_dev_prefs_v1";
const DEV_RATINGS_KEY = "gwuz_dev_ratings_v1";
const DEV_DOCS_KEY = "gwuz_dev_docs_v1";
const DEV_AVATARS_KEY = "gwuz_dev_avatars_v1";

function loadDevUsers(): Record<string, DevUserRecord> {
  try {
    const raw = localStorage.getItem(DEV_USERS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, DevUserRecord>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveDevUsers(data: Record<string, DevUserRecord>) {
  localStorage.setItem(DEV_USERS_KEY, JSON.stringify(data));
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

function avg(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export default function App() {
  const tg = window.Telegram?.WebApp;
  const initData = tg?.initData ?? "";
  const tgUser = tg?.initDataUnsafe?.user as
    | { photo_url?: string; first_name?: string; last_name?: string; username?: string }
    | undefined;

  const [sheetMode, setSheetMode] = useState<SheetMode>(null);
  const [user, setUser] = useState<UserOut | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [specs, setSpecs] = useState<SpecItem[]>([]);

  const [loginPhone, setLoginPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [regPhone, setRegPhone] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPassword2, setRegPassword2] = useState("");

  const [wAge, setWAge] = useState("");
  const [wAbout, setWAbout] = useState("");
  const [wSpecs, setWSpecs] = useState<Set<string>>(new Set());

  const [eKind, setEKind] = useState<"person" | "organization">("person");
  const [eOrg, setEOrg] = useState("");
  const [eInn, setEInn] = useState("");
  const [eNote, setENote] = useState("");

  const [forgotPhase, setForgotPhase] = useState<ForgotPhase>("phone");
  const [forgotPhone, setForgotPhone] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotNewPass, setForgotNewPass] = useState("");
  const [forgotNewPass2, setForgotNewPass2] = useState("");

  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState("");
  const [activeTab, setActiveTab] = useState<AppTab>("orders");
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState("");
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMessage[]>>({});
  const [acceptConfirmOpen, setAcceptConfirmOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [filterCategoryId, setFilterCategoryId] = useState("all");
  const [filterStatus, setFilterStatus] = useState<"all" | OrderStatus>("all");
  const [filterMinRating, setFilterMinRating] = useState("0");

  const [orderCategoryId, setOrderCategoryId] = useState("");
  const [orderMinRating, setOrderMinRating] = useState("4.0");
  const [orderEdu, setOrderEdu] = useState(false);
  const [orderDesc, setOrderDesc] = useState("");
  const [orderPrice, setOrderPrice] = useState("");
  const [orderPriceMode, setOrderPriceMode] = useState<PriceMode>("fixed");
  const [orderStatus, setOrderStatus] = useState<OrderStatus>("active");
  const [orderIsActive, setOrderIsActive] = useState(true);
  const [focusOrderId, setFocusOrderId] = useState<string | null>(null);

  const userKey = useMemo(() => String(user?.telegram_id ?? "anon"), [user?.telegram_id]);
  const [notifOrdersOn, setNotifOrdersOn] = useState(false);
  const [notifChatsOn, setNotifChatsOn] = useState(true);
  const [lang, setLang] = useState<LangCode>("ru");
  const [theme, setTheme] = useState<ThemeCode>("dark");
  const [privacyShowPhone, setPrivacyShowPhone] = useState(true);
  const [privacyShowAge, setPrivacyShowAge] = useState(true);
  const [workSchedule, setWorkSchedule] = useState<"any" | "day" | "evening" | "weekend">("any");
  const [avatarOverride, setAvatarOverride] = useState("");
  const [eduFiles, setEduFiles] = useState<UploadStub[]>([]);
  const [companyFiles, setCompanyFiles] = useState<UploadStub[]>([]);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [settingsPane, setSettingsPane] = useState<null | "notifications" | "language" | "theme" | "privacy">(null);
  const [pAge, setPAge] = useState("");
  const [pAbout, setPAbout] = useState("");
  const [pKind, setPKind] = useState<"person" | "organization">("person");
  const [pOrg, setPOrg] = useState("");
  const [pInn, setPInn] = useState("");
  const [ratingAvg, setRatingAvg] = useState(5.0);
  const [ratingCount, setRatingCount] = useState(1);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [rateTargetWorkerId, setRateTargetWorkerId] = useState<number | null>(null);
  const [rateScore, setRateScore] = useState("5");
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [applyOrderId, setApplyOrderId] = useState<string | null>(null);
  const [applyMsg, setApplyMsg] = useState("Готов взять этот заказ.");
  const [applyOffer, setApplyOffer] = useState("");
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  useEffect(() => {
    tg?.expand();
    tg?.ready();
  }, [tg]);

  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const orderId = u.searchParams.get("orderId") || u.searchParams.get("order_id");
      if (orderId) {
        setActiveTab("orders");
        setFocusOrderId(orderId);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetch("/api/meta/specializations")
      .then((r) => r.json())
      .then((data: SpecItem[]) => setSpecs(Array.isArray(data) ? data : []))
      .catch(() => setSpecs([]));
  }, []);

  useEffect(() => {
    if (!initData) {
      setMeLoading(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/me?init_data=${encodeURIComponent(initData)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: UserOut | null) => {
        if (!cancelled && data) setUser(data);
      })
      .finally(() => {
        if (!cancelled) setMeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initData]);

  const isTelegram = useMemo(() => Boolean(initData?.length), [initData]);
  const onboarded = user?.profile_completed === true;
  const avatarUrl = useMemo(
    () => avatarOverride || (tgUser?.photo_url ? String(tgUser.photo_url) : ""),
    [avatarOverride, tgUser?.photo_url],
  );

  useEffect(() => {
    if (!user) return;
    const prefs = loadJson<Record<string, Record<string, unknown>>>(DEV_PREFS_KEY, {});
    setNotifOrdersOn(Boolean(prefs[userKey]?.notifOrdersOn));
    setNotifChatsOn(prefs[userKey]?.notifChatsOn !== false);
    setLang((prefs[userKey]?.lang as LangCode) || "ru");
    setTheme((prefs[userKey]?.theme as ThemeCode) || "dark");
    setPrivacyShowPhone(prefs[userKey]?.privacyShowPhone !== false);
    setPrivacyShowAge(prefs[userKey]?.privacyShowAge !== false);
    setWorkSchedule(((prefs[userKey]?.workSchedule as string) || "any") as "any" | "day" | "evening" | "weekend");

    const docs = loadJson<Record<string, { eduFiles?: UploadStub[]; companyFiles?: UploadStub[] }>>(DEV_DOCS_KEY, {});
    setEduFiles(Array.isArray(docs[userKey]?.eduFiles) ? (docs[userKey]?.eduFiles as UploadStub[]) : []);
    setCompanyFiles(Array.isArray(docs[userKey]?.companyFiles) ? (docs[userKey]?.companyFiles as UploadStub[]) : []);

    const ratings = loadJson<Record<string, number[]>>(DEV_RATINGS_KEY, {});
    const votes = Array.isArray(ratings[userKey]) && ratings[userKey].length ? ratings[userKey] : [5];
    setRatingAvg(avg(votes));
    setRatingCount(votes.length);

    const avatars = loadJson<Record<string, string>>(DEV_AVATARS_KEY, {});
    setAvatarOverride(avatars[userKey] || "");

    setPAge(user.age != null ? String(user.age) : "");
    setPAbout(user.about ?? "");
    const kind = (user.employer_kind === "organization" ? "organization" : "person") as "person" | "organization";
    setPKind(kind);
    setPOrg(user.organization_name ?? "");
    setPInn(user.organization_inn ?? "");
  }, [user, userKey]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const closeSheet = useCallback(() => {
    setSheetMode(null);
    setBanner("");
    setBusy(false);
    setForgotPhase("phone");
    setForgotCode("");
    setForgotNewPass("");
    setForgotNewPass2("");
    setForgotPhone("");
  }, []);

  const apiErr = async (res: Response): Promise<string> => {
    const body = (await res.json().catch(() => ({}))) as { detail?: unknown };
    const d = body.detail;
    if (Array.isArray(d))
      return d.map((x: { msg?: string }) => x.msg || "").filter(Boolean).join(" ");
    return String(d ?? res.statusText);
  };

  const persistPrefs = useCallback(
    (
      patch: Partial<{
        notifOrdersOn: boolean;
        notifChatsOn: boolean;
        lang: LangCode;
        theme: ThemeCode;
        privacyShowPhone: boolean;
        privacyShowAge: boolean;
        workSchedule: "any" | "day" | "evening" | "weekend";
      }>,
    ) => {
      const prefs = loadJson<Record<string, Record<string, unknown>>>(DEV_PREFS_KEY, {});
      prefs[userKey] = { ...(prefs[userKey] || {}), ...patch };
      saveJson(DEV_PREFS_KEY, prefs);
    },
    [userKey],
  );

  const persistDocs = useCallback(
    (patch: { eduFiles?: UploadStub[]; companyFiles?: UploadStub[] }) => {
      const docs = loadJson<Record<string, { eduFiles?: UploadStub[]; companyFiles?: UploadStub[] }>>(DEV_DOCS_KEY, {});
      docs[userKey] = { ...(docs[userKey] || {}), ...patch };
      saveJson(DEV_DOCS_KEY, docs);
    },
    [userKey],
  );

  const addRatingVoteFor = useCallback(
    (targetTelegramId: number, score: number) => {
      const targetKey = String(targetTelegramId);
      const s = Number.isFinite(score) ? Math.max(0, Math.min(5, score)) : 0;
      const ratings = loadJson<Record<string, number[]>>(DEV_RATINGS_KEY, {});
      const votes = Array.isArray(ratings[targetKey]) ? ratings[targetKey].slice(0) : [];
      if (!votes.length) votes.push(5);
      votes.push(s);
      ratings[targetKey] = votes;
      saveJson(DEV_RATINGS_KEY, ratings);
      if (targetKey === userKey) {
        setRatingAvg(avg(votes));
        setRatingCount(votes.length);
      }
    },
    [userKey],
  );

  const setAvatarForMe = useCallback(
    (dataUrl: string) => {
      const avatars = loadJson<Record<string, string>>(DEV_AVATARS_KEY, {});
      if (dataUrl) avatars[userKey] = dataUrl;
      else delete avatars[userKey];
      saveJson(DEV_AVATARS_KEY, avatars);
      setAvatarOverride(dataUrl);
    },
    [userKey],
  );

  const submitRating = useCallback(() => {
    if (!rateTargetWorkerId) return;
    const val = Number(String(rateScore).replace(",", "."));
    addRatingVoteFor(rateTargetWorkerId, val);
    setRateModalOpen(false);
    setRateTargetWorkerId(null);
    setBanner("");
  }, [addRatingVoteFor, rateScore, rateTargetWorkerId]);

  const openApply = useCallback(
    (order: OrderItem) => {
      setApplyOrderId(order.id);
      setApplyMsg("Готов взять этот заказ.");
      setApplyOffer(order.priceMode === "negotiable" ? String(order.priceUzs) : "");
      setApplyModalOpen(true);
      setBanner("");
    },
    [],
  );

  const submitApply = useCallback(() => {
    if (!user || user.role !== "worker") return;
    const order = orders.find((o) => o.id === applyOrderId);
    if (!order) return;
    let offer: number | null = null;
    if (order.priceMode === "negotiable") {
      const p = Number.parseInt(String(applyOffer || "").replace(/\D/g, ""), 10);
      if (Number.isNaN(p) || p < 50_000) {
        setBanner("Укажите сумму (от 50 000 сум).");
        return;
      }
      offer = p;
    }
    setApplications((prev) => [
      ...prev,
      {
        id: `app-${Date.now()}`,
        orderId: order.id,
        workerId: user.telegram_id || 1,
        workerName: user.display_name || "Исполнитель",
        workerRating: 4.5,
        message: applyMsg.trim() || "Отклик",
        status: "new",
        proposedPriceUzs: offer,
      },
    ]);
    setApplyModalOpen(false);
    setApplyOrderId(null);
    setBanner("");
  }, [applyMsg, applyOffer, applyOrderId, orders, user]);

  const doLogout = useCallback(() => {
    setUser(null);
    setSheetMode(null);
    setActiveTab("orders");
    setSelectedChatId(null);
    setProfileOpen(false);
    setProfileEditOpen(false);
    setOrderModalOpen(false);
    setFilterModalOpen(false);
    setAcceptConfirmOpen(false);
    setSettingsPane(null);
    setRateModalOpen(false);
    setApplyModalOpen(false);
    setLogoutConfirmOpen(false);
    setBanner("");
  }, []);

  const saveProfile = useCallback(() => {
    if (!user) return;
    const nextAge = pAge.trim() ? Number(pAge.trim()) : null;
    if (pAge.trim() && (!Number.isFinite(nextAge) || nextAge! < 0 || nextAge! > 120)) {
      setBanner("Возраст указан неверно.");
      return;
    }

    const next: UserOut = {
      ...user,
      age: nextAge,
      about: pAbout.trim() ? pAbout.trim() : null,
      employer_kind: user.role === "employer" ? pKind : user.employer_kind,
      organization_name: user.role === "employer" && pKind === "organization" ? (pOrg.trim() || null) : null,
      organization_inn: user.role === "employer" && pKind === "organization" ? (pInn.trim() || null) : null,
    };
    setUser(next);

    if (DEV_BYPASS_TELEGRAM && !initData) {
      // обновим локальный профиль по телефону (если есть)
      const phoneKey = (next.phone_e164 || "").replace("+998", "").replace(/\D/g, "");
      if (phoneKey) {
        const db = loadDevUsers();
        if (db[phoneKey]) {
          db[phoneKey] = { ...db[phoneKey], user: next };
          saveDevUsers(db);
        }
      }
    }

    setProfileEditOpen(false);
    setBanner("");
  }, [initData, pAbout, pAge, pInn, pKind, pOrg, user]);

  const submitLogin = useCallback(async () => {
    setBanner("");
    if (!initData && !DEV_BYPASS_TELEGRAM) {
      setBanner("Откройте приложение через Telegram.");
      return;
    }
    let norm: string;
    try {
      norm = normPhone9(loginPhone);
    } catch (e) {
      setBanner(String(e instanceof Error ? e.message : "Неверный номер"));
      return;
    }
    if (!initData && DEV_BYPASS_TELEGRAM) {
      const db = loadDevUsers();
      const rec = db[norm];
      if (!rec) {
        setBanner("Локальный профиль не найден. Сначала зарегистрируйтесь.");
        return;
      }
      if (rec.password !== loginPassword.trim()) {
        setBanner("Неверный пароль.");
        return;
      }
      setUser(rec.user);
      closeSheet();
      return;
    }
    if (!loginPassword.trim()) {
      setBanner("Введите пароль.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          init_data: initData,
          phone: norm,
          password: loginPassword,
        }),
      });
      if (!res.ok) {
        setBanner(await apiErr(res));
        return;
      }
      const data = (await res.json()) as UserOut;
      setUser(data);
      closeSheet();
      setLoginPhone("");
      setLoginPassword("");
    } catch {
      setBanner("Нет связи с сервером.");
    } finally {
      setBusy(false);
    }
  }, [closeSheet, initData, loginPassword, loginPhone]);

  const submitForgotPhone = useCallback(async () => {
    setBanner("");
    let norm: string;
    try {
      norm = normPhone9(forgotPhone);
    } catch (e) {
      setBanner(String(e instanceof Error ? e.message : "Неверный номер"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/forgot-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: norm }),
      });
      if (!res.ok) {
        setBanner(await apiErr(res));
        return;
      }
      const j = (await res.json()) as { detail?: string };
      const msg =
        typeof j.detail === "string"
          ? j.detail
          : "Если номер зарегистрирован, проверьте Telegram.";
      setForgotNewPass("");
      setForgotNewPass2("");
      setForgotCode("");
      setForgotPhase("code");
      setBanner(msg);
    } catch {
      setBanner("Нет связи с сервером.");
    } finally {
      setBusy(false);
    }
  }, [forgotPhone]);

  const submitForgotFinish = useCallback(async () => {
    setBanner("");
    if (!initData && !DEV_BYPASS_TELEGRAM) {
      setBanner("Откройте приложение через Telegram.");
      return;
    }
    let norm: string;
    try {
      norm = normPhone9(forgotPhone);
    } catch (e) {
      setBanner(String(e instanceof Error ? e.message : "Неверный номер"));
      return;
    }

    const codeClean = forgotCode.replace(/\s/g, "");
    if (codeClean.length < 4) {
      setBanner("Введите код из Telegram.");
      return;
    }

    const p = forgotNewPass.trim();
    if (p.length < MIN_PASS) {
      setBanner(`Пароль минимум ${MIN_PASS} символов.`);
      return;
    }
    if (p !== forgotNewPass2.trim()) {
      setBanner("Пароли не совпадают.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          init_data: initData,
          phone: norm,
          code: forgotCode,
          new_password: p,
        }),
      });
      if (!res.ok) {
        setBanner(await apiErr(res));
        return;
      }
      const data = (await res.json()) as UserOut;
      setUser(data);
      closeSheet();
    } catch {
      setBanner("Нет связи с сервером.");
    } finally {
      setBusy(false);
    }
  }, [
    closeSheet,
    forgotCode,
    forgotNewPass,
    forgotNewPass2,
    forgotPhone,
    initData,
  ]);

  const submitWorker = useCallback(async () => {
    setBanner("");
    if (!initData && !DEV_BYPASS_TELEGRAM) {
      setBanner("Откройте приложение через Telegram.");
      return;
    }
    let norm: string;
    try {
      norm = normPhone9(regPhone);
    } catch (e) {
      setBanner(String(e instanceof Error ? e.message : "Неверный номер"));
      return;
    }

    const p = regPassword.trim();
    if (p.length < MIN_PASS) {
      setBanner(`Пароль минимум ${MIN_PASS} символов.`);
      return;
    }
    if (p !== regPassword2.trim()) {
      setBanner("Пароли не совпадают.");
      return;
    }

    const ageNum = Number.parseInt(wAge, 10);
    if (Number.isNaN(ageNum) || ageNum < MIN_WORKER_AGE || ageNum > 90) {
      setBanner(`Укажите возраст от ${MIN_WORKER_AGE} до 90.`);
      return;
    }
    if ((wAbout || "").trim().length < 2) {
      setBanner("Кратко опишите свой опыт или условия.");
      return;
    }
    if (wSpecs.size < 1) {
      setBanner("Выберите хотя бы одно направление.");
      return;
    }
    if (!initData && DEV_BYPASS_TELEGRAM) {
      const devUser: UserOut = {
        telegram_id: Number(`9${Date.now()}`.slice(-9)),
        username: "local_worker",
        display_name: "Local Worker",
        role: "worker",
        phone_e164: norm,
        profile_completed: true,
        age: ageNum,
        about: wAbout.trim(),
        specializations: [...wSpecs],
      };
      const db = loadDevUsers();
      db[norm] = { password: p, user: devUser };
      saveDevUsers(db);
      setUser(devUser);
      closeSheet();
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/profile/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          init_data: initData,
          phone: norm,
          password: p,
          age: ageNum,
          about: wAbout.trim(),
          specialization_ids: [...wSpecs],
        }),
      });
      if (!res.ok) {
        setBanner(await apiErr(res));
        return;
      }
      const data = (await res.json()) as UserOut;
      setUser(data);
      closeSheet();
      setRegPhone("");
      setRegPassword("");
      setRegPassword2("");
      setWAge("");
      setWAbout("");
      setWSpecs(new Set());
    } catch {
      setBanner("Нет связи с сервером.");
    } finally {
      setBusy(false);
    }
  }, [closeSheet, initData, regPassword, regPassword2, regPhone, wAge, wAbout, wSpecs]);

  const submitEmployer = useCallback(async () => {
    setBanner("");
    if (!initData && !DEV_BYPASS_TELEGRAM) {
      setBanner("Откройте приложение через Telegram.");
      return;
    }
    let norm: string;
    try {
      norm = normPhone9(regPhone);
    } catch (e) {
      setBanner(String(e instanceof Error ? e.message : "Неверный номер"));
      return;
    }

    const p = regPassword.trim();
    if (p.length < MIN_PASS) {
      setBanner(`Пароль минимум ${MIN_PASS} символов.`);
      return;
    }
    if (p !== regPassword2.trim()) {
      setBanner("Пароли не совпадают.");
      return;
    }

    if (eKind === "organization" && !(eOrg || "").trim()) {
      setBanner("Укажите название организации.");
      return;
    }
    const innDigits = eInn.replace(/\D/g, "");
    if (eKind === "organization" && innDigits && (innDigits.length < 9 || innDigits.length > 14)) {
      setBanner("ИНН должен содержать 9-14 цифр.");
      return;
    }
    if (!initData && DEV_BYPASS_TELEGRAM) {
      const devUser: UserOut = {
        telegram_id: Number(`8${Date.now()}`.slice(-9)),
        username: "local_employer",
        display_name: "Local Employer",
        role: "employer",
        phone_e164: norm,
        profile_completed: true,
        employer_kind: eKind,
        organization_name: eKind === "organization" ? eOrg.trim() || null : null,
        organization_inn: eKind === "organization" ? innDigits || null : null,
        employer_note: eNote.trim() || null,
      };
      const db = loadDevUsers();
      db[norm] = { password: p, user: devUser };
      saveDevUsers(db);
      setUser(devUser);
      closeSheet();
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/profile/employer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          init_data: initData,
          phone: norm,
          password: p,
          employer_kind: eKind,
          organization_name: eKind === "organization" ? eOrg.trim() : null,
          organization_inn: eKind === "organization" ? innDigits || null : null,
          employer_note: eNote.trim() || null,
        }),
      });
      if (!res.ok) {
        setBanner(await apiErr(res));
        return;
      }
      const data = (await res.json()) as UserOut;
      setUser(data);
      closeSheet();
      setRegPhone("");
      setRegPassword("");
      setRegPassword2("");
      setEOrg("");
      setEInn("");
      setENote("");
      setEKind("person");
    } catch {
      setBanner("Нет связи с сервером.");
    } finally {
      setBusy(false);
    }
  }, [closeSheet, eInn, eKind, eNote, eOrg, initData, regPassword, regPassword2, regPhone]);

  const toggleSpec = (id: string) => {
    setWSpecs((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const onLoginPhoneChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").replace(/^998/, "").slice(0, 9);
    setLoginPhone(digits);
  };

  const onRegPhoneChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").replace(/^998/, "").slice(0, 9);
    setRegPhone(digits);
  };

  const onForgotPhoneChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").replace(/^998/, "").slice(0, 9);
    setForgotPhone(digits);
  };

  useEffect(() => {
    if (!onboarded || !user || orders.length > 0) return;
    if (user.role === "employer") {
      const baseId = user.telegram_id || 1;
      const seededOrder: OrderItem = {
        id: `ord-${Date.now()}`,
        ownerId: baseId,
        title: "Сантехник на устранение течи",
        categoryId: "plumber",
        minRating: 4.2,
        requiresEducation: false,
        description: "Нужно устранить течь в ванной, инструменты желательно свои.",
        priceUzs: 480000,
        priceMode: "negotiable",
        isActive: true,
        status: "active",
        createdAt: new Date().toISOString(),
      };
      setOrders([seededOrder]);
      setApplications([
        {
          id: `app-${Date.now()}`,
          orderId: seededOrder.id,
          workerId: baseId + 100,
          workerName: "Акмал",
          workerRating: 4.7,
          message: "Готов приехать сегодня после 18:00",
          status: "new",
        },
      ]);
    }
  }, [onboarded, orders.length, user]);

  const resetOrderForm = () => {
    setOrderCategoryId(specs[0]?.id || "other");
    setOrderMinRating("4.0");
    setOrderEdu(false);
    setOrderDesc("");
    setOrderPrice("");
    setOrderPriceMode("fixed");
    setOrderStatus("active");
    setOrderIsActive(true);
    setEditingOrderId(null);
  };

  const openCreateOrder = () => {
    resetOrderForm();
    setOrderModalOpen(true);
  };

  const openEditOrder = (order: OrderItem) => {
    setEditingOrderId(order.id);
    setOrderCategoryId(order.categoryId);
    setOrderMinRating(String(order.minRating.toFixed(1)));
    setOrderEdu(order.requiresEducation);
    setOrderDesc(order.description);
    setOrderPrice(String(order.priceUzs));
    setOrderPriceMode(order.priceMode);
    setOrderStatus(order.status);
    setOrderIsActive(order.isActive);
    setOrderModalOpen(true);
  };

  const saveOrder = () => {
    const minR = Number.parseFloat(orderMinRating);
    const p = Number.parseInt(orderPrice, 10);
    if (!orderCategoryId) {
      setBanner("Выберите категорию рабочего.");
      return;
    }
    if (Number.isNaN(minR) || minR < 0 || minR > 5) {
      setBanner("Рейтинг должен быть от 0.0 до 5.0.");
      return;
    }
    if (!orderDesc.trim()) {
      setBanner("Добавьте описание заказа.");
      return;
    }
    if (Number.isNaN(p) || p < 50000) {
      setBanner("Укажите цену от 50 000 сум.");
      return;
    }
    const ownerId = user?.telegram_id || 1;
    if (editingOrderId) {
      const prev = orders.find((x) => x.id === editingOrderId) || null;
      setOrders((prev) =>
        prev.map((o) =>
          o.id === editingOrderId
            ? {
                ...o,
                categoryId: orderCategoryId,
                title: `${specs.find((s) => s.id === orderCategoryId)?.label_ru || "Заказ"}: заявка`,
                minRating: Number(minR.toFixed(1)),
                requiresEducation: orderEdu,
                description: orderDesc.trim(),
                priceUzs: p,
                priceMode: orderPriceMode,
                status: orderStatus,
                isActive: orderIsActive && orderStatus === "active",
              }
            : o,
        ),
      );
      if (
        user?.role === "employer" &&
        prev?.status !== "completed" &&
        orderStatus === "completed"
      ) {
        const accepted = applications.find((a) => a.orderId === editingOrderId && a.status === "approved");
        if (accepted) {
          setRateTargetWorkerId(accepted.workerId);
          setRateScore("5");
          setRateModalOpen(true);
        }
      }
    } else {
      setOrders((prev) => [
        {
          id: `ord-${Date.now()}`,
          ownerId,
          title: `${specs.find((s) => s.id === orderCategoryId)?.label_ru || "Заказ"}: заявка`,
          categoryId: orderCategoryId,
          minRating: Number(minR.toFixed(1)),
          requiresEducation: orderEdu,
          description: orderDesc.trim(),
          priceUzs: p,
          priceMode: orderPriceMode,
          isActive: true,
          status: "active",
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    }
    setBanner("");
    setOrderModalOpen(false);
    resetOrderForm();
  };

  // статус теперь меняется через окно "Изменить"

  const cancelAcceptedExecutor = (orderId: string) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: "inactive",
              isActive: false,
            }
          : o,
      ),
    );
    setApplications((prev) =>
      prev.map((a) => (a.orderId === orderId && a.status === "approved" ? { ...a, status: "rejected" } : a)),
    );
  };


  const setApplicationStatus = (appId: string, status: ApplicationStatus) => {
    setApplications((prev) => prev.map((a) => (a.id === appId ? { ...a, status } : a)));
  };

  const approveApplication = (appId: string) => {
    const app = applications.find((a) => a.id === appId);
    if (!app) return;
    setApplications((prev) =>
      prev.map((a) =>
        a.orderId === app.orderId
          ? { ...a, status: a.id === appId ? "approved" : "rejected" }
          : a,
      ),
    );
    setOrders((prev) =>
      prev.map((o) =>
        o.id === app.orderId ? { ...o, status: "in_progress", isActive: false } : o,
      ),
    );
  };

  const ownerOrders = useMemo(
    () => orders.filter((o) => o.ownerId === (user?.telegram_id || 1)),
    [orders, user?.telegram_id],
  );

  const workerVisibleOrders = useMemo(() => {
    const base = orders.filter((o) => o.status === "active" && o.isActive);
    const specs = user?.role === "worker" ? (user.specializations || []) : [];
    if (!specs.length) return base;
    const set = new Set(specs);
    return base.filter((o) => set.has(o.categoryId));
  }, [orders, user?.role, user?.specializations]);

  const applyOrderFilters = useCallback(
    (arr: OrderItem[]) =>
      arr.filter((o) => {
        if (filterCategoryId !== "all" && o.categoryId !== filterCategoryId) return false;
        if (filterStatus !== "all" && o.status !== filterStatus) return false;
        const fr = Number.parseFloat(filterMinRating || "0");
        if (!Number.isNaN(fr) && o.minRating < fr) return false;
        return true;
      }),
    [filterCategoryId, filterMinRating, filterStatus],
  );

  const filteredOwnerOrders = useMemo(() => applyOrderFilters(ownerOrders), [applyOrderFilters, ownerOrders]);
  const filteredWorkerOrders = useMemo(
    () => applyOrderFilters(workerVisibleOrders),
    [applyOrderFilters, workerVisibleOrders],
  );

  const appsForOwner = useMemo(() => {
    const ids = new Set(ownerOrders.map((o) => o.id));
    return applications.filter((a) => ids.has(a.orderId));
  }, [applications, ownerOrders]);

  const selectedChatApp = applications.find((a) => a.id === selectedChatId) || null;
  const selectedChatOrder = selectedChatApp
    ? orders.find((o) => o.id === selectedChatApp.orderId) || null
    : null;

  useEffect(() => {
    // первичное сообщение от исполнителя = его отклик
    setChatMessages((prev) => {
      const next = { ...prev };
      for (const a of applications) {
        if (next[a.id]?.length) continue;
        next[a.id] = [
          {
            id: `m-${a.id}-0`,
            from: "them",
            text: a.message,
            ts: new Date().toISOString(),
          },
        ];
      }
      return next;
    });
  }, [applications]);

  const sheetTitle =
    sheetMode === "login"
      ? "Вход"
      : sheetMode === "pickRole"
        ? "Регистрация"
        : sheetMode === "worker"
          ? "Исполнитель"
          : sheetMode === "employer"
            ? "Заказчик"
            : sheetMode === "forgot"
              ? forgotPhase === "phone"
                ? "Восстановление"
                : "Новый пароль"
              : "";

  const dockItems = [
    {
      icon: <VscHome size={18} />,
      label: "Заказы",
      onClick: () => setActiveTab("orders"),
    },
    {
      icon: <VscCommentDiscussion size={18} />,
      label: "Чаты",
      onClick: () => setActiveTab("chats"),
    },
    {
      icon: <VscAccount size={18} />,
      label: "Профиль",
      onClick: () => setActiveTab("profile"),
    },
    {
      icon: <VscSettingsGear size={18} />,
      label: "Настройки",
      onClick: () => setActiveTab("settings"),
    },
  ];

  return (
    <div id="snap-main-container" className="page">
      <div className="threads-bg" aria-hidden>
        <Threads
          color={THREADS_RGB}
          amplitude={1}
          distance={0}
          enableMouseInteraction={false}
        />
        <div className="threads-scrim" />
      </div>

      {!meLoading && !onboarded && !sheetMode && (
        <div className="shell">
          <AnimatedContent animateOnMount duration={0.85} ease="power3.out" distance={28}>
            <div className="hero-masthead">
              <p className="welcome-line">Добро пожаловать</p>
              <h1 className="title-big">GWuz</h1>
              <div className="intro-type">
                <TextType
                  text="Работа, смены и прозрачные условия — в одном месте для исполнителя и заказчика."
                  typingSpeed={34}
                  initialDelay={600}
                  textColor="var(--muted)"
                />
              </div>
              <p className="partners">
                Проект создан в сотрудничестве с <strong>Gain Tech</strong> и{" "}
                <strong>Teplo Resurs</strong>.
              </p>
            </div>
          </AnimatedContent>

          <AnimatedContent animateOnMount delay={0.2} duration={0.75} distance={24} ease="power2.out">
            <div className="gate-block">
              <div className="gate-rule" />
              <p className="gate-caption">Выберите действие</p>
              <section className="gateway" aria-label="Вход или регистрация">
                <button type="button" className="btn-gateway" onClick={() => setSheetMode("login")}>
                  Войти
                </button>
                <button
                  type="button"
                  className="btn-gateway primary"
                  onClick={() => {
                    setBanner("");
                    setSheetMode("pickRole");
                  }}
                >
                  Регистрация
                </button>
              </section>
              <p className="gate-hint">
                Вход по номеру +998 и паролю. Регистрация — роль, данные и пароль; при утере пароля
                можно сбросить кодом в Telegram.
              </p>
              <ul className="pill-row" aria-label="Возможности">
                <li>Заказы</li>
                <li>Смены</li>
                <li>Рейтинг</li>
                <li>Чаты</li>
                <li>Оплата</li>
              </ul>
            </div>
          </AnimatedContent>
          {!isTelegram && (
            <p className="note" style={{ marginTop: "1rem" }}>
              Предпросмотр: авторизация Telegram недоступна (нет <code>initData</code>).
            </p>
          )}
        </div>
      )}

      {!meLoading && onboarded && !sheetMode && (
        <div className="shell dashboard-shell">
          <AnimatedContent animateOnMount delay={0.1} duration={0.65} distance={20}>
            <section className="done orders-flat">
              <h3>
                {activeTab === "orders"
                  ? "Заявки и заказы"
                  : activeTab === "chats"
                    ? "Чаты и отклики"
                    : activeTab === "profile"
                      ? "Профиль"
                      : "Настройки"}
              </h3>

              {activeTab === "orders" && user?.role === "employer" && (
                <>
                  <div className="orders-toolbar">
                    <button type="button" className="toolbar-btn" onClick={() => setFilterModalOpen(true)}>
                      По дате
                    </button>
                    <button type="button" className="toolbar-btn" onClick={() => setFilterModalOpen(true)}>
                      По статусу
                    </button>
                    <button type="button" className="toolbar-btn" onClick={() => setFilterModalOpen(true)}>
                      По рейтингу
                    </button>
                    <button type="button" className="toolbar-btn toolbar-btn-add" onClick={openCreateOrder}>
                      + Добавить заявку
                    </button>
                  </div>
                  <div className="order-list">
                    {filteredOwnerOrders.map((o) => (
                      <article
                        key={o.id}
                        className={`order-card order-row ${focusOrderId === o.id ? "order-highlight" : ""}`}
                        onClick={() => setFocusOrderId(null)}
                      >
                        <div className="order-top">
                          <strong>{specs.find((s) => s.id === o.categoryId)?.label_ru || o.title}</strong>
                          <div className="order-top-actions">
                            <span className={`status-pill status-${o.status}`}>{STATUS_LABELS[o.status]}</span>
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={() => openEditOrder(o)}
                              aria-label="Редактировать заявку"
                              title="Редактировать"
                            >
                              <VscEdit size={16} />
                            </button>
                          </div>
                        </div>
                        <p className="fine">
                          Рейтинг от {o.minRating.toFixed(1)} | Образование:{" "}
                          {o.requiresEducation ? "запрашивать" : "не обязательно"}
                        </p>
                        <p className="fine">{o.description}</p>
                        <p className="fine">
                          Цена: {o.priceUzs.toLocaleString("ru-RU")} сум{" "}
                          ({o.priceMode === "fixed" ? "устойчивая" : "договорная"})
                        </p>
                        <button type="button" className="link-soft" onClick={() => setActiveTab("chats")}>
                          Отклики / чаты
                        </button>
                      </article>
                    ))}
                    {filteredOwnerOrders.length === 0 && (
                      <p className="fine">По текущим фильтрам заявок нет.</p>
                    )}
                  </div>
                </>
              )}

              {activeTab === "orders" && user?.role === "worker" && (
                <>
                  <div className="orders-toolbar">
                    <button type="button" className="toolbar-btn" onClick={() => setFilterModalOpen(true)}>
                      По дате
                    </button>
                    <button type="button" className="toolbar-btn" onClick={() => setFilterModalOpen(true)}>
                      По статусу
                    </button>
                    <button type="button" className="toolbar-btn" onClick={() => setFilterModalOpen(true)}>
                      По рейтингу
                    </button>
                  </div>
                  <div className="order-list">
                    {filteredWorkerOrders.map((o) => (
                      <article
                        key={o.id}
                        className={`order-card order-row ${focusOrderId === o.id ? "order-highlight" : ""}`}
                        onClick={() => setFocusOrderId(null)}
                      >
                        <div className="order-top">
                          <strong>{specs.find((s) => s.id === o.categoryId)?.label_ru || o.title}</strong>
                          <span className={`status-pill status-${o.status}`}>{STATUS_LABELS[o.status]}</span>
                        </div>
                        <p className="fine">{o.description}</p>
                        <p className="fine">
                          Рейтинг от {o.minRating.toFixed(1)} | Цена: {o.priceUzs.toLocaleString("ru-RU")} сум
                        </p>
                        <button
                          type="button"
                          className="btn-gateway"
                          onClick={() => openApply(o)}
                        >
                          Откликнуться
                        </button>
                      </article>
                    ))}
                    {filteredWorkerOrders.length === 0 && (
                      <p className="fine">
                        Нет подходящих активных заказов. Проверьте направления в профиле (исполнитель → «Направления»).
                      </p>
                    )}
                  </div>
                </>
              )}

              {activeTab === "chats" && (
                <>
                  <div className="chat-list">
                    {(user?.role === "employer"
                      ? appsForOwner
                      : applications.filter((a) => a.workerId === (user?.telegram_id || -1))).map((app) => {
                      const order = orders.find((o) => o.id === app.orderId);
                      if (!order) return null;
                      const last = (chatMessages[app.id] || [])[chatMessages[app.id]?.length - 1];
                      return (
                        <button
                          key={app.id}
                          type="button"
                          className="chat-row"
                          onClick={() => setSelectedChatId(app.id)}
                        >
                          <div className="chat-avatar">{app.workerName.slice(0, 1).toUpperCase()}</div>
                          <div className="chat-row-mid">
                            <div className="chat-row-top">
                              <span className="chat-row-name">{app.workerName}</span>
                              <span className="chat-row-badge">
                                {app.status === "reviewing"
                                  ? "рассматриваю"
                                  : app.status === "approved"
                                    ? "принят"
                                    : app.status === "new"
                                      ? "новый"
                                      : "—"}
                              </span>
                            </div>
                            <div className="chat-row-bottom">
                              <span className="chat-row-last">{last?.text || "Заявка"}</span>
                              <span className="chat-row-meta">
                                {specs.find((s) => s.id === order.categoryId)?.label_ru}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {activeTab === "profile" && (
                <>
                  <div className="profile-head">
                    <div className="profile-avatar">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="Аватар" className="profile-avatar-img" />
                      ) : (
                        <div className="profile-avatar-fallback">
                          {(user?.display_name || user?.username || "U").slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="profile-head-main">
                      <div className="profile-name">
                        <strong>{user?.display_name || "Профиль"}</strong>
                        {user?.username ? <span className="fine"> @{user.username}</span> : null}
                      </div>
                      <div className="profile-badges">
                        <span className="pill">
                          {user?.role === "worker" ? "исполнитель" : user?.role === "employer" ? "заказчик" : "—"}
                        </span>
                        <span className="pill pill-strong">
                          ★ {ratingAvg.toFixed(1)} <span className="pill-sub">({ratingCount})</span>
                        </span>
                      </div>
                      {privacyShowPhone && user?.phone_e164 && <div className="fine">Телефон: {user.phone_e164}</div>}
                      {user?.role === "worker" && (
                        <div className="fine">
                          График:{" "}
                          {workSchedule === "day"
                            ? "днём"
                            : workSchedule === "evening"
                              ? "вечером"
                              : workSchedule === "weekend"
                                ? "выходные"
                                : "любой"}
                        </div>
                      )}
                    </div>
                    <div className="profile-head-actions">
                      <button type="button" className="btn-gateway primary" onClick={() => setProfileEditOpen(true)}>
                        Изменить
                      </button>
                    </div>
                  </div>

                  <div className="profile-grid">
                    <div className="card">
                      <div className="card-title">О себе</div>
                      <div className="fine">
                        Возраст: <strong>{privacyShowAge ? (user?.age ?? "—") : "скрыт"}</strong>
                      </div>
                      <div className="profile-about">{user?.about || "Пока нет описания."}</div>
                    </div>

                    {user?.role === "worker" && (
                      <div className="card">
                        <div className="card-title">Направления</div>
                        <div className="fine">
                          {user.specializations?.length
                            ? user.specializations
                                .map((id) => specs.find((s) => s.id === id)?.label_ru || id)
                                .join(", ")
                            : "Не выбрано"}
                        </div>
                      </div>
                    )}

                    {user?.role === "employer" && (
                      <div className="card">
                        <div className="card-title">Тип заказчика</div>
                        <div className="fine">
                          {user.employer_kind === "organization" ? "Компания/организация" : "Частное лицо"}
                        </div>
                        {user.employer_kind === "organization" && (
                          <>
                            <div className="fine">
                              Название: <strong>{user.organization_name || "—"}</strong>
                            </div>
                            <div className="fine">
                              ИНН: <strong>{user.organization_inn || "—"}</strong>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    <div className="card">
                      <div className="card-title">
                        {user?.role === "worker" ? "Образование / документы" : "Файлы"}
                      </div>
                      {user?.role === "worker" ? (
                        <>
                          <div className="fine">Можно загрузить PDF/DOC/DOCX (пока без проверки).</div>
                          <div className="file-list">
                            {(eduFiles || []).length ? (
                              eduFiles.map((f, idx) => (
                                <div key={`${f.name}-${idx}`} className="file-row">
                                  <span className="file-name">{f.name}</span>
                                  <span className="file-meta">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                                </div>
                              ))
                            ) : (
                              <div className="fine">Файлы не добавлены.</div>
                            )}
                          </div>
                          <label className="file-upload">
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                              onChange={(e) => {
                                const files = Array.from(e.target.files || []);
                                const stubs = files.map((x) => ({ name: x.name, mime: x.type || "file", size: x.size }));
                                const next = [...eduFiles, ...stubs].slice(0, 6);
                                setEduFiles(next);
                                persistDocs({ eduFiles: next });
                                e.currentTarget.value = "";
                              }}
                            />
                            + Загрузить документ
                          </label>
                        </>
                      ) : (
                        <>
                          <div className="fine">Файлы компании/документы (PDF/DOC/DOCX).</div>
                          <div className="file-list">
                            {(companyFiles || []).length ? (
                              companyFiles.map((f, idx) => (
                                <div key={`${f.name}-${idx}`} className="file-row">
                                  <span className="file-name">{f.name}</span>
                                  <span className="file-meta">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                                </div>
                              ))
                            ) : (
                              <div className="fine">Файлы не добавлены.</div>
                            )}
                          </div>
                          <label className="file-upload">
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                              onChange={(e) => {
                                const files = Array.from(e.target.files || []);
                                const stubs = files.map((x) => ({ name: x.name, mime: x.type || "file", size: x.size }));
                                const next = [...companyFiles, ...stubs].slice(0, 8);
                                setCompanyFiles(next);
                                persistDocs({ companyFiles: next });
                                e.currentTarget.value = "";
                              }}
                            />
                            + Загрузить файл
                          </label>
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}

              {activeTab === "settings" && (
                <>
                  <div className="card">
                    <div className="card-title">Разделы</div>
                    <div className="settings-list">
                      <button type="button" className="settings-row" onClick={() => setSettingsPane("notifications")}>
                        <span>
                          <strong>Уведомления</strong>
                          <span className="fine">
                            {user?.role === "worker"
                              ? "Новые подходящие заказы в Telegram"
                              : "Новые отклики и сообщения по вашим заказам"}
                          </span>
                        </span>
                        <span className="fine">›</span>
                      </button>

                      <button type="button" className="settings-row" onClick={() => setSettingsPane("language")}>
                        <span>
                          <strong>Язык</strong>
                          <span className="fine">
                            {lang === "ru"
                              ? "Русский"
                              : lang === "uz_lat"
                                ? "Oʻzbek (lotin)"
                                : lang === "uz_cyrl"
                                  ? "Ўзбек (кириллица)"
                                  : "English"}
                          </span>
                        </span>
                        <span className="fine">›</span>
                      </button>

                      <button type="button" className="settings-row" onClick={() => setSettingsPane("theme")}>
                        <span>
                          <strong>Тема</strong>
                          <span className="fine">{theme === "light" ? "Светлая" : "Тёмная"}</span>
                        </span>
                        <span className="fine">›</span>
                      </button>

                      <button type="button" className="settings-row" onClick={() => setSettingsPane("privacy")}>
                        <span>
                          <strong>Приватность</strong>
                          <span className="fine">Показ телефона и возраста</span>
                        </span>
                        <span className="fine">›</span>
                      </button>

                      <button type="button" className="settings-row" onClick={() => setLogoutConfirmOpen(true)}>
                        <span>
                          <strong>Выйти</strong>
                          <span className="fine">Выйти из аккаунта на этом устройстве</span>
                        </span>
                        <span className="fine">›</span>
                      </button>
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-title">Приложение</div>
                    <div className="fine">
                      Оценка исполнителя ставится после завершения заказа (статус «Выполнен»). Язык/тема/уведомления сохраняются локально.
                    </div>
                  </div>
                </>
              )}
            </section>
          </AnimatedContent>
          {!selectedChatApp && <Dock items={dockItems} panelHeight={68} baseItemSize={50} magnification={70} />}
        </div>
      )}

      {selectedChatApp && selectedChatOrder && (
        <div className="tg-chat" role="dialog" aria-modal="true">
          <div className="tg-topbar">
            <button
              type="button"
              className="tg-back"
              onClick={() => setSelectedChatId(null)}
              aria-label="Назад"
            >
              ←
            </button>
            <button type="button" className="tg-peer" onClick={() => setProfileOpen(true)}>
              <div className="tg-avatar">{selectedChatApp.workerName.slice(0, 1).toUpperCase()}</div>
              <div className="tg-peer-meta">
                <div className="tg-peer-name">{selectedChatApp.workerName}</div>
                <div className="tg-peer-sub">
                  {selectedChatOrder.status === "in_progress"
                    ? "в процессе"
                    : selectedChatApp.status === "reviewing"
                      ? "рассматриваю"
                      : "без статуса"}
                </div>
              </div>
            </button>
            <div className="tg-top-actions" />
          </div>

          <div className="tg-actionbar">
            {selectedChatApp.status === "reviewing" && (
              <button type="button" className="tg-accept" onClick={() => setAcceptConfirmOpen(true)}>
                Принять заявку
              </button>
            )}
          </div>

          <div className="tg-messages">
            <div className="tg-order-card">
              <div className="tg-order-title">Заявка</div>
              <div className="tg-order-sub">
                {specs.find((s) => s.id === selectedChatOrder.categoryId)?.label_ru} • рейтинг от{" "}
                {selectedChatOrder.minRating.toFixed(1)}
              </div>
              <div className="tg-order-text">{selectedChatOrder.description}</div>
              <div className="tg-order-sub">
                {selectedChatOrder.priceUzs.toLocaleString("ru-RU")} сум •{" "}
                {selectedChatOrder.priceMode === "fixed" ? "устойчивая" : "договорная"}
              </div>
              {selectedChatOrder.priceMode === "negotiable" && selectedChatApp.proposedPriceUzs != null && (
                <div className="tg-order-sub">
                  Предложение исполнителя:{" "}
                  <strong>{selectedChatApp.proposedPriceUzs.toLocaleString("ru-RU")} сум</strong>
                </div>
              )}
            </div>

            {(chatMessages[selectedChatApp.id] || []).map((m) => (
              <div
                key={m.id}
                className={`tg-bubble ${m.from === "me" ? "tg-bubble-me" : "tg-bubble-them"}`}
              >
                {m.text}
              </div>
            ))}
          </div>

          {selectedChatApp.status === "new" ? (
            user?.role === "employer" ? (
              <div className="tg-bottom">
                <button
                  type="button"
                  className="tg-bottom-btn"
                  onClick={() => setApplicationStatus(selectedChatApp.id, "reviewing")}
                >
                  Взять на рассмотрение
                </button>
              </div>
            ) : (
              <div className="tg-bottom">
                <div className="fine">Ожидает рассмотрения заказчиком.</div>
              </div>
            )
          ) : (
            <div className="tg-inputbar">
              <input
                className="tg-input"
                placeholder="Сообщение…"
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                disabled={!(selectedChatApp.status === "reviewing" || selectedChatOrder.status === "in_progress")}
              />
              <button
                type="button"
                className="tg-send"
                disabled={!chatDraft.trim()}
                onClick={() => {
                  const allowed =
                    selectedChatApp.status === "reviewing" || selectedChatOrder.status === "in_progress";
                  if (!allowed) return;
                  const txt = chatDraft.trim();
                  if (!txt) return;
                  setChatMessages((prev) => ({
                    ...prev,
                    [selectedChatApp.id]: [
                      ...(prev[selectedChatApp.id] || []),
                      { id: `m-${Date.now()}`, from: "me", text: txt, ts: new Date().toISOString() },
                    ],
                  }));
                  setChatDraft("");
                }}
              >
                ➤
              </button>
            </div>
          )}
        </div>
      )}

      <CenterModal
        open={orderModalOpen}
        title={editingOrderId ? "Редактировать заявку" : "Новая заявка"}
        onClose={() => setOrderModalOpen(false)}
      >
        <div className="form-block">
          <label className="field-label">Категория рабочего</label>
          <select
            className="field-input"
            value={orderCategoryId}
            onChange={(e) => setOrderCategoryId(e.target.value)}
          >
            {specs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label_ru}
              </option>
            ))}
          </select>

          <label className="field-label">Фильтр по рейтингу (0.0 - 5.0)</label>
          <input
            className="field-input"
            type="number"
            min={0}
            max={5}
            step={0.1}
            value={orderMinRating}
            onChange={(e) => setOrderMinRating(e.target.value)}
          />

          <label className="radio-line">
            <input
              type="checkbox"
              checked={orderEdu}
              onChange={(e) => setOrderEdu(e.target.checked)}
            />
            Запрашивать образование
          </label>

          <label className="field-label">Описание заказа</label>
          <textarea
            className="field-textarea"
            rows={4}
            value={orderDesc}
            onChange={(e) => setOrderDesc(e.target.value)}
            placeholder="Опишите задачу, сроки, требования."
          />

          <label className="field-label">Цена (сум UZS)</label>
          <input
            className="field-input"
            type="number"
            min={50000}
            value={orderPrice}
            onChange={(e) => setOrderPrice(e.target.value)}
            placeholder="Например: 450000"
          />
          <p className="fine">
            Подсказка системы:{" "}
            {(PRICE_HINTS[orderCategoryId] || 300_000).toLocaleString("ru-RU")} сум
          </p>

          <p className="field-label">Тип цены</p>
          <div className="radio-col">
            <label className="radio-line">
              <input
                type="radio"
                name="price_mode"
                checked={orderPriceMode === "fixed"}
                onChange={() => setOrderPriceMode("fixed")}
              />
              Устойчивая
            </label>
            <label className="radio-line">
              <input
                type="radio"
                name="price_mode"
                checked={orderPriceMode === "negotiable"}
                onChange={() => setOrderPriceMode("negotiable")}
              />
              Договорная
            </label>
          </div>

          {editingOrderId && (
            <>
              <p className="field-label">Статус заявки</p>
              <select
                className="field-input"
                value={orderStatus}
                onChange={(e) => setOrderStatus(e.target.value as OrderStatus)}
              >
                <option value="active">Активен</option>
                <option value="inactive">Не активен</option>
                <option value="in_progress">В процессе</option>
                <option value="completed">Выполнен</option>
                <option value="cancelled">Отменен</option>
              </select>

              <label className="radio-line">
                <input
                  type="checkbox"
                  checked={orderIsActive}
                  onChange={(e) => setOrderIsActive(e.target.checked)}
                  disabled={orderStatus !== "active"}
                />
                Сделать активным (доступно только при статусе «Активен»)
              </label>

              {orderStatus === "in_progress" && (
                <button
                  type="button"
                  className="btn-gateway"
                  onClick={() => {
                    if (!editingOrderId) return;
                    cancelAcceptedExecutor(editingOrderId);
                    setOrderStatus("inactive");
                    setOrderIsActive(false);
                  }}
                >
                  Отменить исполнителя и поставить на паузу
                </button>
              )}
            </>
          )}

          <button type="button" className="primary" onClick={saveOrder}>
            {editingOrderId ? "Сохранить заявку" : "Создать заявку"}
          </button>
        </div>
      </CenterModal>

      <CenterModal
        open={filterModalOpen}
        title="Фильтры заявок"
        onClose={() => setFilterModalOpen(false)}
      >
        <div className="form-block">
          <label className="field-label">Категория</label>
          <select
            className="field-input"
            value={filterCategoryId}
            onChange={(e) => setFilterCategoryId(e.target.value)}
          >
            <option value="all">Все категории</option>
            {specs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label_ru}
              </option>
            ))}
          </select>

          <label className="field-label">Статус</label>
          <select
            className="field-input"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as "all" | OrderStatus)}
          >
            <option value="all">Все</option>
            <option value="active">Активен</option>
            <option value="inactive">Не активен</option>
            <option value="in_progress">В процессе</option>
            <option value="completed">Выполнен</option>
            <option value="cancelled">Отменен</option>
          </select>

          <label className="field-label">Минимальный рейтинг</label>
          <input
            className="field-input"
            type="number"
            min={0}
            max={5}
            step={0.1}
            value={filterMinRating}
            onChange={(e) => setFilterMinRating(e.target.value)}
          />

          <div className="role-grid">
            <button
              type="button"
              className="btn-gateway"
              onClick={() => {
                setFilterCategoryId("all");
                setFilterStatus("all");
                setFilterMinRating("0");
              }}
            >
              Сбросить
            </button>
            <button type="button" className="btn-gateway primary" onClick={() => setFilterModalOpen(false)}>
              Применить
            </button>
          </div>
        </div>
      </CenterModal>

      <CenterModal open={profileEditOpen} title="Редактировать профиль" onClose={() => setProfileEditOpen(false)}>
        <div className="form-block">
          <label className="field-label">Фото профиля</label>
          <div className="avatar-edit">
            <div className="avatar-edit-preview">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Аватар" className="profile-avatar-img" />
              ) : (
                <div className="profile-avatar-fallback">
                  {(user?.display_name || user?.username || "U").slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <div className="avatar-edit-actions">
              <label className="file-upload" style={{ marginTop: 0 }}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const r = new FileReader();
                    r.onload = () => {
                      const res = String(r.result || "");
                      if (res.startsWith("data:image/")) setAvatarForMe(res);
                    };
                    r.readAsDataURL(f);
                    e.currentTarget.value = "";
                  }}
                />
                Загрузить
              </label>
              {avatarOverride && (
                <button type="button" className="btn-gateway" onClick={() => setAvatarForMe("")}>
                  Сбросить
                </button>
              )}
              <div className="fine">Если открыть через Telegram — можно оставить фото из Telegram.</div>
            </div>
          </div>

          <label className="field-label">Возраст</label>
          <input
            className="field-input"
            inputMode="numeric"
            value={pAge}
            onChange={(e) => setPAge(e.target.value)}
            placeholder="Например: 22"
          />

          <label className="field-label">Описание</label>
          <textarea
            className="field-textarea"
            rows={4}
            value={pAbout}
            onChange={(e) => setPAbout(e.target.value)}
            placeholder="Коротко о себе: опыт, условия, график."
          />

          {user?.role === "worker" && (
            <>
              <p className="field-label">График работы</p>
              <select
                className="field-input"
                value={workSchedule}
                onChange={(e) => {
                  const v = e.target.value as "any" | "day" | "evening" | "weekend";
                  setWorkSchedule(v);
                  persistPrefs({ workSchedule: v });
                }}
              >
                <option value="any">Любой</option>
                <option value="day">Днём</option>
                <option value="evening">Вечером</option>
                <option value="weekend">Выходные</option>
              </select>
              <div className="fine">Это будет использоваться для подбора подходящих заказов в уведомлениях.</div>
            </>
          )}

          {user?.role === "employer" && (
            <>
              <p className="field-label">Тип заказчика</p>
              <div className="radio-col">
                <label className="radio-line">
                  <input type="radio" checked={pKind === "person"} onChange={() => setPKind("person")} />
                  Частное лицо
                </label>
                <label className="radio-line">
                  <input type="radio" checked={pKind === "organization"} onChange={() => setPKind("organization")} />
                  Компания/организация
                </label>
              </div>
              {pKind === "organization" && (
                <>
                  <label className="field-label">Название компании</label>
                  <input
                    className="field-input"
                    value={pOrg}
                    onChange={(e) => setPOrg(e.target.value)}
                    placeholder="ООО «Пример»"
                  />
                  <label className="field-label">ИНН (если есть)</label>
                  <input
                    className="field-input"
                    inputMode="numeric"
                    value={pInn}
                    onChange={(e) => setPInn(e.target.value.replace(/[^\d]/g, "").slice(0, 14))}
                    placeholder="9–14 цифр"
                  />
                </>
              )}
            </>
          )}

          <div className="role-grid">
            <button type="button" className="btn-gateway" onClick={() => setProfileEditOpen(false)}>
              Отмена
            </button>
            <button type="button" className="btn-gateway primary" onClick={saveProfile}>
              Сохранить
            </button>
          </div>
        </div>
      </CenterModal>

      <CenterModal open={settingsPane === "notifications"} title="Уведомления" onClose={() => setSettingsPane(null)}>
        <div className="form-block">
          {user?.role === "employer" ? (
            <>
              <label className="toggle-row">
                <span className="toggle-text">
                  <strong>Новые отклики</strong>
                  <span className="fine">Когда кто-то откликается на ваш заказ.</span>
                </span>
                <input
                  type="checkbox"
                  checked={notifOrdersOn}
                  onChange={(e) => {
                    setNotifOrdersOn(e.target.checked);
                    persistPrefs({ notifOrdersOn: e.target.checked });
                  }}
                />
              </label>
              <label className="toggle-row">
                <span className="toggle-text">
                  <strong>Новые сообщения</strong>
                  <span className="fine">Когда вам пишут в чате.</span>
                </span>
                <input
                  type="checkbox"
                  checked={notifChatsOn}
                  onChange={(e) => {
                    setNotifChatsOn(e.target.checked);
                    persistPrefs({ notifChatsOn: e.target.checked });
                  }}
                />
              </label>
              <div className="fine">
                Уведомления будут приходить через Telegram-бота и/или внутри мини-аппа.
              </div>
            </>
          ) : (
            <>
              <label className="toggle-row">
                <span className="toggle-text">
                  <strong>Новые заказы</strong>
                  <span className="fine">Подходящие по направлению, рейтингу и графику.</span>
                </span>
                <input
                  type="checkbox"
                  checked={notifOrdersOn}
                  onChange={(e) => {
                    setNotifOrdersOn(e.target.checked);
                    persistPrefs({ notifOrdersOn: e.target.checked });
                  }}
                />
              </label>
              <label className="toggle-row">
                <span className="toggle-text">
                  <strong>Сообщения</strong>
                  <span className="fine">Новые сообщения в чате (внутри мини-аппа).</span>
                </span>
                <input
                  type="checkbox"
                  checked={notifChatsOn}
                  onChange={(e) => {
                    setNotifChatsOn(e.target.checked);
                    persistPrefs({ notifChatsOn: e.target.checked });
                  }}
                />
              </label>
              <div className="fine">
                В будущем бот будет присылать: «Новый заказ: {`{направление}`} — перейти», и откроется заказ в мини-аппе.
              </div>
            </>
          )}
        </div>
      </CenterModal>

      <CenterModal open={settingsPane === "language"} title="Язык" onClose={() => setSettingsPane(null)}>
        <div className="form-block">
          <div className="radio-col">
            <label className="radio-line">
              <input
                type="radio"
                checked={lang === "ru"}
                onChange={() => {
                  setLang("ru");
                  persistPrefs({ lang: "ru" });
                }}
              />
              Русский
            </label>
            <label className="radio-line">
              <input
                type="radio"
                checked={lang === "uz_lat"}
                onChange={() => {
                  setLang("uz_lat");
                  persistPrefs({ lang: "uz_lat" });
                }}
              />
              Oʻzbek (lotin)
            </label>
            <label className="radio-line">
              <input
                type="radio"
                checked={lang === "uz_cyrl"}
                onChange={() => {
                  setLang("uz_cyrl");
                  persistPrefs({ lang: "uz_cyrl" });
                }}
              />
              Ўзбек (кириллица)
            </label>
            <label className="radio-line">
              <input
                type="radio"
                checked={lang === "en"}
                onChange={() => {
                  setLang("en");
                  persistPrefs({ lang: "en" });
                }}
              />
              English
            </label>
          </div>
          <div className="fine">Пока язык сохраняется и будет использоваться для локализации интерфейса дальше.</div>
        </div>
      </CenterModal>

      <CenterModal open={settingsPane === "theme"} title="Тема" onClose={() => setSettingsPane(null)}>
        <div className="form-block">
          <div className="radio-col">
            <label className="radio-line">
              <input
                type="radio"
                checked={theme === "dark"}
                onChange={() => {
                  setTheme("dark");
                  persistPrefs({ theme: "dark" });
                }}
              />
              Тёмная
            </label>
            <label className="radio-line">
              <input
                type="radio"
                checked={theme === "light"}
                onChange={() => {
                  setTheme("light");
                  persistPrefs({ theme: "light" });
                }}
              />
              Светлая
            </label>
          </div>
        </div>
      </CenterModal>

      <CenterModal open={settingsPane === "privacy"} title="Приватность" onClose={() => setSettingsPane(null)}>
        <div className="form-block">
          <label className="toggle-row">
            <span className="toggle-text">
              <strong>Показывать телефон</strong>
              <span className="fine">Телефон будет виден в профиле.</span>
            </span>
            <input
              type="checkbox"
              checked={privacyShowPhone}
              onChange={(e) => {
                setPrivacyShowPhone(e.target.checked);
                persistPrefs({ privacyShowPhone: e.target.checked });
              }}
            />
          </label>
          <label className="toggle-row">
            <span className="toggle-text">
              <strong>Показывать возраст</strong>
              <span className="fine">Возраст будет виден в профиле.</span>
            </span>
            <input
              type="checkbox"
              checked={privacyShowAge}
              onChange={(e) => {
                setPrivacyShowAge(e.target.checked);
                persistPrefs({ privacyShowAge: e.target.checked });
              }}
            />
          </label>
          <div className="fine">Пока влияет только на отображение (без серверной логики).</div>
        </div>
      </CenterModal>

      <CenterModal open={rateModalOpen} title="Оценить исполнителя" onClose={() => setRateModalOpen(false)}>
        <div className="form-block">
          <p className="sheet-lead">Заказ выполнен. Поставьте оценку исполнителю (0–5).</p>
          <input
            className="field-input"
            type="number"
            min={0}
            max={5}
            step={0.5}
            value={rateScore}
            onChange={(e) => setRateScore(e.target.value)}
          />
          <div className="role-grid">
            <button
              type="button"
              className="btn-gateway"
              onClick={() => {
                setRateModalOpen(false);
                setRateTargetWorkerId(null);
              }}
            >
              Позже
            </button>
            <button type="button" className="btn-gateway primary" onClick={submitRating}>
              Сохранить
            </button>
          </div>
        </div>
      </CenterModal>

      <CenterModal open={applyModalOpen} title="Отклик" onClose={() => setApplyModalOpen(false)}>
        <div className="form-block">
          {(() => {
            const o = orders.find((x) => x.id === applyOrderId);
            if (!o) return <p className="fine">Заказ не найден.</p>;
            return (
              <>
                <p className="sheet-lead">
                  {specs.find((s) => s.id === o.categoryId)?.label_ru} •{" "}
                  {o.priceMode === "fixed" ? "цена устойчивая" : "цена договорная"}
                </p>
                {o.priceMode === "negotiable" ? (
                  <>
                    <label className="field-label">Сколько вы хотите (сум)</label>
                    <input
                      className="field-input"
                      inputMode="numeric"
                      value={applyOffer}
                      onChange={(e) => setApplyOffer(e.target.value)}
                      placeholder="Например: 450000"
                    />
                    <p className="fine">Эта сумма будет видна заказчику в чате.</p>
                  </>
                ) : (
                  <p className="fine">
                    Цена: <strong>{o.priceUzs.toLocaleString("ru-RU")} сум</strong>
                  </p>
                )}
                <label className="field-label">Сообщение</label>
                <textarea
                  className="field-textarea"
                  rows={3}
                  value={applyMsg}
                  onChange={(e) => setApplyMsg(e.target.value)}
                  placeholder="Например: приеду сегодня вечером, инструменты есть."
                />
                <div className="role-grid">
                  <button type="button" className="btn-gateway" onClick={() => setApplyModalOpen(false)}>
                    Отмена
                  </button>
                  <button type="button" className="btn-gateway primary" onClick={submitApply}>
                    Отправить
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      </CenterModal>

      <CenterModal open={logoutConfirmOpen} title="Выйти из аккаунта?" onClose={() => setLogoutConfirmOpen(false)}>
        <div className="form-block">
          <p className="sheet-lead">Вы сможете войти снова по номеру телефона и паролю.</p>
          <div className="role-grid">
            <button type="button" className="btn-gateway" onClick={() => setLogoutConfirmOpen(false)}>
              Отмена
            </button>
            <button type="button" className="btn-gateway primary" onClick={doLogout}>
              Выйти
            </button>
          </div>
        </div>
      </CenterModal>

      <CenterModal
        open={acceptConfirmOpen}
        title="Подтвердить принятие"
        onClose={() => setAcceptConfirmOpen(false)}
      >
        <div className="form-block">
          <p className="sheet-lead">
            Принять отклик и перевести заказ в статус «В процессе»? После этого заказ станет неактивным для других исполнителей.
          </p>
          <div className="role-grid">
            <button type="button" className="btn-gateway" onClick={() => setAcceptConfirmOpen(false)}>
              Отмена
            </button>
            <button
              type="button"
              className="btn-gateway primary"
              onClick={() => {
                if (selectedChatApp) approveApplication(selectedChatApp.id);
                setAcceptConfirmOpen(false);
              }}
            >
              Подтвердить
            </button>
          </div>
        </div>
      </CenterModal>

      <CenterModal open={profileOpen} title="Профиль исполнителя" onClose={() => setProfileOpen(false)}>
        <div className="form-block">
          {selectedChatApp ? (
            <>
              <p>
                <strong>{selectedChatApp.workerName}</strong>
              </p>
              <p className="fine">Рейтинг: {selectedChatApp.workerRating.toFixed(1)} / 5.0</p>
              <p className="fine">Детали профиля подключим после бэкенда.</p>
            </>
          ) : (
            <p className="fine">Профиль не выбран.</p>
          )}
        </div>
      </CenterModal>

      <CenterModal open={sheetMode !== null} title={sheetTitle} onClose={closeSheet}>
        {sheetMode === "login" && (
          <div className="form-block">
            <label className="field-label">Телефон (+998)</label>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              className="field-input"
              placeholder="+998 __ ___ __ __"
              value={phoneDigitsToDisplay(loginPhone)}
              onChange={(e) => onLoginPhoneChange(e.target.value)}
            />
            <label className="field-label">Пароль</label>
            <input
              type="password"
              autoComplete="current-password"
              className="field-input"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
            />
            <button type="button" className="link-soft" onClick={() => {
              setBanner("");
              setForgotPhase("phone");
              setForgotPhone(loginPhone);
              setSheetMode("forgot");
            }}>
              Забыли пароль?
            </button>
            <button type="button" className="primary" disabled={busy} onClick={submitLogin}>
              {busy ? "…" : "Войти"}
            </button>
            {banner && <div className="banner banner-warn">{banner}</div>}
          </div>
        )}

        {sheetMode === "forgot" && forgotPhase === "phone" && (
          <div className="form-block">
            <p className="sheet-lead">
              Старый пароль нельзя «достать» из системы: мы отправим на ваш Telegram, привязанный к
              этому номеру, одноразовый код для установки нового пароля.
            </p>
            <label className="field-label">Номер (+998)</label>
            <input
              type="tel"
              className="field-input"
              value={phoneDigitsToDisplay(forgotPhone)}
              onChange={(e) => onForgotPhoneChange(e.target.value)}
            />
            <button type="button" className="primary" disabled={busy} onClick={submitForgotPhone}>
              {busy ? "…" : "Отправить код в Telegram"}
            </button>
            {banner && <div className="banner banner-warn">{banner}</div>}
          </div>
        )}

        {sheetMode === "forgot" && forgotPhase === "code" && (
          <div className="form-block">
            <p className="sheet-lead">
              Введите код из чата с ботом (тот же аккаунт Telegram, с которого открыто приложение) и
              задайте новый пароль.
            </p>
            <label className="field-label">Код</label>
            <input
              type="text"
              inputMode="numeric"
              className="field-input"
              value={forgotCode}
              onChange={(e) => setForgotCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="••••••"
            />
            <label className="field-label">Новый пароль</label>
            <input
              type="password"
              autoComplete="new-password"
              className="field-input"
              value={forgotNewPass}
              onChange={(e) => setForgotNewPass(e.target.value)}
            />
            <label className="field-label">Повтор пароля</label>
            <input
              type="password"
              autoComplete="new-password"
              className="field-input"
              value={forgotNewPass2}
              onChange={(e) => setForgotNewPass2(e.target.value)}
            />
            <button
              type="button"
              className="link-soft"
              onClick={() => {
                setForgotPhase("phone");
                setBanner("");
              }}
            >
              Другой номер
            </button>
            <button type="button" className="primary" disabled={busy} onClick={submitForgotFinish}>
              {busy ? "…" : "Сохранить пароль и войти"}
            </button>
            {banner && <div className="banner banner-warn">{banner}</div>}
          </div>
        )}

        {sheetMode === "pickRole" && (
          <div className="form-block">
            <p className="sheet-lead">Как вы участвуете в сервисе?</p>
            <div className="gateway" style={{ marginTop: "0.75rem" }}>
              <button
                type="button"
                className="btn-gateway"
                onClick={() => {
                  setSheetMode("worker");
                  setBanner("");
                }}
              >
                Исполнитель
              </button>
              <button
                type="button"
                className="btn-gateway primary"
                onClick={() => {
                  setSheetMode("employer");
                  setBanner("");
                }}
              >
                Заказчик
              </button>
            </div>
          </div>
        )}

        {sheetMode === "worker" && (
          <div className="form-block">
            <label className="field-label">Телефон</label>
            <input
              type="tel"
              className="field-input"
              value={phoneDigitsToDisplay(regPhone)}
              onChange={(e) => onRegPhoneChange(e.target.value)}
            />
            <label className="field-label">Пароль (минимум {MIN_PASS} символов)</label>
            <input
              type="password"
              autoComplete="new-password"
              className="field-input"
              value={regPassword}
              onChange={(e) => setRegPassword(e.target.value)}
            />
            <label className="field-label">Повтор пароля</label>
            <input
              type="password"
              autoComplete="new-password"
              className="field-input"
              value={regPassword2}
              onChange={(e) => setRegPassword2(e.target.value)}
            />
            <label className="field-label">Возраст</label>
            <input
              type="number"
              className="field-input"
              min={MIN_WORKER_AGE}
              max={90}
              value={wAge}
              onChange={(e) => setWAge(e.target.value)}
            />
            <label className="field-label">О себе</label>
            <textarea
              className="field-textarea"
              rows={3}
              value={wAbout}
              onChange={(e) => setWAbout(e.target.value)}
              placeholder="Опыт, города работы — кратко"
            />
            <p className="field-label">Направления (несколько)</p>
            <div className="spec-grid">
              {specs.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`spec-chip ${wSpecs.has(s.id) ? "spec-chip-on" : ""}`}
                  onClick={() => toggleSpec(s.id)}
                >
                  {s.label_ru}
                </button>
              ))}
            </div>
            <button type="button" className="primary" disabled={busy} onClick={submitWorker}>
              {busy ? "…" : "Зарегистрироваться"}
            </button>
            {banner && <div className="banner banner-warn">{banner}</div>}
          </div>
        )}

        {sheetMode === "employer" && (
          <div className="form-block">
            <label className="field-label">Телефон</label>
            <input
              type="tel"
              className="field-input"
              value={phoneDigitsToDisplay(regPhone)}
              onChange={(e) => onRegPhoneChange(e.target.value)}
            />
            <label className="field-label">Пароль (минимум {MIN_PASS} символов)</label>
            <input
              type="password"
              autoComplete="new-password"
              className="field-input"
              value={regPassword}
              onChange={(e) => setRegPassword(e.target.value)}
            />
            <label className="field-label">Повтор пароля</label>
            <input
              type="password"
              autoComplete="new-password"
              className="field-input"
              value={regPassword2}
              onChange={(e) => setRegPassword2(e.target.value)}
            />
            <p className="field-label">Вы заказчик как…</p>
            <div className="radio-col">
              <label className="radio-line">
                <input
                  type="radio"
                  name="ek"
                  checked={eKind === "person"}
                  onChange={() => setEKind("person")}
                />
                Частное лицо, разовые задачи
              </label>
              <label className="radio-line">
                <input
                  type="radio"
                  name="ek"
                  checked={eKind === "organization"}
                  onChange={() => setEKind("organization")}
                />
                Компания / организация
              </label>
            </div>
            {eKind === "organization" && (
              <>
                <label className="field-label">Название</label>
                <input
                  className="field-input"
                  value={eOrg}
                  onChange={(e) => setEOrg(e.target.value)}
                  placeholder="Название компании"
                />
                <label className="field-label">ИНН (если есть)</label>
                <input
                  className="field-input"
                  inputMode="numeric"
                  value={eInn}
                  onChange={(e) => setEInn(e.target.value.replace(/\D/g, "").slice(0, 14))}
                  placeholder="Например: 123456789"
                />
              </>
            )}
            <label className="field-label">Комментарий (по желанию)</label>
            <textarea
              className="field-textarea"
              rows={2}
              value={eNote}
              onChange={(e) => setENote(e.target.value)}
              placeholder="Чем занимаетесь, что обычно заказываете"
            />
            <button type="button" className="primary" disabled={busy} onClick={submitEmployer}>
              {busy ? "…" : "Зарегистрироваться"}
            </button>
            {banner && <div className="banner banner-warn">{banner}</div>}
          </div>
        )}
      </CenterModal>
    </div>
  );
}
