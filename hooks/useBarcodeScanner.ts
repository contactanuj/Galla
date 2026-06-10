import { useState, useCallback } from 'react';
import { Platform } from 'react-native';

export function useBarcodeScanner() {
  const [scanning, setScanning] = useState(false);
  const [manualInput, setManualInput] = useState('');

  const startScanning = useCallback(() => setScanning(true), []);
  const stopScanning = useCallback(() => setScanning(false), []);

  const handleManualSubmit = useCallback((callback: (barcode: string) => void) => {
    if (manualInput.trim()) {
      callback(manualInput.trim());
      setManualInput('');
    }
  }, [manualInput]);

  return { scanning, manualInput, setManualInput, startScanning, stopScanning, handleManualSubmit, isNative: Platform.OS !== 'web' };
}
