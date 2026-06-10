import { useEffect, useRef } from 'react';

export function useFrameworkReady() {
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
}
