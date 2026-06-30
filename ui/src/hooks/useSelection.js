import { useSearchParams } from "react-router-dom"

// useSelection reads and writes a single selection to a URL query param, so a
// selected record (deck, draft, player) is shareable and survives reload.
// Returns [value, setValue]; setValue("") clears the param.
export function useSelection(key) {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) || "";
  const setValue = (next) => {
    const p = new URLSearchParams(params);
    if (next) {
      p.set(key, next);
    } else {
      p.delete(key);
    }
    setParams(p, { replace: true });
  };
  return [value, setValue];
}
