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
