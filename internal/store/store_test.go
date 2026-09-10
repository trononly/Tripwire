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
