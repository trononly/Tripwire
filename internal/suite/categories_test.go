package suite

import (
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

	food, err := svc.Create("  Food   & groceries ", "🍔")
	if err != nil {
		t.Fatalf("Create food: %v", err)
	}
	if food.Name != "Food & groceries" || food.Emoji != "🍔" {
		t.Fatalf("Create = %+v, want trimmed name and emoji", food)
	}
	bills, err := svc.Create("Bills", "⚡")
	if err != nil {
		t.Fatalf("Create bills: %v", err)
	}
	travel, err := svc.Create("Travel", "🚌")
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
	if err := svc.Update(travel.ID, "bills & UTILITIES", "🚌"); err == nil {
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

	if _, err := svc.Create("", "🍔"); err == nil {
		t.Fatal("empty name should be rejected")
	}
	if _, err := svc.Create("   ", "🍔"); err == nil {
		t.Fatal("whitespace-only name should be rejected")
	}
	if _, err := svc.Create("Food", "  "); err == nil {
		t.Fatal("empty emoji should be rejected")
	}
	long := ""
	for i := 0; i < 41; i++ {
		long += "a"
	}
	if _, err := svc.Create(long, "🍔"); err == nil {
		t.Fatal("over-long name should be rejected")
	}
}

func TestCategoryResolutionPrecedence(t *testing.T) {
	svc, s := newCategoryService(t)
	food, _ := svc.Create("Food", "🍔")
	bills, _ := svc.Create("Bills", "⚡")

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
	food, _ := svc.Create("Food", "🍔")
	bills, _ := svc.Create("Bills", "⚡")

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
	food, _ := svc.Create("Food", "🍔")

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
	food, _ := svc.Create("Food", "🍔")
	bills, _ := svc.Create("Bills", "⚡")

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
