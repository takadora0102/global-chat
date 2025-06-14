// constants.js – Language and Flag Mappings for Global Chat Bot

/**
 * List of language choices for the server setup menu.
 * Each item contains the display label, the language code
 * used for configuration and the corresponding flag emoji.
 * @type {{label: string, value: string, emoji: string}[]}
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
 * Mapping from flag emoji to translation language code.
 * @type {Record<string, string>}
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

/**
 * Region selection list used in the help and setup flows.
 * @type {{label: string, value: string, emoji: string}[]}
 */
export const REGIONS = [
  { label: 'Asia',                   value: 'asia',          emoji: '🌏' },
  { label: 'Europe',                 value: 'europe',        emoji: '🌍' },
  { label: 'North America',          value: 'north_america', emoji: '🌎' },
  { label: 'South America',          value: 'south_america', emoji: '🌎' },
  { label: 'Middle East & Africa',   value: 'mea',           emoji: '🌍' },
  { label: 'Oceania',                value: 'oceania',       emoji: '🌏' }
];

/**
 * Mapping from region identifier to supported language codes.
 * @type {Record<string, string[]>}
 */
export const REGION_LANGS = {
  asia:         ['en','ja','zh','zh-TW','ko','vi'],
  europe:       ['en','es','fr','de','ru','uk','el'],
  north_america:['en','es','fr'],
  south_america:['es','pt-BR'],
  mea:          ['ar','fa','he','tr','ur'],
  oceania:      ['en','en-AU','en-NZ']
};

// ----- Gemini Translation Feature -----
/** Channel name used for Gemini translation setup. */
export const CHANNEL_NAME_SETUP = 'settings';

/** Password required to enable Gemini translation. */
export const SETUP_PASSWORD = 'ct1204';

/** Requests per minute limit for Gemini API usage. */
export const RATE_LIMIT_RPM = 15;

/** Requests per day limit for Gemini API usage. */
export const RATE_LIMIT_RPD = 1500;

/** Fallback translation API endpoint (Google Translate). */
export const FALLBACK_API_URL = process.env.FALLBACK_API_URL ||
  'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&dt=t';
