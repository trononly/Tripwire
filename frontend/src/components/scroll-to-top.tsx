import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Resets the window scroll on every route change. Pages are separate
 * contexts, so a new route should start at its top, not wherever the
 * previous page was scrolled to.
 */
export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
