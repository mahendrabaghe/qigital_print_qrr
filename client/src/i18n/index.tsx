import React, { createContext, useContext, useEffect, useState } from 'react';

export type Lang = 'en' | 'hi';

type Dict = Record<string, string | ((n: number) => string)>;

const en: Dict = {
  // generic
  appName: 'Digital Print Shop',
  loading: 'Loading…',
  error: 'Something went wrong',
  retry: 'Retry',
  cancel: 'Cancel',
  close: 'Close',
  save: 'Save',
  delete: 'Delete',
  done: 'Done',
  back: 'Back',
  next: 'Next',
  languageName: 'English',

  // landing
  welcome: 'Welcome to the print shop',
  scanCta: 'Scan the QR code at the counter to start printing',
  scanCtaHint: 'Point your phone camera at the QR code — it opens this page with your print session.',
  adminLink: 'Shopkeeper login',

  // upload page
  uploadTitle: 'Upload your files',
  uploadHint: 'Select photos or documents from your phone',
  uploadButton: 'Choose files',
  cameraButton: 'Take a photo',
  cameraCapture: 'Capture',
  cameraSwitch: 'Flip',
  cameraClose: 'Close camera',
  cameraError: 'Could not access the camera. Check browser permissions.',
  filesTitle: 'Your files',
  privacyNote: 'Your files are temporarily stored only for processing your print request and are automatically deleted after the configured retention period.',
  filesRetention: (h: number) => (h >= 168 ? 'Files are kept for 7 days' : h >= 24 ? `Files are kept for ${h / 24} day(s)` : `Files are kept for ${h} hour(s)`),
  edit: 'Edit',
  edited: 'Edited',
  remove: 'Remove',
  addMore: 'Add more files',
  continue: 'Continue',
  uploading: 'Uploading…',
  uploadFailed: 'Upload failed',
  fileTooLarge: 'File is too large',
  unsupportedType: 'This file type is not supported. Allowed: PDF, JPG, PNG, WEBP.',
  emptyFiles: 'Add at least one file to continue',

  // editor
  editorTitle: 'Edit photo',
  crop: 'Crop',
  rotate: 'Rotate',
  flipH: 'Flip ↔',
  flipV: 'Flip ↕',
  adjust: 'Adjust',
  filters: 'Filters',
  scanMode: 'Scan mode',
  original: 'Original',
  auto: 'Auto',
  bwDoc: 'B&W Document',
  bright: 'Bright',
  contrasty: 'Contrast',
  brightness: 'Brightness',
  contrast: 'Contrast',
  saturation: 'Saturation',
  undo: 'Undo',
  redo: 'Redo',
  resetEdit: 'Reset',
  applyEdit: 'Save changes',
  ratioFree: 'Free',
  ratioSquare: 'Square',
  ratioA4: 'A4',
  ratio3_4: '3:4',
  ratio4_3: '4:3',
  scanHint: 'Drag the 4 corners onto the document edges. The document is flattened automatically.',
  scanEnhance: 'Enhance (B&W)',
  scanColor: 'Keep color',

  // settings step
  settingsTitle: 'Print settings',
  paper: 'Paper size',
  colorMode: 'Color mode',
  color: 'Color',
  bw: 'Black & White',
  copies: 'Copies',
  orientation: 'Orientation',
  portrait: 'Portrait',
  landscape: 'Landscape',
  sides: 'Sides',
  single: 'Single side',
  double: 'Double side',
  scaling: 'Scaling',
  actual: 'Actual size',
  fit: 'Fit to page',
  fill: 'Fill page',
  pagesPerSheet: 'Pages per sheet',
  pageRange: 'Pages (e.g. 1-3 or 1,3,5)',
  pageRangeAll: 'All pages',
  pageRangeInvalid: 'Invalid page selection',

  // preview + submit
  previewTitle: 'Preview & confirm',
  pagesCount: (n: number) => `${n} page${n === 1 ? '' : 's'}`,
  estimated: 'Estimated price',
  submitPrint: 'Submit print request',
  submitting: 'Submitting…',

  // status
  statusTitle: 'Your print request',
  statusWaiting: 'Waiting for the shopkeeper',
  statusProcessing: 'Preparing your print',
  statusPrinting: 'Printing now',
  statusCompleted: 'Ready! Please collect at the counter',
  statusRejected: 'Request rejected',
  statusCancelled: 'Request cancelled',
  statusHintWaiting: 'We have notified the shop. This usually takes less than a minute.',
  statusHintPrinting: 'The printer is working on your documents.',
  statusHintCompleted: 'Show this screen at the counter and pay there.',
  rejectReason: 'Reason',
  downloadReceipt: 'Download receipt',
  newSession: 'Print something else',
  sessionExpired: 'Your print session has expired. Please scan the shop QR code again.',
  invalidQr: 'This QR code is not valid. Please ask the shopkeeper for the current QR code.',
};

