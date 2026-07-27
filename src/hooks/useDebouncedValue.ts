/**
 * Delay a rapidly-changing value until it settles.
 *
 * Exists because the gateway allows 60 requests/min per IP (spec §1.4) and the entry
 * screen changes on every keystroke — firing a validation per character would burn the
 * whole budget in a few seconds of typing.
 */
import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
