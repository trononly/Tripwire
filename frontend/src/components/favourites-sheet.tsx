import { useEffect, useState, type FormEvent } from "react";
import {
	Check,
	Contact,
	Loader2,
	Pencil,
	Plus,
	Star,
	Trash2,
	X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import {
	favouriteInitials,
	formatFavouritePhone,
	type Favourite,
} from "@/lib/favourites";
import { normalizePhone } from "@/lib/ussd-menus";

export interface FavouritesSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	favourites: Favourite[];
	loading: boolean;
	picking: boolean;
	canPick: boolean;
	/** Pre-fills the manual form with what is already typed on Send. */
	defaultPhone?: string;
	onAdd: (name: string, phone: string) => Promise<boolean>;
	onRename: (id: string, name: string) => Promise<boolean>;
	onRemove: (id: string) => Promise<boolean>;
	onPickContact: () => void;
}

/**
 * Manage saved Send recipients: pick a contact (Android), add a number by
 * hand, rename, remove. The list is a local snapshot, so nothing here needs
 * a contacts permission or a contact id.
 */
export function FavouritesSheet({
	open,
	onOpenChange,
	favourites,
	loading,
	picking,
	canPick,
	defaultPhone,
	onAdd,
	onRename,
	onRemove,
	onPickContact,
}: FavouritesSheetProps) {
	const [name, setName] = useState("");
	const [phone, setPhone] = useState("");
	const [touched, setTouched] = useState(false);
	const [saving, setSaving] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [confirmId, setConfirmId] = useState<string | null>(null);
	const [removingId, setRemovingId] = useState<string | null>(null);

	const phoneOk = normalizePhone(phone) !== "";

	// Start each visit from the number already on Send, and drop any edit/
	// confirm state left from last time.
	useEffect(() => {
		if (!open) return;
		setName("");
		setPhone(defaultPhone ?? "");
		setTouched(false);
		setEditingId(null);
		setConfirmId(null);
	}, [open, defaultPhone]);

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

	async function saveRename(id: string) {
		const clean = editName.trim();
		if (!clean) {
			toast.error("Favourite name cannot be empty.");
			return;
		}
		if (await onRename(id, clean)) setEditingId(null);
	}

	async function removeFavourite(id: string) {
		setRemovingId(id);
		const ok = await onRemove(id);
		setRemovingId(null);
		if (ok) setConfirmId(null);
	}

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent className="max-h-[88vh]">
				<DrawerHeader>
					<DrawerTitle>Favourites</DrawerTitle>
					<DrawerDescription>
						People you send money to often. Tap a chip on Send to fill the
						number - sending stays a separate tap.
					</DrawerDescription>
				</DrawerHeader>

				<div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-2">
					<section className="space-y-2">
						{canPick && (
							<>
								<Button
									type="button"
									variant="outline"
									className="w-full justify-start gap-2"
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
								<p className="text-[11px] text-muted-foreground">
									Uses the system picker, so Tripwire never gets access to
									your contacts.
								</p>
								<div className="flex items-center gap-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
									<span className="h-px flex-1 bg-border" />
									or add manually
									<span className="h-px flex-1 bg-border" />
								</div>
							</>
						)}

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
								onChange={(e) => setPhone(e.target.value)}
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
					</section>

					<section className="space-y-2">
						<div className="flex items-center justify-between">
							<span className="text-sm font-medium">Saved</span>
							{favourites.length > 0 && (
								<span className="text-[11px] text-muted-foreground">
									{favourites.length} saved
								</span>
							)}
						</div>

						{loading ? (
							<p className="rounded-md border p-4 text-center text-xs text-muted-foreground">
								Loading favourites…
							</p>
						) : favourites.length === 0 ? (
							<div className="rounded-md border border-dashed p-5 text-center">
								<Star
									className="mx-auto size-5 text-muted-foreground"
									aria-hidden
								/>
								<p className="mt-2 text-sm font-medium">No favourites yet</p>
								<p className="mt-1 text-xs text-muted-foreground">
									Pick a contact or type a number above. It will show up as a
									chip on Send.
								</p>
							</div>
						) : (
							<ul className="divide-y rounded-md border">
								{favourites.map((fav) => (
									<li key={fav.id} className="flex items-center gap-2.5 px-3 py-2">
										<span
											className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground"
											aria-hidden
										>
											{favouriteInitials(fav.name)}
										</span>

										{editingId === fav.id ? (
											<>
												<Input
													aria-label={`Name for ${formatFavouritePhone(fav.phone)}`}
													value={editName}
													maxLength={60}
													autoFocus
													onChange={(e) => setEditName(e.target.value)}
													onKeyDown={(e) => {
														if (e.key === "Enter") {
															e.preventDefault();
															void saveRename(fav.id);
														}
														if (e.key === "Escape") setEditingId(null);
													}}
												/>
												<Button
													type="button"
													size="icon-sm"
													variant="ghost"
													aria-label="Save name"
													onClick={() => void saveRename(fav.id)}
												>
													<Check className="size-4" aria-hidden />
												</Button>
												<Button
													type="button"
													size="icon-sm"
													variant="ghost"
													aria-label="Cancel rename"
													onClick={() => setEditingId(null)}
												>
													<X className="size-4" aria-hidden />
												</Button>
											</>
										) : confirmId === fav.id ? (
											<>
												<span className="min-w-0 flex-1">
													<span className="block truncate text-sm font-medium">
														{fav.name}
													</span>
													<span className="text-[11px] text-muted-foreground">
														Remove this favourite?
													</span>
												</span>
												<Button
													type="button"
													size="xs"
													variant="destructive"
													disabled={removingId === fav.id}
													onClick={() => void removeFavourite(fav.id)}
												>
													Remove
												</Button>
												<Button
													type="button"
													size="icon-sm"
													variant="ghost"
													aria-label="Keep favourite"
													onClick={() => setConfirmId(null)}
												>
													<X className="size-4" aria-hidden />
												</Button>
											</>
										) : (
											<>
												<span className="min-w-0 flex-1">
													<span className="block truncate text-sm font-medium">
														{fav.name === fav.phone
															? formatFavouritePhone(fav.phone)
															: fav.name}
													</span>
													{fav.name !== fav.phone && (
														<span className="text-[11px] text-muted-foreground">
															{formatFavouritePhone(fav.phone)}
														</span>
													)}
												</span>
												<Button
													type="button"
													size="icon-sm"
													variant="ghost"
													aria-label={`Rename ${fav.name}`}
													onClick={() => {
														setEditingId(fav.id);
														setEditName(fav.name);
														setConfirmId(null);
													}}
												>
													<Pencil className="size-4" aria-hidden />
												</Button>
												<Button
													type="button"
													size="icon-sm"
													variant="ghost"
													aria-label={`Remove ${fav.name}`}
													className="text-muted-foreground hover:text-destructive"
													onClick={() => {
														setConfirmId(fav.id);
														setEditingId(null);
													}}
												>
													<Trash2 className="size-4" aria-hidden />
												</Button>
											</>
										)}
									</li>
								))}
							</ul>
						)}
					</section>
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
