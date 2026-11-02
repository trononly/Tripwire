package suite

import (
	"database/sql"
	"path/filepath"
	"testing"

	"mpesa-analyzer/internal/categories"
	"mpesa-analyzer/internal/parser"
	. "mpesa-analyzer/internal/store"
)

func newCategoryService(t *testing.T) (*categories.Service, *Store) {
	t.Helper()
	s := newTestStore(t)
	return categories.New(s), s
}

func idsOf(t *testing.T, s *Store) []string {
	t.Helper()
	list, err := s.ListCategories()
	if err != nil {
		t.Fatalf("ListCategories: %v", err)
	}
	out := make([]string, len(list))
	for i, c := range list {
		out[i] = c.ID
	}
	return out
}

func TestCategoryCRUDAndOrder(t *testing.T) {
	svc, s := newCategoryService(t)

	food, err := svc.Create("  Food   & groceries ", "utensils")
	if err != nil {
		t.Fatalf("Create food: %v", err)
	}
	if food.Name != "Food & groceries" || food.Icon != "utensils" {
		t.Fatalf("Create = %+v, want trimmed name and icon", food)
	}
	bills, err := svc.Create("Bills", "zap")
	if err != nil {
		t.Fatalf("Create bills: %v", err)
	}
	travel, err := svc.Create("Travel", "bus")
	if err != nil {
		t.Fatalf("Create travel: %v", err)
	}

	// Duplicate names are case-insensitive: the picker must never show two
	// rows the user cannot tell apart.
	if _, err := svc.Create("bills", "🔌"); err == nil {
		t.Fatal("duplicate name should be rejected")
	}
	if err := svc.Update(bills.ID, "Bills & utilities", "🔌"); err != nil {
		t.Fatalf("Update: %v", err)
	}
	if err := svc.Update(travel.ID, "bills & UTILITIES", "bus"); err == nil {
		t.Fatal("renaming onto another category's name should be rejected")
	}

	// New categories append; reorder is a full replacement, not a shuffle.
	want := []string{food.ID, bills.ID, travel.ID}
	got := idsOf(t, s)
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("order = %v, want %v", got, want)
		}
	}
	if err := svc.Reorder([]string{travel.ID, food.ID, bills.ID}); err != nil {
		t.Fatalf("Reorder: %v", err)
	}
	got = idsOf(t, s)
	if got[0] != travel.ID || got[1] != food.ID || got[2] != bills.ID {
		t.Fatalf("after reorder = %v", got)
	}
	if err := svc.Reorder([]string{"nope"}); err == nil {
		t.Fatal("reorder with an unknown id should fail")
	}
	if got := idsOf(t, s); len(got) != 3 || got[0] != travel.ID {
		t.Fatalf("failed reorder should roll back, got %v", got)
	}

	// Deleting a category also drops every rule that pointed at it.
	if err := svc.Assign("A1", "till", "", food.ID, false); err != nil {
		t.Fatalf("Assign: %v", err)
	}
	if err := svc.Delete(food.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	rules, err := s.ListCategoryRules()
	if err != nil {
		t.Fatalf("ListCategoryRules: %v", err)
	}
	if len(rules) != 0 {
		t.Fatalf("rules after delete = %+v, want none", rules)
	}
}

func TestCategoryEmbeddedNames(t *testing.T) {
	svc, _ := newCategoryService(t)

	if _, err := svc.Create("", "utensils"); err == nil {
		t.Fatal("empty name should be rejected")
	}
	if _, err := svc.Create("   ", "utensils"); err == nil {
		t.Fatal("whitespace-only name should be rejected")
	}
	if _, err := svc.Create("Food", "  "); err == nil {
		t.Fatal("empty icon should be rejected")
	}
	long := ""
	for i := 0; i < 41; i++ {
		long += "a"
	}
	if _, err := svc.Create(long, "utensils"); err == nil {
		t.Fatal("over-long name should be rejected")
	}
}

