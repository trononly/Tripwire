import { Browser } from "@wailsio/runtime";
import { isAndroidBridge } from "@/lib/sms-bridge";

/** Tip-jar link shown in Settings. */
export const SODA_URL =
  "https://buymesoda.com/cZxN2bSMZddvzVDzv4EXEgCdogo2";

/**
 * Open an external page in the system browser — never inside the app
 * WebView (a WebView navigation would strand the user with no way back).
 * Android uses the injected bridge; desktop uses the Wails runtime; plain
 * browsers fall back to a _blank anchor.
 */
export function openExternalUrl(url: string): void {
  if (isAndroidBridge() && window.wails?.openURL !== undefined) {
    window.wails.openURL(url);
    return;
  }
  try {
    void Browser.OpenURL(url);
    return;
  } catch {
    /* not running under Wails (web preview): fall through */
  }
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noreferrer noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
