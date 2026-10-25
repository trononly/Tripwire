import type { LucideIcon } from "lucide-react";
import {
	Activity,
	AirVent,
	AlarmClock,
	Antenna,
	Apple,
	ArrowLeftRight,
	Baby,
	Backpack,
	BadgeDollarSign,
	Banknote,
	BedDouble,
	Beer,
	Bike,
	Book,
	BookOpen,
	Boxes,
	Brain,
	Briefcase,
	BriefcaseBusiness,
	Building2,
	Bus,
	BusFront,
	Cake,
	Calculator,
	Calendar,
	CalendarDays,
	Camera,
	Candy,
	Car,
	CarFront,
	CarTaxiFront,
	Carrot,
	ChartLine,
	ChartPie,
	Church,
	Cigarette,
	Clock,
	Cloud,
	Coffee,
	Coins,
	Cookie,
	CookingPot,
	CreditCard,
	Croissant,
	Cross,
	Database,
	Droplet,
	Dumbbell,
	Factory,
	FileText,
	Files,
	Film,
	Flame,
	Folder,
	Fuel,
	Gamepad2,
	Gift,
	GraduationCap,
	Hammer,
	HandCoins,
	HandHeart,
	Handshake,
	Headphones,
	Heart,
	HeartPulse,
	Hospital,
	Hourglass,
	House,
	IceCreamCone,
	KeyRound,
	Landmark,
	Laptop,
	Laugh,
	Leaf,
	Lightbulb,
	Lock,
	Mail,
	MapPin,
	Martini,
	Medal,
	Megaphone,
	MessageCircle,
	Milk,
	Monitor,
	Music,
	Network,
	NotebookPen,
	Package,
	PaintRoller,
	Palette,
	ParkingCircle,
	PartyPopper,
	Pencil,
	Percent,
	PersonStanding,
	Phone,
	PhoneCall,
	PiggyBank,
	Pill,
	Pizza,
	Plane,
	Plug,
	Printer,
	Receipt,
	ReceiptText,
	Refrigerator,
	Repeat,
	Route,
	Salad,
	Sandwich,
	Scale,
	School,
	Scissors,
	ScrollText,
	Send,
	Server,
	ShieldCheck,
	Ship,
	Shirt,
	ShoppingBag,
	ShoppingBasket,
	ShoppingCart,
	Smartphone,
	Smile,
	Sofa,
	Soup,
	Sparkles,
	Stethoscope,
	Store,
	Syringe,
	Target,
	Thermometer,
	TrainFront,
	Trash2,
	TrendingDown,
	TrendingUp,
	Trophy,
	Truck,
	Tv,
	UserRound,
	Users,
	Utensils,
	UtensilsCrossed,
	Wallet,
	WalletMinimal,
	Warehouse,
	WashingMachine,
	Wifi,
	Wine,
	Wrench,
	Zap,
	Tag,
} from "lucide-react";

/**
 * Lucide has no cannabis mark. This is Tabler's MIT-licensed cannabis outline
 * (tabler-icons, icons/outline/cannabis.svg), drawn at the app's stroke weight
 * so it sits beside the rest of the pack.
 */
function CannabisIcon({
	className,
	strokeWidth = 1.75,
}: {
	className?: string;
	strokeWidth?: number;
}) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			aria-hidden
		>
			<path d="M7 20s0 -2 1 -3.5c-1.5 0 -2 -.5 -4 -1.5c0 0 1.839 -1.38 5 -1c-1.789 -.97 -3.279 -2.03 -5 -6c0 0 3.98 -.3 6.5 3.5c-2.284 -4.9 1.5 -9.5 1.5 -9.5c2.734 5.47 2.389 7.5 1.5 9.5c2.531 -3.77 6.5 -3.5 6.5 -3.5c-1.721 3.97 -3.211 5.03 -5 6c3.161 -.38 5 1 5 1c-2 1 -2.5 1.5 -4 1.5c1 1.5 1 3.5 1 3.5c-2 0 -4.438 -2.22 -5 -3c-.563 .78 -3 3 -5 3" />
			<path d="M12 22v-5" />
		</svg>
	);
}

/** One icon the category picker offers. `name` is the stored value:
 * kebab-case, matching Lucide's own icon name, so a category row can be
 * rendered from the database value alone. */
export type CategoryIconDef = {
	name: string;
	Icon: LucideIcon;
	group: string;
	/** Extra search words, including the local terms people type. */
	keywords: string;
};

