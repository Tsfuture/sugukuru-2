import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ja from './locales/ja.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import ko from './locales/ko.json';
import zhTW from './locales/zh-TW.json';
import zhCN from './locales/zh-CN.json';

const LANG_KEY = 'lang';

// localStorage から言語を取得、なければブラウザ設定から判定してデフォルトは 'ja'
function getSavedLanguage(): string {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && ['ja', 'en', 'es', 'fr', 'ko', 'zh-TW', 'zh-CN'].includes(saved)) {
      return saved;
    }
  } catch {
    // localStorage が使えない環境でも動作
  }
  return 'ja';
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      ja: { translation: ja },
      en: { translation: en },
      es: { translation: es },
      fr: { translation: fr },
      ko: { translation: ko },
      'zh-TW': { translation: zhTW },
      'zh-CN': { translation: zhCN },
    },
    lng: getSavedLanguage(),
    fallbackLng: 'ja',
    interpolation: {
      escapeValue: false, // React は既にエスケープするので不要
    },
  });

// 言語変更時に localStorage に保存
i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem(LANG_KEY, lng);
  } catch {
    // 無視
  }
});

export default i18n;
