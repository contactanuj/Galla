import { useState, useCallback } from 'react';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import i18n from '../i18n';

function localeTag() {
  return i18n.language === 'hi' ? 'hi-IN' : 'en-US';
}

/**
 * On-device speech-to-text via expo-speech-recognition (New-Architecture
 * compatible; uses the Web Speech API on web and the native recognizer on
 * Android/iOS). Fills the search box with the spoken text.
 */
export function useVoiceInput() {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  useSpeechRecognitionEvent('result', (event: any) => {
    const text = event?.results?.[0]?.transcript;
    if (text) setTranscript(text);
  });
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('error', (event: any) => {
    setError(event?.error ? `Voice: ${event.error}` : 'Voice recognition failed');
    setListening(false);
  });

  const startListening = useCallback(async () => {
    setError(null);
    setTranscript('');
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) { setError('Microphone permission denied'); return; }
      ExpoSpeechRecognitionModule.start({ lang: localeTag(), interimResults: true, continuous: false });
      setListening(true);
    } catch {
      setError('Voice input not available on this device');
      setListening(false);
    }
  }, []);

  const stopListening = useCallback(async () => {
    setListening(false);
    try { ExpoSpeechRecognitionModule.stop(); } catch { /* already stopped */ }
  }, []);

  return { listening, transcript, error, startListening, stopListening, setTranscript };
}