func TestCategoryResolutionPrecedence(t *testing.T) {
	svc, s := newCategoryService(t)
	food, _ := svc.Create("Food", "utensils")
	bills, _ := svc.Create("Bills", "zap")

	const merchant = "Merchant Payment to 7408526 - FAITH NJOKI BACHIA"
	const merchant2 = "Merchant Payment to 999 - FAITH NJOKI BACHIA 0712544752"
	const kplc = "Pay Bill Online to 888880 - KPLC PREPAID Acc. 01450540651"
	const withdrawal = "Agent Withdrawal"
	const fee = "Fuliza Access Fee"

	txs := []parser.Transaction{
		{ID: "A", Description: merchant, Amount: -100},
		{ID: "A-F", Description: fee, Amount: -1},
		{ID: "B", Description: merchant2, Amount: -200},
		{ID: "C", Description: kplc, Amount: -300},
		{ID: "D", Description: withdrawal, Amount: -400},
	}

	key := categories.CounterpartyKey(merchant)
	if key != "FAITH NJOKI BACHIA" {
		t.Fatalf("CounterpartyKey = %q", key)
	}
	if got := categories.CounterpartyKey(merchant2); got != key {
		t.Fatalf("phone formatting changed the key: %q vs %q", got, key)
	}

	// Transaction override beats a counterparty rule; the counterparty rule
	// covers the other rows with the same identity.
	if err := svc.Assign("A", "till", key, bills.ID, false); err != nil {
		t.Fatalf("Assign A: %v", err)
	}
	if err := svc.Assign("B", "till", key, food.ID, true); err != nil {
		t.Fatalf("Assign B: %v", err)
	}
	// Type rule is the fallback for rows that name no counterparty.
	if err := svc.Assign("D", "withdrawal", "", bills.ID, true); err != nil {
		t.Fatalf("Assign D: %v", err)
	}

	ix, err := svc.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	got := ix.ResolveAll(txs)
	if got["A"].ID != bills.ID {
		t.Errorf("A = %+v, want the transaction override (bills)", got["A"])
	}
	if got["B"].ID != food.ID {
		t.Errorf("B = %+v, want the counterparty rule (food)", got["B"])
	}
	if got["D"].ID != bills.ID {
		t.Errorf("D = %+v, want the type rule (bills)", got["D"])
	}
	if got["C"].ID != "" {
		t.Errorf("C = %+v, want unassigned", got["C"])
	}
	// The paired Fuliza fee inherits the parent purchase's label.
	if got["A-F"].ID != bills.ID {
		t.Errorf("A-F = %+v, want to inherit A (bills)", got["A-F"])
	}

	// An explicit automatic override leaves a counterparty group without
	// touching anyone else's label.
	if err := svc.Assign("A", "till", key, "", false); err != nil {
		t.Fatalf("Assign automatic: %v", err)
	}
	ix, _ = svc.Load()
	got = ix.ResolveAll(txs)
	if _, ok := got["A"]; ok {
		t.Errorf("A = %+v, want explicitly automatic", got["A"])
	}
	if got["B"].ID != food.ID {
		t.Errorf("explicit automatic on A must not clear the group: B = %+v", got["B"])
	}

	// A dangling rule id is ignored rather than hiding the row's category.
	if err := s.SetCategoryRule(RuleCounterparty, "KPLC PREPAID", "deleted-category"); err != nil {
		t.Fatalf("SetCategoryRule: %v", err)
	}
	ix, _ = svc.Load()
	got = ix.ResolveAll(txs)
	if _, ok := got["C"]; ok {
		t.Errorf("C = %+v, want a dangling rule to be ignored", got["C"])
	}
}

func TestCategoryOwnRuleBeatsFulizaInheritance(t *testing.T) {
	svc, _ := newCategoryService(t)
	food, _ := svc.Create("Food", "utensils")
	bills, _ := svc.Create("Bills", "zap")

	txs := []parser.Transaction{
		{ID: "A", Description: "Merchant Payment to 7408526 - FAITH NJOKI BACHIA", Amount: -100},
		{ID: "A-F", Description: "Fuliza Access Fee", Amount: -1},
	}
	if err := svc.Assign("A", "till", "", food.ID, false); err != nil {
		t.Fatalf("Assign A: %v", err)
	}
	// A type rule for fees is the fee row's own assignment, so it wins over
	// inheriting the parent's label.
	if err := svc.Assign("A-F", "fees", "", bills.ID, true); err != nil {
		t.Fatalf("Assign fee: %v", err)
	}

	ix, _ := svc.Load()
	got := ix.ResolveAll(txs)
	if got["A"].ID != food.ID {
		t.Errorf("A = %+v, want food", got["A"])
	}
	if got["A-F"].ID != bills.ID {
		t.Errorf("A-F = %+v, want its own type rule (bills)", got["A-F"])
	}
}

