import { useEffect, useState } from 'react';

/** Голоса для языка текста: 'pl' -> все голоса pl-*. */
export function voicesFor(lang: string): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  const code = lang.toLowerCase().slice(0, 2);
  return window.speechSynthesis
    .getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith(code));
}

export function speak(text: string, rate: number, lang = 'pl'): boolean {
  if (!('speechSynthesis' in window)) return false;
  const synth = window.speechSynthesis;
  synth.cancel();

  const code = lang.toLowerCase().slice(0, 2);
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = code === 'pl' ? 'pl-PL' : code;
  utterance.rate = rate;

  const voice = voicesFor(lang)[0];
  if (voice) utterance.voice = voice;

  synth.speak(utterance);
  return true;
}

export function stopSpeaking(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

/** Голоса подгружаются асинхронно — следим за событием voiceschanged. */
export function useVoices(lang: string): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => voicesFor(lang));

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const update = () => setVoices(voicesFor(lang));
    update();
    window.speechSynthesis.addEventListener('voiceschanged', update);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update);
  }, [lang]);

  return voices;
}
