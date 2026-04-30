/** Нормализация в +998 + 9 цифр (как на бэкенде). */

export function normalizeUzPhone(input: string): string {
  const d = input.replace(/\D/g, "");
  let rest: string;
  if (d.startsWith("998")) {
    rest = d.slice(3);
  } else if (d.length === 9) {
    rest = d;
  } else {
    throw new Error("Укажите номер: +998 и 9 цифр");
  }
  if (rest.length !== 9) {
    throw new Error("Нужно 9 цифр после +998");
  }
  return `+998${rest}`;
}

/** Маска отображения: +998 XX XXX XX XX */
export function formatUzPhoneDisplay(digitsFromUser: string): string {
  const d = digitsFromUser.replace(/\D/g, "").replace(/^998/, "");
  const rest = d.length > 9 ? d.slice(0, 9) : d;
  const parts = [
    rest.slice(0, 2),
    rest.slice(2, 5),
    rest.slice(5, 7),
    rest.slice(7, 9),
  ].filter(Boolean);
  if (parts.length === 0) return "+998 ";
  return `+998 ${parts.join(" ").trim()}`;
}
