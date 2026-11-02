package suite

import (
	"encoding/json"
	. "mpesa-analyzer/internal/store"
	"os"
	"path/filepath"
	"testing"
	"time"

	"mpesa-analyzer/internal/parser"
)

func sampleRecord(id string) StatementRecord {
	return StatementRecord{
		ID:         id,
		Name:       "Jan 2025 – Mar 2025",
		DateRange:  DateRange{Start: "2025-01-03", End: "2025-03-28"},
		TxCount:    2,
		ImportedAt: time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC),
		Txs: []parser.Transaction{
			{ID: "R1", Date: "2025-01-03 10:00:00", Amount: 100, Balance: 100},
			{ID: "R2", Date: "2025-03-28 09:30:00", Amount: -50, Balance: 50},
		},
	}
}

func newTestStore(t *testing.T) *Store {
	t.Helper()
	s, err := New(filepath.Join(t.TempDir(), "statements.db"))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestStoreRoundTrip(t *testing.T) {
	s := newTestStore(t)

	if err := s.Add(sampleRecord("a")); err != nil {
		t.Fatalf("Add: %v", err)
	}
	if err := s.Add(sampleRecord("b")); err != nil {
		t.Fatalf("Add: %v", err)
	}

	// A fresh Store over the same file must see both records, newest
	// import first (same ImportedAt, so reverse insertion order).
	path := filepath.Join(t.TempDir(), "statements.db")
	first, err := New(path)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if err := first.Add(sampleRecord("a")); err != nil {
		t.Fatalf("Add: %v", err)
	}
	if err := first.Add(sampleRecord("b")); err != nil {
		t.Fatalf("Add: %v", err)
	}
	first.Close()

	other, err := New(path)
	if err != nil {
		t.Fatalf("New reopen: %v", err)
	}
	defer other.Close()

	metas, err := other.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(metas) != 2 || metas[0].ID != "b" || metas[1].ID != "a" {
		t.Fatalf("List = %+v, want [b a]", metas)
	}
	if metas[0].TxCount != 2 {
		t.Fatalf("meta txCount = %d, want 2", metas[0].TxCount)
	}

	rec, err := other.Get("a")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if len(rec.Txs) != 2 || rec.Txs[0].ID != "R1" {
		t.Fatalf("Get(a).Txs = %+v", rec.Txs)
	}
}

func TestStoreSnapshot(t *testing.T) {
	s := newTestStore(t)
	if err := s.Add(sampleRecord("a")); err != nil {
		t.Fatalf("Add: %v", err)
	}

	dst := filepath.Join(t.TempDir(), "backup.db")
	if err := s.Snapshot(dst); err != nil {
		t.Fatalf("Snapshot: %v", err)
	}

	// The copy must open as a normal store and hold the source's records,
	// including anything still in the WAL when it was taken.
	copied, err := New(dst)
	if err != nil {
		t.Fatalf("New(snapshot): %v", err)
	}
	defer copied.Close()
	metas, err := copied.List()
	if err != nil {
		t.Fatalf("List(snapshot): %v", err)
	}
	if len(metas) != 1 || metas[0].ID != "a" {
		t.Fatalf("snapshot List = %+v, want [a]", metas)
	}

	// Later writes to the live store must not leak into the snapshot.
	if err := s.Add(sampleRecord("b")); err != nil {
		t.Fatalf("Add after snapshot: %v", err)
	}
	again, err := copied.List()
	if err != nil {
		t.Fatalf("List(snapshot) after source write: %v", err)
	}
	if len(again) != 1 {
		t.Fatalf("snapshot changed after source write: %+v", again)
	}

	// VACUUM INTO refuses an existing destination; the store should too.
	if err := s.Snapshot(dst); err == nil {
		t.Fatal("Snapshot over an existing file succeeded, want an error")
	}
}

func TestStoreRestore(t *testing.T) {
	s := newTestStore(t)
	if err := s.Add(sampleRecord("a")); err != nil {
		t.Fatalf("Add: %v", err)
	}
	if _, err := s.AddFavourite("Alice", "0712345678", "send"); err != nil {
		t.Fatalf("AddFavourite: %v", err)
	}
	if _, err := s.AddLipaFavourite("KPLC", "paybill", "888880", "12345"); err != nil {
		t.Fatalf("AddLipaFavourite: %v", err)
	}
	cat, err := s.AddCategory("Food", "utensils")
	if err != nil {
		t.Fatalf("AddCategory: %v", err)
	}
	if err := s.SetCategoryRule(RuleTx, "R1", cat.ID); err != nil {
		t.Fatalf("SetCategoryRule: %v", err)
	}
	if _, err := s.AddRecurringPlan(RecurringPlan{
		Name:      "Rent",
		Kind:      "send",
		Number:    "0712345678",
		Amount:    100000,
		Cadence:   "monthly",
		AnchorDay: 1,
		DueTime:   "09:00",
		Remind:    true,
	}); err != nil {
		t.Fatalf("AddRecurringPlan: %v", err)
	}

	backup := filepath.Join(t.TempDir(), "backup.db")
	if err := s.Snapshot(backup); err != nil {
		t.Fatalf("Snapshot: %v", err)
	}

	summary, err := InspectBackup(backup)
	if err != nil {
		t.Fatalf("InspectBackup: %v", err)
	}
	if summary.Statements != 1 || summary.Transactions != 2 {
		t.Fatalf("summary = %+v, want 1 statement / 2 transactions", summary)
	}

	// Move the live store away from the snapshot, then put it back.
	if err := s.Add(sampleRecord("b")); err != nil {
		t.Fatalf("Add after snapshot: %v", err)
	}
	if _, err := s.AddFavourite("Bob", "0723456789", "send"); err != nil {
		t.Fatalf("AddFavourite after snapshot: %v", err)
	}
	if _, err := s.AddCategory("Travel", "plane"); err != nil {
		t.Fatalf("AddCategory after snapshot: %v", err)
	}
	if err := s.Restore(backup); err != nil {
		t.Fatalf("Restore: %v", err)
	}
	metas, err := s.List()
	if err != nil {
		t.Fatalf("List after restore: %v", err)
	}
	if len(metas) != 1 || metas[0].ID != "a" {
		t.Fatalf("List after restore = %+v, want [a]", metas)
	}
	rec, err := s.Get("a")
	if err != nil {
		t.Fatalf("Get after restore: %v", err)
	}
	if len(rec.Txs) != 2 {
		t.Fatalf("restored txs = %d, want 2", len(rec.Txs))
	}
	favourites, err := s.ListFavourites("send")
	if err != nil {
		t.Fatalf("ListFavourites after restore: %v", err)
	}
	if len(favourites) != 1 || favourites[0].Name != "Alice" {
		t.Fatalf("favourites after restore = %+v, want [Alice]", favourites)
	}
	lipa, err := s.ListLipaFavourites("paybill")
	if err != nil {
		t.Fatalf("ListLipaFavourites after restore: %v", err)
	}
	if len(lipa) != 1 || lipa[0].Name != "KPLC" {
		t.Fatalf("lipa favourites after restore = %+v, want [KPLC]", lipa)
	}
	categories, err := s.ListCategories()
	if err != nil {
		t.Fatalf("ListCategories after restore: %v", err)
	}
	if len(categories) != 1 || categories[0].Name != "Food" {
		t.Fatalf("categories after restore = %+v, want [Food]", categories)
	}
	rules, err := s.ListCategoryRules()
	if err != nil {
		t.Fatalf("ListCategoryRules after restore: %v", err)
	}
	if len(rules) != 1 || rules[0].Key != "R1" {
		t.Fatalf("rules after restore = %+v, want one R1 rule", rules)
	}
	plans, err := s.ListRecurringPlans()
	if err != nil {
		t.Fatalf("ListRecurringPlans after restore: %v", err)
	}
	if len(plans) != 1 || plans[0].Name != "Rent" {
		t.Fatalf("plans after restore = %+v, want [Rent]", plans)
	}

	// A non-database file must be rejected without touching the live data.
	junk := filepath.Join(t.TempDir(), "junk.db")
	if err := os.WriteFile(junk, []byte("not a database"), 0o600); err != nil {
		t.Fatalf("write junk: %v", err)
	}
	if _, err := InspectBackup(junk); err == nil {
		t.Fatal("InspectBackup accepted a non-database")
	}
	if err := s.Restore(junk); err == nil {
		t.Fatal("Restore accepted a non-database")
	}
	metas, err = s.List()
	if err != nil {
		t.Fatalf("List after rejected restore: %v", err)
	}
	if len(metas) != 1 || metas[0].ID != "a" {
		t.Fatalf("live data changed after rejected restore: %+v", metas)
	}
}

func TestStoreMissingFileIsEmpty(t *testing.T) {
	s := newTestStore(t)
	metas, err := s.List()
	if err != nil {
		t.Fatalf("List on missing file: %v", err)
	}
	if len(metas) != 0 {
		t.Fatalf("List = %+v, want empty", metas)
	}
}

func TestStoreDeleteAndRename(t *testing.T) {
	s := newTestStore(t)
	s.Add(sampleRecord("a"))
	s.Add(sampleRecord("b"))

	if err := s.Rename("a", "Q1 2025"); err != nil {
		t.Fatalf("Rename: %v", err)
	}
	rec, _ := s.Get("a")
	if rec.Name != "Q1 2025" {
		t.Fatalf("name = %q, want Q1 2025", rec.Name)
	}

	if err := s.Delete("a"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := s.Get("a"); err == nil {
		t.Fatal("Get(a) after Delete should fail")
	}
	if err := s.Delete("nope"); err == nil {
		t.Fatal("Delete of unknown id should fail")
	}
}

func TestDateRangeAndName(t *testing.T) {
	rec := sampleRecord("x")
	got := DateRangeOf(rec.Txs)
	if got != rec.DateRange {
		t.Fatalf("DateRangeOf = %+v, want %+v", got, rec.DateRange)
	}
	if name := NameOf(got); name != "Jan 2025 – Mar 2025" {
		t.Fatalf("NameOf = %q", name)
	}
	sameMonth := DateRange{Start: "2025-01-03", End: "2025-01-28"}
	if name := NameOf(sameMonth); name != "Jan 2025" {
		t.Fatalf("NameOf(same month) = %q, want Jan 2025", name)
	}
}

// TestStoreSourceDefaultsAndSms proves the two source kinds share one store:
// legacy records with no Source list as statements, SMS records keep their
// marker, and both persist through the same database.
func TestStoreSourceDefaultsAndSms(t *testing.T) {
	s := newTestStore(t)

	// Legacy shape: Source unset (records written by older builds).
	legacy := sampleRecord("legacy")
	if err := s.Add(legacy); err != nil {
		t.Fatalf("Add legacy: %v", err)
	}
	sms := sampleRecord("sms1")
	sms.Source = SourceSms
	sms.Name = "Sep 2026"
	if err := s.Add(sms); err != nil {
		t.Fatalf("Add sms: %v", err)
	}

	metas, err := s.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(metas) != 2 {
		t.Fatalf("List = %+v, want 2 records", metas)
	}
	// Newest import first: the SMS record was added last.
	if metas[0].ID != "sms1" || metas[0].Source != SourceSms {
		t.Fatalf("sms meta = %+v, want source=sms", metas[0])
	}
	if metas[1].ID != "legacy" || metas[1].Source != SourceStatement {
		t.Fatalf("legacy meta = %+v, want source defaulted to statement", metas[1])
	}
}

func TestAppendFresh(t *testing.T) {
	s := newTestStore(t)
	first := parser.Transaction{ID: "R1", Date: "2025-01-03 10:00:00", Amount: 100, Balance: 100}
	rec := StatementRecord{
		ID:         "sms",
		Name:       NameOf(DateRangeOf([]parser.Transaction{first})),
		Source:     SourceSms,
		DateRange:  DateRangeOf([]parser.Transaction{first}),
		TxCount:    1,
		ImportedAt: time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC),
		Txs:        []parser.Transaction{first},
	}
	if err := s.Add(rec); err != nil {
		t.Fatalf("Add: %v", err)
	}

	// Baseline: the stored record holds exactly the first transaction.
	stored, err := s.Get("sms")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if len(stored.Txs) != 1 || stored.Txs[0].ID != "R1" {
		t.Fatalf("stored Txs = %+v, want [R1]", stored.Txs)
	}

	fresh := parser.Transaction{ID: "R3", Date: "2026-09-01 08:00:00", Amount: -20, Balance: 30}
	rec.Txs = []parser.Transaction{first, fresh}
	rec.TxCount = 2
	rec.DateRange = DateRangeOf(rec.Txs)
	rec.Name = NameOf(rec.DateRange)
	if err := s.AppendFresh(rec, []parser.Transaction{fresh}); err != nil {
		t.Fatalf("AppendFresh: %v", err)
	}

	got, err := s.Get("sms")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if len(got.Txs) != 2 || got.Txs[1].ID != "R3" {
		t.Fatalf("after append Txs = %+v, want R1 then R3", got.Txs)
	}
	if got.TxCount != 2 || got.Name != "Jan 2025 – Sep 2026" {
		t.Fatalf("metadata after append = %+v", got)
	}
}

// TestLegacyJSONMigration proves a pre-SQLite JSON store is imported once and
// archived, so upgrading never loses history.
func TestLegacyJSONMigration(t *testing.T) {
	dir := t.TempDir()
	legacyPath := filepath.Join(dir, "statements.json")
	payload := struct {
		Statements []StatementRecord `json:"statements"`
	}{Statements: []StatementRecord{sampleRecord("old")}}
	raw, _ := json.Marshal(payload)
	if err := os.WriteFile(legacyPath, raw, 0o600); err != nil {
		t.Fatalf("write legacy: %v", err)
	}

	dbPath := filepath.Join(dir, "statements.db")
	s, err := New(dbPath)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer s.Close()

	got, err := s.Get("old")
	if err != nil {
		t.Fatalf("Get migrated: %v", err)
	}
	if got.Name != "Jan 2025 – Mar 2025" || len(got.Txs) != 2 {
		t.Fatalf("migrated record = %+v", got)
	}
	if _, err := os.Stat(legacyPath + ".migrated"); err != nil {
		t.Fatalf("legacy file not archived: %v", err)
	}

	// Reopening must not import again (archived file is out of the way).
	s.Close()
	again, err := New(dbPath)
	if err != nil {
		t.Fatalf("New reopen: %v", err)
	}
	defer again.Close()
	metas, _ := again.List()
	if len(metas) != 1 {
		t.Fatalf("after reopen List = %+v, want 1 record", metas)
	}
}