func TestAssignCategoryScopes(t *testing.T) {
	svc, s := newCategoryService(t)
	food, _ := svc.Create("Food", "utensils")

	// Single row: a transaction rule, even for "Automatic" (category "").
	if err := svc.Assign("A", "till", "SHOP", food.ID, false); err != nil {
		t.Fatalf("single assign: %v", err)
	}
	rules, _ := s.ListCategoryRules()
	if len(rules) != 1 || rules[0].Kind != RuleTx || rules[0].Key != "A" || rules[0].CategoryID != food.ID {
		t.Fatalf("single rules = %+v", rules)
	}

	// Similar with a counterparty: one shared rule, and the row override is
	// removed so it cannot shadow the group.
	if err := svc.Assign("A", "till", "SHOP", food.ID, true); err != nil {
		t.Fatalf("similar assign: %v", err)
	}
	rules, _ = s.ListCategoryRules()
	if len(rules) != 1 || rules[0].Kind != RuleCounterparty || rules[0].Key != "SHOP" {
		t.Fatalf("similar rules = %+v, want only a counterparty rule", rules)
	}

	// Similar with no counterparty falls back to the transaction type.
	if err := svc.Assign("D", "withdrawal", "", food.ID, true); err != nil {
		t.Fatalf("type assign: %v", err)
	}
	rules, _ = s.ListCategoryRules()
	if len(rules) != 2 {
		t.Fatalf("rules = %+v, want counterparty + type", rules)
	}

	// Automatic for the whole group clears the shared rule and the row
	// override; the rows fall back to their built-in categories.
	if err := svc.Assign("A", "till", "SHOP", "", true); err != nil {
		t.Fatalf("automatic group: %v", err)
	}
	rules, _ = s.ListCategoryRules()
	if len(rules) != 1 || rules[0].Kind != RuleType {
		t.Fatalf("rules = %+v, want only the unrelated type rule", rules)
	}

	// An unknown category is rejected before anything is written.
	if err := svc.Assign("A", "till", "", "does-not-exist", false); err == nil {
		t.Fatal("assigning a deleted category should fail")
	}
	if err := svc.Assign("", "till", "", food.ID, false); err == nil {
		t.Fatal("assigning without a transaction id should fail")
	}
}

