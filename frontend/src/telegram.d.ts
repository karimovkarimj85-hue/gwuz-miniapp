interface TelegramWebAppPayload {
  initData: string;
  initDataUnsafe?: Record<string, unknown>;
  expand: () => void;
  ready: () => void;
  colorScheme: "light" | "dark";
  themeParams?: Record<string, unknown>;
  MainButton: {
    setParams: (p: { text?: string }) => void;
    show: () => void;
    hide: () => void;
  };
}

interface Window {
  Telegram?: { WebApp: TelegramWebAppPayload };
}
