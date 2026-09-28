import { useEffect, useState } from "react";

/*
 * Gives time-aware screens a fresh current time once per minute.
 * We do not need a per-second update because WorkBooks displays
 * work/schedule durations in minutes.
 */
export function useNow() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  return now;
}