const hi: Dict = {
  appName: 'डिजिटल प्रिंट शॉप',
  loading: 'लोड हो रहा है…',
  error: 'कुछ गड़बड़ हो गई',
  retry: 'फिर कोशिश करें',
  cancel: 'रद्द करें',
  close: 'बंद करें',
  save: 'सेव करें',
  delete: 'हटाएँ',
  done: 'हो गया',
  back: 'वापस',
  next: 'आगे बढ़ें',
  languageName: 'हिन्दी',

  welcome: 'प्रिंट शॉप में आपका स्वागत है',
  scanCta: 'प्रिंट शुरू करने के लिए काउंटर पर दिए QR कोड को स्कैन करें',
  scanCtaHint: 'अपने फ़ोन के कैमरे से QR कोड पर निशान लगाएँ — यह पेज आपकी प्रिंट सेशन के साथ खुलेगा।',
  adminLink: 'दुकानदार लॉगिन',

  uploadTitle: 'अपनी फ़ाइलें अपलोड करें',
  uploadHint: 'अपने फ़ोन से फ़ोटो या डॉक्यूमेंट चुनें',
  uploadButton: 'फ़ाइलें चुनें',
  cameraButton: 'फ़ोटो लें',
  cameraCapture: 'कैप्चर',
  cameraSwitch: 'पलटें',
  cameraClose: 'कैमरा बंद करें',
  cameraError: 'कैमरा नहीं खुला। ब्राउज़र की अनुमति जाँचें।',
  filesTitle: 'आपकी फ़ाइलें',
  privacyNote: 'आपकी फ़ाइलें केवल आपकी प्रिंट रिक्वेस्ट पूरी करने के लिए अस्थायी रूप से रखी जाती हैं और तय समय के बाद अपने आप हट जाती हैं।',
  filesRetention: (h: number) => (h >= 168 ? 'फ़ाइलें 7 दिन तक रखी जाती हैं' : h >= 24 ? `फ़ाइलें ${h / 24} दिन तक रखी जाती हैं` : `फ़ाइलें ${h} घंटे तक रखी जाती हैं`),
  edit: 'एडिट',
  edited: 'एडिट किया',
  remove: 'हटाएँ',
  addMore: 'और फ़ाइलें जोड़ें',
  continue: 'आगे बढ़ें',
  uploading: 'अपलोड हो रहा है…',
  uploadFailed: 'अपलोड नहीं हुआ',
  fileTooLarge: 'फ़ाइल बहुत बड़ी है',
  unsupportedType: 'यह फ़ाइल टाइप समर्थित नहीं है। अनुमति: PDF, JPG, PNG, WEBP।',
  emptyFiles: 'आगे बढ़ने के लिए कम से कम एक फ़ाइल जोड़ें',

  editorTitle: 'फ़ोटो एडिट करें',
  crop: 'क्रॉप',
  rotate: 'घुमाएँ',
  flipH: 'पलटें ↔',
  flipV: 'पलटें ↕',
  adjust: 'एडजस्ट',
  filters: 'फ़िल्टर',
  scanMode: 'स्कैन मोड',
  original: 'मूल',
  auto: 'ऑटो',
  bwDoc: 'B&W डॉक्यूमेंट',
  bright: 'चमकीला',
  contrasty: 'कंट्रास्ट',
  brightness: 'चमक',
  contrast: 'कंट्रास्ट',
  saturation: 'रंगीनता',
  undo: 'वापस लें',
  redo: 'दोबारा',
  resetEdit: 'रीसेट',
  applyEdit: 'बदलाव सेव करें',
  ratioFree: 'फ्री',
  ratioSquare: 'चौकोर',
  ratioA4: 'A4',
  ratio3_4: '3:4',
  ratio4_3: '4:3',
  scanHint: '4 कोनों को डॉक्यूमेंट के किनारों पर खींचें। डॉक्यूमेंट अपने आप सीधा हो जाएगा।',
  scanEnhance: 'बेहतर (B&W)',
  scanColor: 'रंग रखें',

  settingsTitle: 'प्रिंट सेटिंग्स',
  paper: 'कागज़ का आकार',
  colorMode: 'रंग मोड',
  color: 'रंगीन',
  bw: 'काला-सफ़ेद',
  copies: 'कॉपियाँ',
  orientation: 'दिशा',
  portrait: 'पोर्ट्रेट',
  landscape: 'लैंडस्केप',
  sides: 'साइड',
  single: 'एक तरफ़',
  double: 'दोनों तरफ़',
  scaling: 'स्केलिंग',
  actual: 'असली आकार',
  fit: 'पेज में फ़िट',
  fill: 'पेज भरें',
  pagesPerSheet: 'प्रति शीट पेज',
  pageRange: 'पेज (जैसे 1-3 या 1,3,5)',
  pageRangeAll: 'सभी पेज',
  pageRangeInvalid: 'पेज चुनाव ग़लत है',

  previewTitle: 'प्रीव्यू और पुष्टि',
  pagesCount: (n: number) => `${n} पेज`,
  estimated: 'अनुमानित कीमत',
  submitPrint: 'प्रिंट रिक्वेस्ट भेजें',
  submitting: 'भेज रहे हैं…',

  statusTitle: 'आपकी प्रिंट रिक्वेस्ट',
  statusWaiting: 'दुकानदार का इंतज़ार',
  statusProcessing: 'प्रिंट की तैयारी',
  statusPrinting: 'प्रिंट हो रहा है',
  statusCompleted: 'तैयार! काउंटर से ले जाएँ',
  statusRejected: 'रिक्वेस्ट अस्वीकृत',
  statusCancelled: 'रिक्वेस्ट रद्द',
  statusHintWaiting: 'दुकान को सूचना मिल गई है। इसमें आमतौर पर एक मिनट से कम लगता है।',
  statusHintPrinting: 'प्रिंटर आपके डॉक्यूमेंट पर काम कर रहा है।',
  statusHintCompleted: 'यह स्क्रीन काउंटर पर दिखाएँ और वहीं भुगतान करें।',
  rejectReason: 'कारण',
  downloadReceipt: 'रसीद डाउनलोड करें',
  newSession: 'कुछ और प्रिंट करें',
  sessionExpired: 'आपका प्रिंट सेशन समाप्त हो गया। कृपया दुकान का QR कोड फिर स्कैन करें।',
  invalidQr: 'यह QR कोड मान्य नहीं है। दुकानदार से वर्तमान QR कोड लें।',
};

