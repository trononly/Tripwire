import { Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { openAppSettings } from "@/lib/sms-bridge";

/**
 * Shown when an SMS permission request comes back denied without a
 * rationale - the sideloaded-install case (GitHub APK): Android blocks the
 * grant behind "Allow restricted settings" Walks them through the one-time setup, then they come back and the app asks for the permission itself.
 */
export function RestrictedSettingsGuide({
  open,
  onOpenChange,
  onRetry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Re-runs the import, which re-asks for SMS access in-app. */
  onRetry: () => void;
}) {
  const retry = () => {
    onOpenChange(false);
    onRetry();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>SMS access needs one extra step</DialogTitle>
          <DialogDescription>
            Because Tripwire was installed from GitHub instead of the Play
            Store, Android blocks SMS access and Accessibility Permissions until
            you allow restricted settings. Don't worry, you'll do this once,
            updates won't break it
          </DialogDescription>
        </DialogHeader>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            Tap <strong>Open app settings</strong> below (lands on
            Tripwire&apos;s App info page).
          </li>
          <li>
            Tap the <strong>⋮</strong> menu (top right) →{" "}
            <strong>Allow restricted settings</strong>, then confirm with your
            PIN or fingerprint.
          </li>
          <li>
            Back on App info → <strong>Permissions → SMS → Allow</strong>.
          </li>
          <li>
            Come back here and tap <strong>Try again</strong> - the app asks for
            the permission itself.
          </li>
        </ol>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={openAppSettings}>
            <Settings2 />
            Open app settings
          </Button>
          <Button onClick={retry}>Try again</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