func TestCategoryTotals(t *testing.T) {
	svc, _ := newCategoryService(t)
	food, _ := svc.Create("Food", "utensils")
	bills, _ := svc.Create("Bills", "zap")

	const merchant = "Merchant Payment to 7408526 - FAITH NJOKI BACHIA"
	const kplc = "Pay Bill Online to 888880 - KPLC PREPAID Acc. 01450540651"
	txs := []parser.Transaction{
		{ID: "A", Description: merchant, Amount: -1000},
		// Paired fee: inherits the purchase's label, so it joins the slice.
		{ID: "A-F", Description: "Fuliza Access Fee", Amount: -10},
		{ID: "B", Description: kplc, Amount: -500},
		// Nothing labels these two, and one is income: the bucket keeps the
		// signed sum so the slices still add up to the dataset.
		{ID: "C", Description: "Salary Payment from 504900 - NCBA BANK", Amount: 5000},
		{ID: "D", Description: "Reversal of charge", Amount: -4900},
	}
	if err := svc.Assign("A", "till", categories.CounterpartyKey(merchant), food.ID, true); err != nil {
		t.Fatalf("Assign food: %v", err)
	}
	if err := svc.Assign("B", "paybill", categories.CounterpartyKey(kplc), bills.ID, true); err != nil {
		t.Fatalf("Assign bills: %v", err)
	}

	got, err := svc.Totals(txs)
	if err != nil {
		t.Fatalf("Totals: %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("buckets = %+v, want food, bills and uncategorized", got)
	}
	if got[0].ID != food.ID || got[0].Amount != -1010 || got[0].Count != 2 {
		t.Errorf("first bucket = %+v, want food (-1010, 2 txs incl the fee)", got[0])
	}
	if got[1].ID != bills.ID || got[1].Amount != -500 || got[1].Count != 1 {
		t.Errorf("second bucket = %+v, want bills (-500, 1 tx)", got[1])
	}
	if got[2].ID != "" || got[2].Name != "Uncategorized" || got[2].Count != 2 {
		t.Errorf("last bucket = %+v, want Uncategorized (2 txs)", got[2])
	}
	if got[2].Amount != 100 {
		t.Errorf("uncategorized amount = %d, want 100 (signed sum)", got[2].Amount)
	}
	var percent float64
	for _, b := range got {
		percent += b.Percent
	}
	if percent < 99.99 || percent > 100.01 {
		t.Errorf("percent total = %f, want 100", percent)
	}

	empty, err := svc.Totals(nil)
	if err != nil {
		t.Fatalf("Totals(nil): %v", err)
	}
	if len(empty) != 0 {
		t.Errorf("empty dataset = %+v, want no buckets", empty)
	}
}

// TestCategoryEmojiColumnMigrates covers the dev database written before
// categories used icons: opening it must rebuild the table with the icon
// column, keep the stored value (the frontend maps the old emoji), and stay
// a no-op on the next open.
func TestCategoryEmojiColumnMigrates(t *testing.T) {
	path := filepath.Join(t.TempDir(), "statements.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open raw: %v", err)
	}
	if _, err := db.Exec(`CREATE TABLE categories (
		id         TEXT PRIMARY KEY,
		name       TEXT NOT NULL,
		emoji      TEXT NOT NULL,
		sort_order INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL
	)`); err != nil {
		t.Fatalf("old schema: %v", err)
	}
	if _, err := db.Exec(
		`INSERT INTO categories (id, name, emoji, sort_order, created_at)
		 VALUES ('c1', 'Food', '🛒', 1, '2026-01-01T00:00:00Z')`,
	); err != nil {
		t.Fatalf("old row: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close raw: %v", err)
	}

	s, err := New(path)
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	list, err := s.ListCategories()
	if err != nil {
		t.Fatalf("ListCategories: %v", err)
	}
	if len(list) != 1 || list[0].Icon != "🛒" || list[0].Name != "Food" {
		t.Fatalf("migrated categories = %+v, want the old value kept", list)
	}
	if err := s.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	raw, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("reopen raw: %v", err)
	}
	defer raw.Close()
	var emoji, icon int
	if err := raw.QueryRow(
		`SELECT COUNT(*) FROM pragma_table_info('categories') WHERE name = 'emoji'`,
	).Scan(&emoji); err != nil {
		t.Fatalf("inspect: %v", err)
	}
	if err := raw.QueryRow(
		`SELECT COUNT(*) FROM pragma_table_info('categories') WHERE name = 'icon'`,
	).Scan(&icon); err != nil {
		t.Fatalf("inspect: %v", err)
	}
	if emoji != 0 || icon != 1 {
		t.Fatalf("columns: emoji=%d icon=%d, want emoji gone and icon present", emoji, icon)
	}

	again, err := New(path)
	if err != nil {
		t.Fatalf("second open: %v", err)
	}
	t.Cleanup(func() { again.Close() })
	list, err = again.ListCategories()
	if err != nil {
		t.Fatalf("ListCategories after second open: %v", err)
	}
	if len(list) != 1 || list[0].Icon != "🛒" {
		t.Fatalf("categories after second open = %+v", list)
	}
}

