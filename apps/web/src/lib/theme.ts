export type Theme = "light" | "dark";

const KEY = "hub-theme";

/** รันก่อนหน้าแสดงผล เพื่อไม่ให้จอกะพริบเป็นสีสว่างก่อนเปลี่ยนเป็นโหมดมืด */
export const THEME_BOOT_SCRIPT = `(function(){var t;try{t=localStorage.getItem("${KEY}")}catch(e){}if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t})()`;

export const currentTheme = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export function saveTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // โหมดส่วนตัวบางแบบเขียนไม่ได้ ใช้ได้เฉพาะรอบนี้ก็เพียงพอ
  }
}
