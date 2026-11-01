import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CategoryIcon } from "@/components/category-icon";
import { IconPicker } from "@/components/icon-picker";

/**
 * The icon input for a category: a square preview beside the name field,
 * opening the icon pack in a focused dialog. Keeps the create form one row
 * instead of stacking a second full-width picker card under it.
 */
export function CategoryIconField({
  value,
  onChange,
}: {
  value: string;
  onChange: (icon: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Choose an icon"
        title="Choose an icon"
        className="size-10 shrink-0"
        onClick={() => setOpen(true)}
      >
        <CategoryIcon icon={value} className="size-5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="z-[100] max-w-md"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Choose an icon</DialogTitle>
          </DialogHeader>
          <IconPicker
            value={value}
            onSelect={(icon) => {
              onChange(icon);
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
