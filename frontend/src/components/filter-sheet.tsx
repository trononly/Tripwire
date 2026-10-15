import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { vibrateIfEnabled } from "@/lib/motion-settings";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

export type FilterRangeKey = "7D" | "30D" | "90D" | "YTD" | "All" | "Custom";

const PRESETS: FilterRangeKey[] = ["7D", "30D", "90D", "YTD", "All", "Custom"];

export interface FilterSheetProps {
  rangeKey: FilterRangeKey;
  range?: { start: string; end: string };
  label?: string;
  onRangeChange: (key: FilterRangeKey) => void;
  onCustomSubmit: (start: string, end: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Same controlled Vaul pattern as the Transactions filter drawer:
// plain <Drawer open onOpenChange> + themeless <DrawerContent>.
export function FilterSheet({
  rangeKey,
  range,
  label,
  onRangeChange,
  onCustomSubmit,
  open,
  onOpenChange,
}: FilterSheetProps) {
  const [start, setStart] = React.useState(range?.start ?? "");
  const [end, setEnd] = React.useState(range?.end ?? "");

  React.useEffect(() => {
    setStart(range?.start ?? "");
    setEnd(range?.end ?? "");
  }, [range?.start, range?.end, open]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Filter dashboard</DrawerTitle>
          {label ? <DrawerDescription>{label}</DrawerDescription> : null}
        </DrawerHeader>
        <div className="grid grid-cols-3 gap-2 p-4">
          {PRESETS.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={rangeKey === key}
              onClick={() => {
                vibrateIfEnabled(8);
                onRangeChange(key);
                if (key !== "Custom") onOpenChange(false);
              }}
              className={cn("tile", rangeKey === key && "tile-active")}
            >
              {key}
            </button>
          ))}
        </div>
        {rangeKey === "Custom" && (
          <div className="space-y-4 px-4 pb-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Start Date</label>
                <Input
                  type="date"
                  aria-label="Start date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">End Date</label>
                <Input
                  type="date"
                  aria-label="End date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                onCustomSubmit(start, end);
                onOpenChange(false);
              }}
            >
              Apply range
            </Button>
          </div>
        )}
        <DrawerFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

export default FilterSheet;
