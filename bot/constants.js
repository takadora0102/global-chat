// constants.js – Language and Flag Mappings for Global Chat Bot

/**
 * サーバー言語選択メニューに表示する言語一覧
 * emoji: 国旗絵文字, value: サーバー設定用言語コード
 */
export const LANG_CHOICES = [
  { label: '日本語',           value: 'ja',     emoji: '🇯🇵' },
  { label: 'English (US)',     value: 'en',     emoji: '🇺🇸' },
  { label: 'English (UK)',     value: 'en-GB',  emoji: '🇬🇧' },
  { label: '中文 (简体)',        value: 'zh',     emoji: '🇨🇳' },
  { label: '中文 (繁體)',        value: 'zh-TW',  emoji: '🇹🇼' },
  { label: '한국어',           value: 'ko',     emoji: '🇰🇷' },
  { label: 'Español (ES)',     value: 'es',     emoji: '🇪🇸' },
  { label: 'Español (MX)',     value: 'es-MX',  emoji: '🇲🇽' },
  { label: 'Français',         value: 'fr',     emoji: '🇫🇷' },
  { label: 'Deutsch',          value: 'de',     emoji: '🇩🇪' },
  { label: 'Português (PT)',   value: 'pt',     emoji: '🇵🇹' },
  { label: 'Português (BR)',   value: 'pt-BR',  emoji: '🇧🇷' },
  { label: 'Русский',          value: 'ru',     emoji: '🇷🇺' },
  { label: 'Українська',       value: 'uk',     emoji: '🇺🇦' },
  { label: 'ελληνικά',         value: 'el',     emoji: '🇬🇷' },
  { label: 'עִבְרִית',        value: 'he',     emoji: '🇮🇱' },
  { label: 'اردو',             value: 'ur',     emoji: '🇵🇰' },
  { label: 'Bahasa Melayu',    value: 'ms',     emoji: '🇲🇾' },
  { label: 'Español (CO)',     value: 'es-CO',  emoji: '🇨🇴' },
  { label: 'فارسی',            value: 'fa',     emoji: '🇮🇷' },
  { label: 'বাংলা',            value: 'bn',     emoji: '🇧🇩' },
  { label: 'ไทย',              value: 'th',     emoji: '🇹🇭' },
  { label: 'Tiếng Việt',       value: 'vi',     emoji: '🇻🇳' },
  { label: 'हिन्दी',           value: 'hi',     emoji: '🇮🇳' },
  { label: 'Bahasa Indonesia', value: 'id',     emoji: '🇮🇩' },
  { label: 'العربية',          value: 'ar',     emoji: '🇸🇦' },
];

/**
 * 国旗リアクション → 翻訳言語コードのマッピング
 */
export const FLAG_TO_LANG = {
  '🇯🇵': 'ja',
  '🇺🇸': 'en',
  '🇬🇧': 'en-GB',
  '🇨🇳': 'zh',
  '🇹🇼': 'zh-TW',
  '🇰🇷': 'ko',
  '🇪🇸': 'es',
  '🇲🇽': 'es-MX',
  '🇫🇷': 'fr',
  '🇩🇪': 'de',
  '🇵🇹': 'pt',
  '🇧🇷': 'pt-BR',
  '🇷🇺': 'ru',
  '🇺🇦': 'uk',
  '🇬🇷': 'el',
  '🇮🇱': 'he',
  '🇵🇰': 'ur',
  '🇲🇾': 'ms',
  '🇨🇴': 'es-CO',
  '🇮🇷': 'fa',
  '🇧🇩': 'bn',
  '🇹🇭': 'th',
  '🇻🇳': 'vi',
  '🇮🇳': 'hi',
  '🇮🇩': 'id',
  '🇸🇦': 'ar'
};