func TestCategoryBudgets(t *testing.T) {
	svc, _ := newCategoryService(t)
	food, _ := svc.Create("Food", "utensils")
	bills, _ := svc.Create("Bills", "zap")
	travel, _ := svc.Create("Travel", "bus")

	if err := svc.SetBudget(food.ID, 100_000, 80); err != nil { // KES 1,000
		t.Fatalf("SetBudget food: %v", err)
	}
	if err := svc.SetBudget(bills.ID, 50_000, 80); err != nil { // KES 500
		t.Fatalf("SetBudget bills: %v", err)
	}

	txs := []parser.Transaction{
		// July: food spends 800 of its 1,000 cap (80% = near), bills
		// spends 600 of 500 (over). A refund assigned to food must not
		// reduce the gross outflow the budget measures.
		{ID: "A", Date: "2001-07-03 10:00:00", Amount: -60_000},
		{ID: "B", Date: "2001-07-12 10:00:00", Amount: -20_000},
		{ID: "D", Date: "2001-07-14 10:00:00", Amount: 50_000},
		{ID: "E", Date: "2001-07-20 10:00:00", Amount: -60_000},
		// June is outside the report month: neither row may count.
		{ID: "C", Date: "2001-06-28 10:00:00", Amount: -90_000},
		{ID: "F", Date: "2001-06-29 10:00:00", Amount: -90_000},
	}
	for _, id := range []string{"A", "B", "D"} {
		if err := svc.Assign(id, "till", "", food.ID, false); err != nil {
			t.Fatalf("Assign %s: %v", id, err)
		}
	}
	for _, id := range []string{"E", "F"} {
		if err := svc.Assign(id, "till", "", bills.ID, false); err != nil {
			t.Fatalf("Assign %s: %v", id, err)
		}
	}

	report, err := svc.BudgetReport(txs)
	if err != nil {
		t.Fatalf("BudgetReport: %v", err)
	}
	if report.Month != "2001-07" {
		t.Errorf("month = %q, want the newest dataset month", report.Month)
	}
	if report.Current {
		t.Error("a 2001 month must not be reported as current")
	}
	if len(report.Statuses) != 3 {
		t.Fatalf("statuses = %+v, want one row per category", report.Statuses)
	}

	foodStatus := report.Statuses[0]
	if foodStatus.ID != food.ID || foodStatus.Spent != 80_000 || foodStatus.Count != 2 {
		t.Errorf("food = %+v, want gross July outflow 80000 over 2 rows", foodStatus)
	}
	if foodStatus.Remaining != 20_000 || foodStatus.Percent != 80 || foodStatus.WarnPercent != 80 || foodStatus.State != categories.BudgetNear {
		t.Errorf("food position = %+v, want 20000 left, 80%% warn, near", foodStatus)
	}

	billsStatus := report.Statuses[1]
	if billsStatus.Spent != 60_000 || billsStatus.Remaining != -10_000 || billsStatus.State != categories.BudgetOver {
		t.Errorf("bills = %+v, want 10000 over and over state", billsStatus)
	}
	if billsStatus.Percent != 120 {
		t.Errorf("bills percent = %v, want 120", billsStatus.Percent)
	}

	travelStatus := report.Statuses[2]
	if travelStatus.ID != travel.ID || travelStatus.Budget != 0 || travelStatus.State != categories.BudgetNone || travelStatus.Spent != 0 {
		t.Errorf("travel = %+v, want a budgetless status", travelStatus)
	}

	// Reaching the cap exactly is "near", not "over": the user has not
	// exceeded it until another shilling goes out.
	if err := svc.SetBudget(food.ID, 80_000, 80); err != nil {
		t.Fatalf("SetBudget exact: %v", err)
	}
	report, err = svc.BudgetReport(txs)
	if err != nil {
		t.Fatalf("BudgetReport exact: %v", err)
	}
	if got := report.Statuses[0]; got.State != categories.BudgetNear || got.Remaining != 0 || got.Percent != 100 {
		t.Errorf("at the cap = %+v, want near with nothing left", got)
	}

	// The warning point is the category's own choice, not a fixed 80. At
	// half the cap it warns; one point later the same spend is fine.
	if err := svc.SetBudget(food.ID, 160_000, 50); err != nil {
		t.Fatalf("SetBudget custom warn: %v", err)
	}
	report, err = svc.BudgetReport(txs)
	if err != nil {
		t.Fatalf("BudgetReport custom warn: %v", err)
	}
	if got := report.Statuses[0]; got.State != categories.BudgetNear || got.WarnPercent != 50 {
		t.Errorf("at 50%% = %+v, want a near state at the custom threshold", got)
	}
	if err := svc.SetBudget(food.ID, 160_000, 51); err != nil {
		t.Fatalf("SetBudget custom warn 51: %v", err)
	}
	report, err = svc.BudgetReport(txs)
	if err != nil {
		t.Fatalf("BudgetReport custom warn 51: %v", err)
	}
	if got := report.Statuses[0]; got.State != categories.BudgetOK {
		t.Errorf("below 51%% = %+v, want ok", got)
	}

	// Clearing a budget keeps the category and its spend, but stops it
	// counting toward a cap.
	if err := svc.SetBudget(food.ID, 0, 80); err != nil {
		t.Fatalf("clear budget: %v", err)
	}
	report, err = svc.BudgetReport(txs)
	if err != nil {
		t.Fatalf("BudgetReport cleared: %v", err)
	}
	if got := report.Statuses[0]; got.State != categories.BudgetNone || got.Budget != 0 || got.Spent != 80_000 {
		t.Errorf("cleared = %+v, want no cap but spend still reported", got)
	}

	// Values the UI can never send are still rejected at the service.
	for _, bad := range []int64{-1, 50, 150, 1_000_000_100} {
		if err := svc.SetBudget(bills.ID, bad, 80); err == nil {
			t.Errorf("budget %d should be rejected", bad)
		}
	}
	if err := svc.SetBudget("does-not-exist", 10_000, 80); err == nil {
		t.Fatal("a budget on an unknown category should fail")
	}
	for _, warn := range []int{-1, 0, 101} {
		if err := svc.SetBudget(bills.ID, 50_000, warn); err == nil {
			t.Errorf("warning %d should be rejected", warn)
		}
	}

	// An empty dataset still returns every category, for the management
	// page before the first import.
	empty, err := svc.BudgetReport(nil)
	if err != nil {
		t.Fatalf("BudgetReport(nil): %v", err)
	}
	if len(empty.Statuses) != 3 || empty.Month == "" {
		t.Errorf("empty report = %+v, want the categories and a month", empty)
	}
}