// Curated rather than the whole Lucide set: these are the things people
// spend on, in the pack the rest of the app already uses. Add a line here
// (and its import above) to offer another icon.
const ICON_DEFS: CategoryIconDef[] = [
	{ name: "wallet", Icon: Wallet, group: "Money", keywords: "cash money" },
	{ name: "wallet-minimal", Icon: WalletMinimal, group: "Money", keywords: "cash" },
	{ name: "banknote", Icon: Banknote, group: "Money", keywords: "cash salary note money" },
	{ name: "credit-card", Icon: CreditCard, group: "Money", keywords: "card loan fuliza debt" },
	{ name: "coins", Icon: Coins, group: "Money", keywords: "change money" },
	{ name: "piggy-bank", Icon: PiggyBank, group: "Money", keywords: "savings chama sacco" },
	{ name: "landmark", Icon: Landmark, group: "Money", keywords: "bank sacco" },
	{ name: "hand-coins", Icon: HandCoins, group: "Money", keywords: "loan chama contribution" },
	{ name: "receipt", Icon: Receipt, group: "Money", keywords: "bill" },
	{ name: "receipt-text", Icon: ReceiptText, group: "Money", keywords: "bill invoice" },
	{ name: "calculator", Icon: Calculator, group: "Money", keywords: "budget" },
	{ name: "chart-line", Icon: ChartLine, group: "Money", keywords: "investment growth" },
	{ name: "chart-pie", Icon: ChartPie, group: "Money", keywords: "budget share" },
	{ name: "trending-up", Icon: TrendingUp, group: "Money", keywords: "growth profit" },
	{ name: "trending-down", Icon: TrendingDown, group: "Money", keywords: "loss" },
	{ name: "percent", Icon: Percent, group: "Money", keywords: "interest rate" },
	{ name: "scale", Icon: Scale, group: "Money", keywords: "balance fees" },
	{ name: "badge-dollar-sign", Icon: BadgeDollarSign, group: "Money", keywords: "money" },
	{ name: "arrow-left-right", Icon: ArrowLeftRight, group: "Money", keywords: "transfer" },
	{ name: "shield-check", Icon: ShieldCheck, group: "Money", keywords: "insurance secure" },
	{ name: "shopping-cart", Icon: ShoppingCart, group: "Food & drink", keywords: "groceries food supermarket" },
	{ name: "shopping-basket", Icon: ShoppingBasket, group: "Food & drink", keywords: "groceries market" },
	{ name: "shopping-bag", Icon: ShoppingBag, group: "Food & drink", keywords: "shopping clothes" },
	{ name: "utensils", Icon: Utensils, group: "Food & drink", keywords: "food restaurant lunch" },
	{ name: "utensils-crossed", Icon: UtensilsCrossed, group: "Food & drink", keywords: "fasting" },
	{ name: "coffee", Icon: Coffee, group: "Food & drink", keywords: "cafe tea" },
	{ name: "pizza", Icon: Pizza, group: "Food & drink", keywords: "food" },
	{ name: "sandwich", Icon: Sandwich, group: "Food & drink", keywords: "food snack" },
	{ name: "salad", Icon: Salad, group: "Food & drink", keywords: "healthy food" },
	{ name: "cake", Icon: Cake, group: "Food & drink", keywords: "birthday celebration" },
	{ name: "ice-cream-cone", Icon: IceCreamCone, group: "Food & drink", keywords: "dessert" },
	{ name: "beer", Icon: Beer, group: "Food & drink", keywords: "pombe alcohol drink" },
	{ name: "wine", Icon: Wine, group: "Food & drink", keywords: "mvinyo alcohol drink" },
	{ name: "martini", Icon: Martini, group: "Food & drink", keywords: "party alcohol cocktail" },
	{ name: "cigarette", Icon: Cigarette, group: "Food & drink", keywords: "smoke bangi shisha" },
	{ name: "leaf", Icon: Leaf, group: "Food & drink", keywords: "bangi weed cannabis miraa herb" },
	{ name: "cannabis", Icon: CannabisIcon as unknown as LucideIcon, group: "Food & drink", keywords: "weed marijuana bangi ganja kush" },
	{ name: "apple", Icon: Apple, group: "Food & drink", keywords: "fruit food" },
	{ name: "carrot", Icon: Carrot, group: "Food & drink", keywords: "vegetable food" },
	{ name: "milk", Icon: Milk, group: "Food & drink", keywords: "dairy" },
	{ name: "soup", Icon: Soup, group: "Food & drink", keywords: "food" },
	{ name: "croissant", Icon: Croissant, group: "Food & drink", keywords: "bread breakfast" },
	{ name: "cookie", Icon: Cookie, group: "Food & drink", keywords: "snack" },
	{ name: "candy", Icon: Candy, group: "Food & drink", keywords: "sweets snack" },
	{ name: "house", Icon: House, group: "Home", keywords: "rent home" },
	{ name: "lightbulb", Icon: Lightbulb, group: "Home", keywords: "electricity idea" },
	{ name: "zap", Icon: Zap, group: "Home", keywords: "power token electricity" },
	{ name: "droplet", Icon: Droplet, group: "Home", keywords: "water" },
	{ name: "flame", Icon: Flame, group: "Home", keywords: "gas cooking" },
	{ name: "washing-machine", Icon: WashingMachine, group: "Home", keywords: "laundry" },
	{ name: "sofa", Icon: Sofa, group: "Home", keywords: "furniture" },
	{ name: "bed-double", Icon: BedDouble, group: "Home", keywords: "bed rent" },
	{ name: "hammer", Icon: Hammer, group: "Home", keywords: "repair" },
	{ name: "wrench", Icon: Wrench, group: "Home", keywords: "repair service" },
	{ name: "plug", Icon: Plug, group: "Home", keywords: "electricity" },
	{ name: "wifi", Icon: Wifi, group: "Home", keywords: "internet data" },
	{ name: "smartphone", Icon: Smartphone, group: "Home", keywords: "mpesa airtime phone" },
	{ name: "phone", Icon: Phone, group: "Home", keywords: "call" },
	{ name: "tv", Icon: Tv, group: "Home", keywords: "entertainment subscription" },
	{ name: "sparkles", Icon: Sparkles, group: "Home", keywords: "cleaning beauty" },
	{ name: "paint-roller", Icon: PaintRoller, group: "Home", keywords: "paint repair" },
	{ name: "air-vent", Icon: AirVent, group: "Home", keywords: "ac" },
	{ name: "refrigerator", Icon: Refrigerator, group: "Home", keywords: "fridge" },
	{ name: "cooking-pot", Icon: CookingPot, group: "Home", keywords: "cooking" },
	{ name: "shirt", Icon: Shirt, group: "Home", keywords: "clothes" },
	{ name: "scissors", Icon: Scissors, group: "Home", keywords: "hair salon beauty" },
	{ name: "trash-2", Icon: Trash2, group: "Home", keywords: "waste garbage" },
	{ name: "bus", Icon: Bus, group: "Transport", keywords: "matatu transport" },
	{ name: "bus-front", Icon: BusFront, group: "Transport", keywords: "matatu" },
	{ name: "car", Icon: Car, group: "Transport", keywords: "drive transport" },
	{ name: "car-front", Icon: CarFront, group: "Transport", keywords: "drive" },
	{ name: "bike", Icon: Bike, group: "Transport", keywords: "boda transport" },
	{ name: "train-front", Icon: TrainFront, group: "Transport", keywords: "train sgr" },
	{ name: "plane", Icon: Plane, group: "Transport", keywords: "travel safari flight" },
	{ name: "fuel", Icon: Fuel, group: "Transport", keywords: "petrol diesel" },
	{ name: "map-pin", Icon: MapPin, group: "Transport", keywords: "location" },
	{ name: "route", Icon: Route, group: "Transport", keywords: "fare journey" },
	{ name: "truck", Icon: Truck, group: "Transport", keywords: "delivery cargo" },
	{ name: "ship", Icon: Ship, group: "Transport", keywords: "ferry" },
	{ name: "car-taxi-front", Icon: CarTaxiFront, group: "Transport", keywords: "taxi uber" },
	{ name: "parking-circle", Icon: ParkingCircle, group: "Transport", keywords: "parking" },
	{ name: "pill", Icon: Pill, group: "Health", keywords: "medicine drugs" },
	{ name: "stethoscope", Icon: Stethoscope, group: "Health", keywords: "doctor" },
	{ name: "heart-pulse", Icon: HeartPulse, group: "Health", keywords: "health" },
	{ name: "hospital", Icon: Hospital, group: "Health", keywords: "clinic" },
	{ name: "syringe", Icon: Syringe, group: "Health", keywords: "injection vaccine" },
	{ name: "thermometer", Icon: Thermometer, group: "Health", keywords: "sick fever" },
	{ name: "dumbbell", Icon: Dumbbell, group: "Health", keywords: "gym fitness" },
	{ name: "brain", Icon: Brain, group: "Health", keywords: "therapy mental" },
	{ name: "activity", Icon: Activity, group: "Health", keywords: "health" },
	{ name: "cross", Icon: Cross, group: "Health", keywords: "pharmacy hospital" },
	{ name: "users", Icon: Users, group: "Family & fun", keywords: "chama group family" },
	{ name: "user-round", Icon: UserRound, group: "Family & fun", keywords: "person" },
	{ name: "heart", Icon: Heart, group: "Family & fun", keywords: "love" },
	{ name: "hand-heart", Icon: HandHeart, group: "Family & fun", keywords: "charity donation" },
	{ name: "gift", Icon: Gift, group: "Family & fun", keywords: "present" },
	{ name: "party-popper", Icon: PartyPopper, group: "Family & fun", keywords: "sherehe party" },
	{ name: "baby", Icon: Baby, group: "Family & fun", keywords: "child" },
	{ name: "smile", Icon: Smile, group: "Family & fun", keywords: "happy" },
	{ name: "laugh", Icon: Laugh, group: "Family & fun", keywords: "fun" },
	{ name: "trophy", Icon: Trophy, group: "Family & fun", keywords: "win" },
	{ name: "medal", Icon: Medal, group: "Family & fun", keywords: "award" },
	{ name: "target", Icon: Target, group: "Family & fun", keywords: "goal" },
	{ name: "gamepad-2", Icon: Gamepad2, group: "Family & fun", keywords: "games" },
	{ name: "music", Icon: Music, group: "Family & fun", keywords: "music" },
	{ name: "film", Icon: Film, group: "Family & fun", keywords: "movies" },
	{ name: "camera", Icon: Camera, group: "Family & fun", keywords: "photos" },
	{ name: "palette", Icon: Palette, group: "Family & fun", keywords: "art" },
	{ name: "person-standing", Icon: PersonStanding, group: "Family & fun", keywords: "self" },
	{ name: "church", Icon: Church, group: "Family & fun", keywords: "faith" },
	{ name: "graduation-cap", Icon: GraduationCap, group: "Learning", keywords: "school fees education" },
	{ name: "book", Icon: Book, group: "Learning", keywords: "books" },
	{ name: "book-open", Icon: BookOpen, group: "Learning", keywords: "study" },
	{ name: "school", Icon: School, group: "Learning", keywords: "school fees" },
	{ name: "notebook-pen", Icon: NotebookPen, group: "Learning", keywords: "notes" },
	{ name: "pencil", Icon: Pencil, group: "Learning", keywords: "write" },
	{ name: "backpack", Icon: Backpack, group: "Learning", keywords: "school" },
	{ name: "briefcase", Icon: Briefcase, group: "Work", keywords: "work hustle job" },
	{ name: "briefcase-business", Icon: BriefcaseBusiness, group: "Work", keywords: "business" },
	{ name: "building-2", Icon: Building2, group: "Work", keywords: "office sacco" },
	{ name: "store", Icon: Store, group: "Work", keywords: "shop business duka" },
	{ name: "package", Icon: Package, group: "Work", keywords: "parcel" },
	{ name: "boxes", Icon: Boxes, group: "Work", keywords: "stock" },
	{ name: "laptop", Icon: Laptop, group: "Work", keywords: "computer" },
	{ name: "monitor", Icon: Monitor, group: "Work", keywords: "computer" },
	{ name: "headphones", Icon: Headphones, group: "Work", keywords: "audio" },
	{ name: "megaphone", Icon: Megaphone, group: "Work", keywords: "marketing" },
	{ name: "handshake", Icon: Handshake, group: "Work", keywords: "deal" },
	{ name: "network", Icon: Network, group: "Work", keywords: "network" },
	{ name: "factory", Icon: Factory, group: "Work", keywords: "manufacturing" },
	{ name: "warehouse", Icon: Warehouse, group: "Work", keywords: "storage" },
	{ name: "tag", Icon: Tag, group: "Services", keywords: "label category other" },
	{ name: "file-text", Icon: FileText, group: "Services", keywords: "bill document" },
	{ name: "files", Icon: Files, group: "Services", keywords: "documents" },
	{ name: "folder", Icon: Folder, group: "Services", keywords: "files" },
	{ name: "mail", Icon: Mail, group: "Services", keywords: "email post" },
	{ name: "message-circle", Icon: MessageCircle, group: "Services", keywords: "sms chat" },
	{ name: "phone-call", Icon: PhoneCall, group: "Services", keywords: "call" },
	{ name: "send", Icon: Send, group: "Services", keywords: "transfer send" },
	{ name: "cloud", Icon: Cloud, group: "Services", keywords: "storage" },
	{ name: "server", Icon: Server, group: "Services", keywords: "hosting" },
	{ name: "database", Icon: Database, group: "Services", keywords: "data" },
	{ name: "antenna", Icon: Antenna, group: "Services", keywords: "signal tv" },
	{ name: "scroll-text", Icon: ScrollText, group: "Services", keywords: "contract" },
	{ name: "printer", Icon: Printer, group: "Services", keywords: "printing" },
	{ name: "key-round", Icon: KeyRound, group: "Services", keywords: "keys rent" },
	{ name: "lock", Icon: Lock, group: "Services", keywords: "security" },
	{ name: "calendar", Icon: Calendar, group: "Time", keywords: "rent plan monthly" },
	{ name: "calendar-days", Icon: CalendarDays, group: "Time", keywords: "monthly" },
	{ name: "alarm-clock", Icon: AlarmClock, group: "Time", keywords: "reminder" },
	{ name: "clock", Icon: Clock, group: "Time", keywords: "time" },
	{ name: "hourglass", Icon: Hourglass, group: "Time", keywords: "waiting" },
	{ name: "repeat", Icon: Repeat, group: "Time", keywords: "subscription recurring" },
];

