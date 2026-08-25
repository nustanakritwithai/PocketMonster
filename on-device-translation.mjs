function fallbackLanguage(text) {
  if (/[฀-๿]/u.test(text)) return 'th';
  if (/[぀-ヿ]/u.test(text)) return 'ja';
  if (/[가-힯]/u.test(text)) return 'ko';
  if (/[一-鿿]/u.test(text)) return 'zh';
  if (/[Ѐ-ӿ]/u.test(text)) return 'ru';
  if (/[؀-ۿ]/u.test(text)) return 'ar';
  return 'en';
}

export function looksThai(text) {
  return /[฀-๿]/u.test(String(text || ''));
}

export async function translateToThaiOnDevice(text, onProgress = () => {}) {
  const value = String(text || '').trim();
  if (!value || looksThai(value)) return value;
  if (!globalThis.Translator) throw new Error('WebView นี้ยังไม่รองรับการแปลในเครื่อง');
  let sourceLanguage = fallbackLanguage(value);
  let detector;
  try {
    if (globalThis.LanguageDetector && await globalThis.LanguageDetector.availability() !== 'unavailable') {
      detector = await globalThis.LanguageDetector.create({monitor(monitor) { monitor.addEventListener('downloadprogress', event => onProgress(event.loaded)); }});
      const candidates = await detector.detect(value);
      sourceLanguage = candidates?.[0]?.detectedLanguage || sourceLanguage;
    }
  } finally { detector?.destroy?.(); }
  if (sourceLanguage === 'th') return value;
  const options = {sourceLanguage, targetLanguage: 'th'};
  if (await globalThis.Translator.availability(options) === 'unavailable') throw new Error(`ยังไม่มีโมเดลแปลภาษา ${sourceLanguage} → ไทยในเครื่อง`);
  const translator = await globalThis.Translator.create({...options, monitor(monitor) { monitor.addEventListener('downloadprogress', event => onProgress(event.loaded)); }});
  try { return await translator.translate(value); } finally { translator.destroy?.(); }
}