func TestCategoryBudgetColumnMigratesAndPersists(t *testing.T) {
	path := filepath.Join(t.TempDir(), "statements.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open raw: %v", err)
	}
	if _, err := db.Exec(`CREATE TABLE categories (
		id         TEXT PRIMARY KEY,
		name       TEXT NOT NULL,
		icon       TEXT NOT NULL,
		sort_order INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL
	)`); err != nil {
		t.Fatalf("old schema: %v", err)
	}
	if _, err := db.Exec(
		`INSERT INTO categories (id, name, icon, sort_order, created_at)
		 VALUES ('c1', 'Food', 'utensils', 1, '2026-01-01T00:00:00Z')`,
	); err != nil {
		t.Fatalf("old row: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close raw: %v", err)
	}

	s, err := New(path)
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	list, err := s.ListCategories()
	if err != nil {
		t.Fatalf("ListCategories: %v", err)
	}
	if len(list) != 1 || list[0].Budget != 0 || list[0].WarnPercent != 80 {
		t.Fatalf("migrated categories = %+v, want the old row with no budget and the default warning", list)
	}
	if err := s.SetCategoryBudget("c1", 250_000, 70); err != nil {
		t.Fatalf("SetCategoryBudget: %v", err)
	}
	if err := s.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	again, err := New(path)
	if err != nil {
		t.Fatalf("second open: %v", err)
	}
	t.Cleanup(func() { again.Close() })
	list, err = again.ListCategories()
	if err != nil {
		t.Fatalf("ListCategories after reopen: %v", err)
	}
	if len(list) != 1 || list[0].Budget != 250_000 || list[0].WarnPercent != 70 {
		t.Fatalf("budget after reopen = %+v, want 250000 with a 70%% warning", list)
	}
}
