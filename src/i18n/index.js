import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import zh from "./locales/zh.json";
import fr from "./locales/fr.json";
import ru from "./locales/ru.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import es from "./locales/es.json";
import pt from "./locales/pt.json";
import de from "./locales/de.json";

const initPromise = i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
    fr: { translation: fr },
    ru: { translation: ru },
    ja: { translation: ja },
    ko: { translation: ko },
    es: { translation: es },
    pt: { translation: pt },
    de: { translation: de },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

// Debug: log i18n initialization status
initPromise.then(() => {
  console.log('[i18n] initialized, language:', i18n.language);
  console.log('[i18n] has en resources:', !!i18n.getResourceBundle('en', 'translation'));
}).catch(err => {
  console.error('[i18n] init failed:', err.message);
});

// Export the init promise so App.tsx can wait for i18n to be ready
export { initPromise };
export default i18n;
