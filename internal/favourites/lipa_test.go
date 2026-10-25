package favourites

import (
	"strings"
	"testing"
)

func TestAddLipaPaybill(t *testing.T) {
	svc := newService(t)

	fav, err := svc.AddLipa("  KPLC   prepaid ", " PAYBILL ", "888 880", " 1234  5678 ")
	if err != nil {
		t.Fatalf("AddLipa: %v", err)
	}
	if fav.Kind != LipaKindPaybill {
		t.Fatalf("kind = %q, want paybill", fav.Kind)
	}
	if fav.Number != "888880" {
		t.Fatalf("number = %q, want 888880", fav.Number)
	}
	if fav.Account != "1234 5678" {
		t.Fatalf("account = %q, want %q", fav.Account, "1234 5678")
	}
	if fav.Name != "KPLC prepaid" {
		t.Fatalf("name = %q, want KPLC prepaid", fav.Name)
	}

	// The name falls back to the account for a paybill.
	unnamed, err := svc.AddLipa("", "paybill", "247247", "ACME  LTD")
	if err != nil {
		t.Fatalf("AddLipa(unnamed): %v", err)
	}
	if unnamed.Name != "ACME LTD" {
		t.Fatalf("fallback name = %q, want the account", unnamed.Name)
	}

	if _, err := svc.AddLipa("Other", "paybill", "888880", "1234 5678"); err == nil {
		t.Fatal("duplicate paybill destination should be rejected")
	} else if !strings.Contains(err.Error(), "already saved as KPLC prepaid") {
		t.Fatalf("duplicate error = %v", err)
	}
}

func TestAddLipaPaybillValidation(t *testing.T) {
	svc := newService(t)

	if _, err := svc.AddLipa("KPLC", "paybill", "123", "1234"); err == nil ||
		!strings.Contains(err.Error(), "4-7 digits") {
		t.Fatalf("short paybill = %v", err)
	}
	if _, err := svc.AddLipa("KPLC", "paybill", "12345678", "1234"); err == nil ||
		!strings.Contains(err.Error(), "4-7 digits") {
		t.Fatalf("long paybill = %v", err)
	}
	if _, err := svc.AddLipa("KPLC", "paybill", "12a45", "1234"); err == nil ||
		!strings.Contains(err.Error(), "4-7 digits") {
		t.Fatalf("non-numeric paybill = %v", err)
	}

	if _, err := svc.AddLipa("KPLC", "paybill", "888880", "   "); err == nil ||
		!strings.Contains(err.Error(), "enter an account") {
		t.Fatalf("missing account = %v", err)
	}
	if _, err := svc.AddLipa("KPLC", "paybill", "888880", strings.Repeat("a", 21)); err == nil ||
		!strings.Contains(err.Error(), "20 characters") {
		t.Fatalf("long account = %v", err)
	}
	if _, err := svc.AddLipa("KPLC", "paybill", "888880", "123*4"); err == nil ||
		!strings.Contains(err.Error(), "* or #") {
		t.Fatalf("star account = %v", err)
	}
	if _, err := svc.AddLipa("KPLC", "paybill", "888880", "123#4"); err == nil ||
		!strings.Contains(err.Error(), "* or #") {
		t.Fatalf("hash account = %v", err)
	}

	if _, err := svc.AddLipa("KPLC", "water", "888880", "1234"); err == nil ||
		!strings.Contains(err.Error(), "unknown favourite kind") {
		t.Fatalf("unknown kind = %v", err)
	}
}

func TestAddLipaTillClearsAccount(t *testing.T) {
	svc := newService(t)

	fav, err := svc.AddLipa("", " Till ", "123 456", "ignored")
	if err != nil {
		t.Fatalf("AddLipa: %v", err)
	}
	if fav.Kind != LipaKindTill || fav.Number != "123456" || fav.Account != "" {
		t.Fatalf("till = %+v", fav)
	}
	if fav.Name != "123456" {
		t.Fatalf("fallback name = %q, want the number", fav.Name)
	}

	if _, err := svc.AddLipa("Shop", "till", "1234", ""); err == nil ||
		!strings.Contains(err.Error(), "5-7 digits") {
		t.Fatalf("short till = %v", err)
	}
	if _, err := svc.AddLipa("Shop", "till", "12345678", ""); err == nil ||
		!strings.Contains(err.Error(), "5-7 digits") {
		t.Fatalf("long till = %v", err)
	}
}

func TestRenameAndDeleteLipa(t *testing.T) {
	svc := newService(t)
	fav, err := svc.AddLipa("KPLC", "paybill", "888880", "1234")
	if err != nil {
		t.Fatalf("AddLipa: %v", err)
	}

	if err := svc.RenameLipa(fav.ID, "  KPLC   Prepaid  "); err != nil {
		t.Fatalf("RenameLipa: %v", err)
	}
	list, err := svc.ListLipa()
	if err != nil {
		t.Fatalf("ListLipa: %v", err)
	}
	if len(list) != 1 || list[0].Name != "KPLC Prepaid" {
		t.Fatalf("after rename = %+v", list)
	}

	if err := svc.RenameLipa(fav.ID, "   "); err == nil {
		t.Fatal("blank rename should be rejected")
	}

	if err := svc.DeleteLipa(fav.ID); err != nil {
		t.Fatalf("DeleteLipa: %v", err)
	}
	if list, _ := svc.ListLipa(); len(list) != 0 {
		t.Fatalf("after delete = %+v", list)
	}
}

func TestReorderLipa(t *testing.T) {
	svc := newService(t)
	a, err := svc.AddLipa("A", "paybill", "111111", "1")
	if err != nil {
		t.Fatalf("AddLipa(A): %v", err)
	}
	b, err := svc.AddLipa("B", "till", "222222", "")
	if err != nil {
		t.Fatalf("AddLipa(B): %v", err)
	}

	if err := svc.ReorderLipa([]string{b.ID, a.ID}); err != nil {
		t.Fatalf("ReorderLipa: %v", err)
	}
	list, err := svc.ListLipa()
	if err != nil {
		t.Fatalf("ListLipa: %v", err)
	}
	if len(list) != 2 || list[0].ID != b.ID || list[1].ID != a.ID ||
		list[0].SortOrder != 1 || list[1].SortOrder != 2 {
		t.Fatalf("after reorder = %+v", list)
	}

	if err := svc.ReorderLipa([]string{"missing"}); err == nil {
		t.Fatal("reordering an unknown favourite should fail")
	}
}
