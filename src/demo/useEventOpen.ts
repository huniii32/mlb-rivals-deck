import { useEffect, useState } from 'react';
import { isEventOpen } from './eventAvailability';

export function useEventOpen() {
  const [open, setOpen] = useState(() => isEventOpen());
  useEffect(() => {
    const refresh = () => setOpen(isEventOpen());
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    refresh();
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return open;
}
