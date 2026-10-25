import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Loader2, Plus, ReceiptText, ShoppingCart } from "lucide-react";

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
import type { LipaKind, LipaFavourite } from "@/lib/lipa-favourites";
import { lipaFavouriteDetail } from "@/lib/lipa-favourites";
import { cn } from "@/lib/utils";
import { isValidAccount, isValidPaybill, isValidTill } from "@/lib/ussd-menus";

export interface LipaFavouritesSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	favourites: LipaFavourite[];
	loading: boolean;
	defaultKind: LipaKind;
	defaultNumber: string;
	defaultAccount: string;
	onAdd: (
		name: string,
		kind: LipaKind,
		number: string,
		account: string,
	) => Promise<boolean>;
	onRename: (id: string, name: string) => Promise<boolean>;
	onRemove: (id: string) => Promise<boolean>;
	onReorder: (ids: string[]) => Promise<boolean>;
}

const KINDS: { id: LipaKind; label: string; icon: typeof ReceiptText }[] = [
	{ id: "paybill", label: "Paybill", icon: ReceiptText },
	{ id: "till", label: "Till", icon: ShoppingCart },
];

/**
 * Manage saved Lipa na M-Pesa destinations. Everything is typed by hand:
 * there is no contact picker because a paybill/till is never a phone number.
 */
export function LipaFavouritesSheet({
	open,
	onOpenChange,
	favourites,
	loading,
	defaultKind,
	defaultNumber,
	defaultAccount,
	onAdd,
	onRename,
	onRemove,
	onReorder,
}: LipaFavouritesSheetProps) {
	const [kind, setKind] = useState<LipaKind>(defaultKind);
	const [name, setName] = useState("");
	const [number, setNumber] = useState("");
	const [account, setAccount] = useState("");
	const [touched, setTouched] = useState(false);
	const [saving, setSaving] = useState(false);

	const numberOk =
		kind === "paybill" ? isValidPaybill(number) : isValidTill(number);
	const accountOk = kind === "till" || isValidAccount(account);
	const valid = numberOk && accountOk;
	const items = useMemo(
		() =>
			favourites.map((fav) => ({
				id: fav.id,
				name: fav.name,
				detail: lipaFavouriteDetail(fav),
			})),
		[favourites],
	);

	useEffect(() => {
		if (!open) return;
		setKind(defaultKind);
		setName("");
		setNumber(defaultNumber.replace(/\D/g, ""));
		setAccount(defaultKind === "till" ? "" : defaultAccount);
		setTouched(false);
		setSaving(false);
	}, [open, defaultKind, defaultNumber, defaultAccount]);

	async function handleAdd(e: FormEvent) {
		e.preventDefault();
		setTouched(true);
		if (!valid) return;

		setSaving(true);
		const ok = await onAdd(name, kind, number, kind === "till" ? "" : account);
		setSaving(false);
		if (ok) {
			setName("");
			setNumber("");
			setAccount("");
			setTouched(false);
		}
	}

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent className="max-h-[88vh]">
				<DrawerHeader>
					<DrawerTitle>Lipa na M-Pesa favourites</DrawerTitle>
				</DrawerHeader>

				<div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-2">
					<form onSubmit={handleAdd} className="space-y-2">
						<div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
							{KINDS.map(({ id, label, icon: Icon }) => (
								<button
									key={id}
									type="button"
									aria-pressed={kind === id}
									onClick={() => {
										setKind(id);
										setTouched(false);
										if (id === "till") setAccount("");
									}}
									className={cn(
										"flex items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-xs font-medium transition-colors",
										kind === id
											? "bg-background text-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									<Icon className="size-4" aria-hidden />
									{label}
								</button>
							))}
						</div>

						<Input
							aria-label="Favourite name"
							placeholder="Name (optional)"
							value={name}
							maxLength={60}
							onChange={(e) => setName(e.target.value)}
						/>
						<Input
							aria-label={kind === "paybill" ? "Paybill number" : "Till number"}
							inputMode="numeric"
							placeholder={kind === "paybill" ? "Paybill number" : "Till number"}
							value={number}
							maxLength={7}
							onChange={(e) => setNumber(e.target.value.replace(/\D/g, ""))}
							aria-invalid={touched && !numberOk}
						/>
						{kind === "paybill" && (
							<Input
								aria-label="Account number"
								placeholder="Account number"
								value={account}
								maxLength={20}
								onChange={(e) => setAccount(e.target.value)}
								aria-invalid={touched && !accountOk}
							/>
						)}
						{touched && !valid && (
							<span className="block text-[11px] text-destructive">
								{!numberOk
									? kind === "paybill"
										? "Enter a valid paybill number (4-7 digits)."
										: "Enter a valid till number (5-7 digits)."
									: "Enter an account name or number."}
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

export default LipaFavouritesSheet;