const ICONS = new Map(ICON_DEFS.map((def) => [def.name, def]));

export const CATEGORY_ICON_GROUPS = [...new Set(ICON_DEFS.map((d) => d.group))].map(
	(label) => ({
		label,
		icons: ICON_DEFS.filter((def) => def.group === label),
	}),
);

/** Categories created by the first build stored an emoji. Map the starter
 * set to its closest themed icon so they upgrade without a data rewrite;
 * anything unmapped still renders as the emoji it is. */
const LEGACY_EMOJI_ICONS: Record<string, string> = {
	"🍔": "utensils",
	"🛒": "shopping-cart",
	"🚌": "bus",
	"⚡": "zap",
	"🏠": "house",
	"💊": "pill",
	"🎓": "graduation-cap",
	"👨‍👩‍👧": "users",
	"💼": "briefcase",
	"🎉": "party-popper",
	"✈️": "plane",
	"📱": "smartphone",
	"💧": "droplet",
	"⛽": "fuel",
	"🏦": "landmark",
	"🎁": "gift",
	"☕": "coffee",
	"👕": "shirt",
	"🧾": "receipt",
	"🐖": "piggy-bank",
	"❤️": "heart",
	"🔧": "wrench",
};

export function resolveCategoryIcon(value: string): string {
	return LEGACY_EMOJI_ICONS[value] ?? value;
}

/** Icons whose name or keywords contain every search word. */
export function searchCategoryIcons(query: string): CategoryIconDef[] {
	const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return [];
	return ICON_DEFS.filter((def) => {
		const hay = `${def.name.replace(/-/g, " ")} ${def.keywords}`.toLowerCase();
		return tokens.every((token) => hay.includes(token));
	});
}

/**
 * Render a stored category icon. Unknown keys fall back to a neutral tag; a
 * legacy emoji (or any other text) renders as itself, so no category is
 * ever invisible.
 */
export function CategoryIcon({
	icon,
	className = "size-5",
	strokeWidth = 1.75,
}: {
	icon: string;
	className?: string;
	strokeWidth?: number;
}) {
	const def = ICONS.get(resolveCategoryIcon(icon));
	if (def) {
		const Icon = def.Icon;
		return <Icon className={className} strokeWidth={strokeWidth} aria-hidden />;
	}
	if (!icon || /^[a-z0-9-]+$/.test(icon)) {
		return <Tag className={className} strokeWidth={strokeWidth} aria-hidden />;
	}
	return (
		<span className="text-[1.15em] leading-none" aria-hidden>
			{icon}
		</span>
	);
}
