package store

import (
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

func TestStoreRoundTrip(t *testing.T) {
	s := New(filepath.Join(t.TempDir(), "statements.json"))

	if err := s.Add(sampleRecord("a")); err != nil {
		t.Fatalf("Add: %v", err)
	}
	if err := s.Add(sampleRecord("b")); err != nil {
		t.Fatalf("Add: %v", err)
	}

	// A fresh Store over the same file must see both records, newest
	// import first (same ImportedAt, so reverse insertion order).
	other := New(s.path)
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
	s := New(filepath.Join(t.TempDir(), "missing.json"))
	metas, err := s.List()
	if err != nil {
		t.Fatalf("List on missing file: %v", err)
	}
	if len(metas) != 0 {
		t.Fatalf("List = %+v, want empty", metas)
	}
}

func TestStoreDeleteAndRename(t *testing.T) {
	s := New(filepath.Join(t.TempDir(), "statements.json"))
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
// marker, and both persist through the same file.
func TestStoreSourceDefaultsAndSms(t *testing.T) {
	path := filepath.Join(t.TempDir(), "statements.json")
	s := New(path)

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

	// Round trip: a fresh Store must keep the explicit source.
	other := New(path)
	rec, err := other.Get("sms1")
	if err != nil {
		t.Fatalf("Get sms: %v", err)
	}
	if rec.Source != SourceSms || rec.Name != "Sep 2026" {
		t.Fatalf("round trip = %+v", rec)
	}
}
