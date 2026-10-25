package favourites

import (
	"path/filepath"
	"strings"
	"testing"

	"mpesa-analyzer/internal/store"
)

func newService(t *testing.T) *Service {
	t.Helper()
	s, err := store.New(filepath.Join(t.TempDir(), "statements.db"))
	if err != nil {
		t.Fatalf("store.New: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return New(s)
}

func TestAddNormalizesAndFallsBackToPhone(t *testing.T) {
	svc := newService(t)

	fav, err := svc.Add("  Mama   Jane  ", "+254 712 345 678")
	if err != nil {
		t.Fatalf("Add: %v", err)
	}
	if fav.Phone != "0712345678" {
		t.Fatalf("phone = %q, want 0712345678", fav.Phone)
	}
	if fav.Name != "Mama Jane" {
		t.Fatalf("name = %q, want Mama Jane", fav.Name)
	}

	unnamed, err := svc.Add("", "0712 000 001")
	if err != nil {
		t.Fatalf("Add(unnamed): %v", err)
	}
	if unnamed.Name != "0712000001" {
		t.Fatalf("fallback name = %q, want the phone", unnamed.Name)
	}
}

func TestAddRejectsInvalidAndDuplicate(t *testing.T) {
	svc := newService(t)

	if _, err := svc.Add("Alice", "12345"); err == nil {
		t.Fatal("invalid phone should be rejected")
	}
	if _, err := svc.Add("Alice", "0722000001"); err != nil {
		t.Fatalf("Add: %v", err)
	}
	if _, err := svc.Add("Alicia", "+254722000001"); err == nil {
		t.Fatal("duplicate phone should be rejected")
	}
}

func TestRenameAndDelete(t *testing.T) {
	svc := newService(t)
	fav, err := svc.Add("Alice", "0722000001")
	if err != nil {
		t.Fatalf("Add: %v", err)
	}

	if err := svc.Rename(fav.ID, "  Alice   W.  "); err != nil {
		t.Fatalf("Rename: %v", err)
	}
	list, err := svc.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 1 || list[0].Name != "Alice W." {
		t.Fatalf("after rename = %+v", list)
	}

	if err := svc.Rename(fav.ID, "   "); err == nil {
		t.Fatal("blank rename should be rejected")
	}

	if err := svc.Delete(fav.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if list, _ := svc.List(); len(list) != 0 {
		t.Fatalf("after delete = %+v", list)
	}
}

func TestNameIsCapped(t *testing.T) {
	long := strings.Repeat("a", 100)
	if got := Name(long, "0722000001"); len([]rune(got)) != 60 {
		t.Fatalf("Name length = %d, want 60", len([]rune(got)))
	}
}
