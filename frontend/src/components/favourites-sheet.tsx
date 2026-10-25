import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Contact, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FavouritesList } from "@/components/favourites-list";
import { Input } from "@/components/ui/input";
import {
	Drawer,
	DrawerContent,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { formatFavouritePhone, type Favourite } from "@/lib/favourites";
import { formatPhoneInput } from "@/lib/format";
import { normalizePhone } from "@/lib/ussd-menus";

export interface FavouritesSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Names the flow, e.g. "Send Money favourites". */
	title?: string;
	favourites: Favourite[];
	loading: boolean;
	picking: boolean;
	canPick: boolean;
	/** Pre-fills the manual form with what is already typed on Send. */
	defaultPhone?: string;
	onAdd: (name: string, phone: string) => Promise<boolean>;
	onRename: (id: string, name: string) => Promise<boolean>;
	onRemove: (id: string) => Promise<boolean>;
	onReorder: (ids: string[]) => Promise<boolean>;
	onPickContact: () => void;
}

/**
 * Manage saved Send recipients: pick a contact (Android) or type a number,
 * then rename, remove or reorder. The list is a local snapshot, so nothing
 * here needs a contacts permission or a contact id.
 */
export function FavouritesSheet({
	open,
	onOpenChange,
	title = "Favourites",
	favourites,
	loading,
	picking,
	canPick,
	defaultPhone,
	onAdd,
	onRename,
	onRemove,
	onReorder,
	onPickContact,
}: FavouritesSheetProps) {
	const [name, setName] = useState("");
	const [phone, setPhone] = useState("");
	const [touched, setTouched] = useState(false);
	const [saving, setSaving] = useState(false);
	const [manual, setManual] = useState(!canPick);

	const phoneOk = normalizePhone(phone) !== "";
	const items = useMemo(
		() =>
			favourites.map((fav) => ({
				id: fav.id,
				name:
					fav.name === fav.phone
						? formatFavouritePhone(fav.phone)
						: fav.name,
				detail:
					fav.name === fav.phone
						? undefined
						: formatFavouritePhone(fav.phone),
			})),
		[favourites],
	);

	// Start each visit from the number already on Send.
	useEffect(() => {
		if (!open) return;
		setName("");
		setPhone(formatPhoneInput(defaultPhone ?? ""));
		setTouched(false);
		setManual(!canPick);
	}, [open, defaultPhone, canPick]);

	async function handleAdd(e: FormEvent) {
		e.preventDefault();
		setTouched(true);
		const canonical = normalizePhone(phone);
		if (!canonical) return;

		setSaving(true);
		const ok = await onAdd(name, canonical);
		setSaving(false);
		if (ok) {
			setName("");
			setPhone("");
			setTouched(false);
		}
	}

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent className="max-h-[88vh]">
				<DrawerHeader>
					<DrawerTitle>{title}</DrawerTitle>
				</DrawerHeader>

				<div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-2">
					<section className="space-y-2">
						{canPick && (
							<Button
								type="button"
								variant="outline"
								className="w-full justify-center gap-2"
								onClick={onPickContact}
								disabled={picking}
							>
								{picking ? (
									<Loader2 className="size-4 animate-spin" aria-hidden />
								) : (
									<Contact className="size-4" aria-hidden />
								)}
								{picking ? "Waiting for contact…" : "Pick from contacts"}
							</Button>
						)}

						{!manual ? (
							<Button
								type="button"
								variant="outline"
								className="w-full justify-center gap-2"
								onClick={() => setManual(true)}
							>
								<Plus className="size-4" aria-hidden />
								Enter manually
							</Button>
						) : (
							<form onSubmit={handleAdd} className="space-y-2">
								<Input
									aria-label="Favourite name"
									placeholder="Name (optional)"
									value={name}
									maxLength={60}
									onChange={(e) => setName(e.target.value)}
								/>
								<Input
									aria-label="Favourite phone number"
									inputMode="tel"
									placeholder="07XX XXX XXX"
									value={phone}
									onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
									aria-invalid={touched && !phoneOk}
								/>
								{touched && !phoneOk && (
									<span className="block text-[11px] text-destructive">
										Enter a valid Kenyan mobile number.
									</span>
								)}
								<Button type="submit" className="w-full" disabled={saving}>
									{saving ? (
										<Loader2 className="size-4 animate-spin" aria-hidden />
									) : (
										<Plus className="size-4" aria-hidden />
									)}
									Add favourite
								</Button>
							</form>
						)}
					</section>

					<FavouritesList
						items={items}
						loading={loading}
						onRename={onRename}
						onRemove={onRemove}
						onReorder={onReorder}
					/>
				</div>

				<DrawerFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Close
					</Button>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}

export default FavouritesSheet;