const dicts: Record<Lang, Dict> = { en, hi };
const LANG_KEY = 'ps_lang';

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  tFn: (key: string) => ((n: number) => string) | null;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children, initial }: { children: React.ReactNode; initial?: Lang }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(LANG_KEY) as Lang | null;
    if (saved === 'en' || saved === 'hi') return saved;
    return initial ?? 'en';
  });

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem(LANG_KEY, l);
  };

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = (key: string, vars?: Record<string, string | number>) => {
    const value = dicts[lang][key] ?? dicts.en[key] ?? key;
    let str = typeof value === 'string' ? value : key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) str = str.replaceAll(`{${k}}`, String(v));
    }
    return str;
  };

  const tFn = (key: string) => {
    const val = dicts[lang][key] ?? dicts.en[key];
    return typeof val === 'function' ? (val as (n: number) => string) : null;
  };

  return <I18nContext.Provider value={{ lang, setLang, t, tFn }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="inline-flex overflow-hidden rounded-xl ring-1 ring-slate-300 bg-white">
      {(['en', 'hi'] as Lang[]).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          className={`px-3 py-1.5 text-xs font-semibold transition ${
            lang === l ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
          aria-pressed={lang === l}
        >
          {compact ? l.toUpperCase() : t('languageName')}
        </button>
      ))}
    </div>
  );
}
