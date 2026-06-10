import { useState, useCallback } from 'react';
import { Platform } from 'react-native';

export function useVoiceInput() {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const startListening = useCallback(async () => {
    setError(null);
    setTranscript('');
    if (Platform.OS === 'web') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) { setError('Voice input not supported on this browser'); return; }
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event: any) => { setTranscript(event.results[0][0].transcript); setListening(false); };
      recognition.onerror = () => { setError('Voice recognition failed'); setListening(false); };
      recognition.onend = () => setListening(false);
      recognition.start();
      setListening(true);
    } else {
      // Native voice requires the @react-native-voice/voice native module, which
      // is not bundled. Type into the search box instead. (Install that package
      // + rebuild to enable on-device voice.)
      setError('Voice input not available on this device');
    }
  }, []);

  const stopListening = useCallback(async () => {
    setListening(false);
  }, []);

  return { listening, transcript, error, startListening, stopListening, setTranscript };
}
