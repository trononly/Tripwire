package suite

import (
	"path/filepath"
	"testing"

	. "mpesa-analyzer/internal/store"
)

func TestFavouritesRoundTrip(t *testing.T) {
	s := newTestStore(t)

	zed, err := s.AddFavourite("Zed", "0722000002")
	if err != nil {
		t.Fatalf("AddFavourite(Zed): %v", err)
	}
	alice, err := s.AddFavourite("Alice", "0722000001")
	if err != nil {
		t.Fatalf("AddFavourite(Alice): %v", err)
	}

	list, err := s.ListFavourites()
	if err != nil {
		t.Fatalf("ListFavourites: %v", err)
	}
	if len(list) != 2 || list[0].Name != "Alice" || list[1].Name != "Zed" {
		t.Fatalf("ListFavourites = %+v, want [Alice Zed]", list)
	}
	if list[0].Phone != "0722000001" || list[0].ID != alice.ID {
		t.Fatalf("first favourite = %+v", list[0])
	}
	if list[1].ID != zed.ID || list[1].CreatedAt.IsZero() {
		t.Fatalf("second favourite = %+v", list[1])
	}
}

func TestFavouritesRejectDuplicatePhone(t *testing.T) {
	s := newTestStore(t)
	if _, err := s.AddFavourite("Alice", "0722000001"); err != nil {
		t.Fatalf("AddFavourite: %v", err)
	}
	if _, err := s.AddFavourite("Alicia", "0722000001"); err == nil {
		t.Fatal("duplicate phone should be rejected")
	}
}

func TestFavouritesRenameAndDelete(t *testing.T) {
	s := newTestStore(t)
	fav, err := s.AddFavourite("Alice", "0722000001")
	if err != nil {
		t.Fatalf("AddFavourite: %v", err)
	}

	if err := s.RenameFavourite(fav.ID, "Alice W."); err != nil {
		t.Fatalf("RenameFavourite: %v", err)
	}
	list, _ := s.ListFavourites()
	if len(list) != 1 || list[0].Name != "Alice W." {
		t.Fatalf("after rename = %+v", list)
	}

	if err := s.RenameFavourite("missing", "Nobody"); err == nil {
		t.Fatal("renaming an unknown favourite should fail")
	}
	if err := s.DeleteFavourite(fav.ID); err != nil {
		t.Fatalf("DeleteFavourite: %v", err)
	}
	if list, _ := s.ListFavourites(); len(list) != 0 {
		t.Fatalf("after delete = %+v", list)
	}
	if err := s.DeleteFavourite(fav.ID); err == nil {
		t.Fatal("deleting an unknown favourite should fail")
	}
}

func TestFavouritesSurviveReopen(t *testing.T) {
	path := filepath.Join(t.TempDir(), "statements.db")
	first, err := New(path)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := first.AddFavourite("Alice", "0722000001"); err != nil {
		t.Fatalf("AddFavourite: %v", err)
	}
	first.Close()

	second, err := New(path)
	if err != nil {
		t.Fatalf("New reopen: %v", err)
	}
	defer second.Close()

	list, err := second.ListFavourites()
	if err != nil {
		t.Fatalf("ListFavourites: %v", err)
	}
	if len(list) != 1 || list[0].Name != "Alice" || list[0].Phone != "0722000001" {
		t.Fatalf("after reopen = %+v", list)
	}
}
