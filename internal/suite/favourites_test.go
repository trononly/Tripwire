package suite

import (
	"database/sql"
	"path/filepath"
	"strings"
	"testing"

	. "mpesa-analyzer/internal/store"
)

func TestFavouritesRoundTrip(t *testing.T) {
	s := newTestStore(t)

	// New favourites are appended, so the list is insertion order; the
	// alphabetical fallback only applies to rows that share a position.
	zed, err := s.AddFavourite("Zed", "0722000002", "send")
	if err != nil {
		t.Fatalf("AddFavourite(Zed): %v", err)
	}
	alice, err := s.AddFavourite("Alice", "0722000001", "send")
	if err != nil {
		t.Fatalf("AddFavourite(Alice): %v", err)
	}

	list, err := s.ListFavourites("send")
	if err != nil {
		t.Fatalf("ListFavourites: %v", err)
	}
	if len(list) != 2 || list[0].Name != "Zed" || list[1].Name != "Alice" {
		t.Fatalf("ListFavourites = %+v, want [Zed Alice]", list)
	}
	if list[0].Phone != "0722000002" || list[0].ID != zed.ID || list[0].SortOrder != 1 {
		t.Fatalf("first favourite = %+v", list[0])
	}
	if list[1].ID != alice.ID || list[1].CreatedAt.IsZero() || list[1].SortOrder != 2 {
		t.Fatalf("second favourite = %+v", list[1])
	}
}

func TestFavouritesRejectDuplicatePhone(t *testing.T) {
	s := newTestStore(t)
	if _, err := s.AddFavourite("Alice", "0722000001", "send"); err != nil {
		t.Fatalf("AddFavourite: %v", err)
	}
	if _, err := s.AddFavourite("Alicia", "0722000001", "send"); err == nil {
		t.Fatal("duplicate phone should be rejected")
	}
}

func TestFavouritesRenameAndDelete(t *testing.T) {
	s := newTestStore(t)
	fav, err := s.AddFavourite("Alice", "0722000001", "send")
	if err != nil {
		t.Fatalf("AddFavourite: %v", err)
	}

	if err := s.RenameFavourite(fav.ID, "Alice W."); err != nil {
		t.Fatalf("RenameFavourite: %v", err)
	}
	list, _ := s.ListFavourites("send")
	if len(list) != 1 || list[0].Name != "Alice W." {
		t.Fatalf("after rename = %+v", list)
	}

	if err := s.RenameFavourite("missing", "Nobody"); err == nil {
		t.Fatal("renaming an unknown favourite should fail")
	}
	if err := s.DeleteFavourite(fav.ID); err != nil {
		t.Fatalf("DeleteFavourite: %v", err)
	}
	if list, _ := s.ListFavourites("send"); len(list) != 0 {
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
	if _, err := first.AddFavourite("Alice", "0722000001", "send"); err != nil {
		t.Fatalf("AddFavourite: %v", err)
	}
	first.Close()

	second, err := New(path)
	if err != nil {
		t.Fatalf("New reopen: %v", err)
	}
	defer second.Close()

	list, err := second.ListFavourites("send")
	if err != nil {
		t.Fatalf("ListFavourites: %v", err)
	}
	if len(list) != 1 || list[0].Name != "Alice" || list[0].Phone != "0722000001" {
		t.Fatalf("after reopen = %+v", list)
	}
}

func TestFavouritesReorderSurvivesReopen(t *testing.T) {
	path := filepath.Join(t.TempDir(), "statements.db")
	first, err := New(path)
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	alice, err := first.AddFavourite("Alice", "0722000001", "send")
	if err != nil {
		t.Fatalf("AddFavourite(Alice): %v", err)
	}
	bob, err := first.AddFavourite("Bob", "0722000002", "send")
	if err != nil {
		t.Fatalf("AddFavourite(Bob): %v", err)
	}
	cara, err := first.AddFavourite("Cara", "0722000003", "send")
	if err != nil {
		t.Fatalf("AddFavourite(Cara): %v", err)
	}

	if err := first.ReorderFavourites([]string{cara.ID, alice.ID, bob.ID}); err != nil {
		t.Fatalf("ReorderFavourites: %v", err)
	}
	got := favouriteNames(t, first)
	if want := []string{"Cara", "Alice", "Bob"}; !sameStrings(got, want) {
		t.Fatalf("order = %v, want %v", got, want)
	}
	list, err := first.ListFavourites("send")
	if err != nil {
		t.Fatalf("ListFavourites: %v", err)
	}
	for i, f := range list {
		if f.SortOrder != i+1 {
			t.Fatalf("sortOrder[%d] = %d, want %d", i, f.SortOrder, i+1)
		}
	}

	if err := first.ReorderFavourites([]string{"missing"}); err == nil {
		t.Fatal("reordering an unknown favourite should fail")
	}
	if got := favouriteNames(t, first); !sameStrings(got, []string{"Cara", "Alice", "Bob"}) {
		t.Fatalf("failed reorder changed the order: %v", got)
	}
	first.Close()

	second, err := New(path)
	if err != nil {
		t.Fatalf("New reopen: %v", err)
	}
	defer second.Close()

	if got := favouriteNames(t, second); !sameStrings(got, []string{"Cara", "Alice", "Bob"}) {
		t.Fatalf("after reopen order = %v", got)
	}
	list, err = second.ListFavourites("send")
	if err != nil {
		t.Fatalf("ListFavourites after reopen: %v", err)
	}
	if list[0].SortOrder != 1 || list[1].SortOrder != 2 || list[2].SortOrder != 3 {
		t.Fatalf("after reopen = %+v", list)
	}
}

func TestFavouritesAreScopedByFlow(t *testing.T) {
	s := newTestStore(t)

	send, err := s.AddFavourite("Mama", "0722000001", "send")
	if err != nil {
		t.Fatalf("AddFavourite(send): %v", err)
	}
	pochi, err := s.AddFavourite("Shop", "0722000001", "pochi")
	if err != nil {
		t.Fatalf("AddFavourite(pochi): %v", err)
	}
	if send.Kind != "send" || pochi.Kind != "pochi" {
		t.Fatalf("kinds = %q/%q", send.Kind, pochi.Kind)
	}

	sendList, err := s.ListFavourites("send")
	if err != nil {
		t.Fatalf("ListFavourites(send): %v", err)
	}
	pochiList, err := s.ListFavourites("pochi")
	if err != nil {
		t.Fatalf("ListFavourites(pochi): %v", err)
	}
	if len(sendList) != 1 || sendList[0].Name != "Mama" {
		t.Fatalf("send list = %+v", sendList)
	}
	if len(pochiList) != 1 || pochiList[0].Name != "Shop" {
		t.Fatalf("pochi list = %+v", pochiList)
	}

	// The same number is allowed in the other flow, but not twice in one.
	if _, err := s.AddFavourite("Mama again", "0722000001", "send"); err == nil {
		t.Fatal("duplicate phone within a flow should be rejected")
	}
}

func TestFavouritesMigrateLegacyPhonesToSendFlow(t *testing.T) {
	path := filepath.Join(t.TempDir(), "statements.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open legacy db: %v", err)
	}
	if _, err := db.Exec(`
		CREATE TABLE favourites (
			id         TEXT PRIMARY KEY,
			name       TEXT NOT NULL,
			phone      TEXT NOT NULL UNIQUE,
			sort_order INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL
		);
		INSERT INTO favourites (id, name, phone, sort_order, created_at)
		VALUES ('legacy', 'Legacy', '0722000001', 1, '2026-01-01T00:00:00Z');
	`); err != nil {
		db.Close()
		t.Fatalf("seed legacy favourites: %v", err)
	}
	db.Close()

	s, err := New(path)
	if err != nil {
		t.Fatalf("New after migration: %v", err)
	}
	defer s.Close()

	list, err := s.ListFavourites("send")
	if err != nil {
		t.Fatalf("ListFavourites(send): %v", err)
	}
	if len(list) != 1 || list[0].Kind != "send" || list[0].SortOrder != 1 {
		t.Fatalf("migrated favourites = %+v", list)
	}
	if _, err := s.AddFavourite("Shop", "0722000001", "pochi"); err != nil {
		t.Fatalf("legacy phone should be reusable in Pochi: %v", err)
	}
}

func TestLipaFavouritesRoundTrip(t *testing.T) {
	s := newTestStore(t)

	paybill, err := s.AddLipaFavourite("KPLC", "paybill", "888880", "12345678")
	if err != nil {
		t.Fatalf("AddLipaFavourite(paybill): %v", err)
	}
	if paybill.Kind != "paybill" || paybill.Account != "12345678" ||
		paybill.SortOrder != 1 || paybill.CreatedAt.IsZero() {
		t.Fatalf("paybill = %+v", paybill)
	}

	till, err := s.AddLipaFavourite("Corner Shop", "till", "123456", "")
	if err != nil {
		t.Fatalf("AddLipaFavourite(till): %v", err)
	}
	if till.Kind != "till" || till.Account != "" || till.SortOrder != 1 {
		t.Fatalf("till = %+v", till)
	}

	// The same paybill number is a different destination for another
	// account; the same (kind, number, account) triple is a duplicate.
	other, err := s.AddLipaFavourite("KPLC prepaid", "paybill", "888880", "999")
	if err != nil {
		t.Fatalf("AddLipaFavourite(other account): %v", err)
	}
	if other.SortOrder != 2 {
		t.Fatalf("other = %+v", other)
	}
	if _, err := s.AddLipaFavourite("KPLC again", "paybill", "888880", "12345678"); err == nil {
		t.Fatal("duplicate destination should be rejected")
	} else if !strings.Contains(err.Error(), "already saved as KPLC") {
		t.Fatalf("duplicate error = %v", err)
	}

	paybills, err := s.ListLipaFavourites("paybill")
	if err != nil {
		t.Fatalf("ListLipaFavourites(paybill): %v", err)
	}
	if len(paybills) != 2 || paybills[0].Name != "KPLC" || paybills[1].Name != "KPLC prepaid" {
		t.Fatalf("paybill list = %+v", paybills)
	}
	tills, err := s.ListLipaFavourites("till")
	if err != nil {
		t.Fatalf("ListLipaFavourites(till): %v", err)
	}
	if len(tills) != 1 || tills[0].Name != "Corner Shop" {
		t.Fatalf("till list = %+v", tills)
	}

	if err := s.RenameLipaFavourite(till.ID, "Duka"); err != nil {
		t.Fatalf("RenameLipaFavourite: %v", err)
	}
	if err := s.RenameLipaFavourite("missing", "Nobody"); err == nil {
		t.Fatal("renaming an unknown Lipa favourite should fail")
	}
	if err := s.DeleteLipaFavourite(till.ID); err != nil {
		t.Fatalf("DeleteLipaFavourite: %v", err)
	}
	if err := s.DeleteLipaFavourite(till.ID); err == nil {
		t.Fatal("deleting an unknown Lipa favourite should fail")
	}
	paybills, _ = s.ListLipaFavourites("paybill")
	if len(paybills) != 2 || paybills[0].Name != "KPLC" || paybills[1].Name != "KPLC prepaid" {
		t.Fatalf("after delete = %+v", paybills)
	}
	if tills, _ := s.ListLipaFavourites("till"); len(tills) != 0 {
		t.Fatalf("till list after delete = %+v", tills)
	}
}

func TestLipaFavouritesAreScopedByFlow(t *testing.T) {
	s := newTestStore(t)

	// The same number can be a paybill in one list and a till in the other.
	if _, err := s.AddLipaFavourite("Bill", "paybill", "123456", "acct"); err != nil {
		t.Fatalf("AddLipaFavourite(paybill): %v", err)
	}
	if _, err := s.AddLipaFavourite("Till", "till", "123456", ""); err != nil {
		t.Fatalf("AddLipaFavourite(till): %v", err)
	}
	paybills, err := s.ListLipaFavourites("paybill")
	if err != nil {
		t.Fatalf("ListLipaFavourites(paybill): %v", err)
	}
	tills, err := s.ListLipaFavourites("till")
	if err != nil {
		t.Fatalf("ListLipaFavourites(till): %v", err)
	}
	if len(paybills) != 1 || paybills[0].Name != "Bill" {
		t.Fatalf("paybill list = %+v", paybills)
	}
	if len(tills) != 1 || tills[0].Name != "Till" {
		t.Fatalf("till list = %+v", tills)
	}
}

func TestLipaFavouritesReorderSurvivesReopen(t *testing.T) {
	path := filepath.Join(t.TempDir(), "statements.db")
	first, err := New(path)
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	a, err := first.AddLipaFavourite("A", "paybill", "111111", "1")
	if err != nil {
		t.Fatalf("AddLipaFavourite(A): %v", err)
	}
	b, err := first.AddLipaFavourite("B", "till", "222222", "")
	if err != nil {
		t.Fatalf("AddLipaFavourite(B): %v", err)
	}
	c, err := first.AddLipaFavourite("C", "paybill", "333333", "3")
	if err != nil {
		t.Fatalf("AddLipaFavourite(C): %v", err)
	}
	// Each flow numbers its own positions from 1.
	if a.SortOrder != 1 || c.SortOrder != 2 || b.SortOrder != 1 {
		t.Fatalf("initial positions = %d/%d/%d", a.SortOrder, b.SortOrder, c.SortOrder)
	}

	if err := first.ReorderLipaFavourites([]string{c.ID, a.ID}); err != nil {
		t.Fatalf("ReorderLipaFavourites: %v", err)
	}
	if got := lipaNames(t, first, "paybill"); !sameStrings(got, []string{"C", "A"}) {
		t.Fatalf("order = %v, want [C A]", got)
	}
	if got := lipaNames(t, first, "till"); !sameStrings(got, []string{"B"}) {
		t.Fatalf("till order = %v, want [B]", got)
	}
	if err := first.ReorderLipaFavourites([]string{"missing"}); err == nil {
		t.Fatal("reordering an unknown Lipa favourite should fail")
	}
	if got := lipaNames(t, first, "paybill"); !sameStrings(got, []string{"C", "A"}) {
		t.Fatalf("failed reorder changed the order: %v", got)
	}
	first.Close()

	second, err := New(path)
	if err != nil {
		t.Fatalf("New reopen: %v", err)
	}
	defer second.Close()

	if got := lipaNames(t, second, "paybill"); !sameStrings(got, []string{"C", "A"}) {
		t.Fatalf("after reopen order = %v", got)
	}
	list, err := second.ListLipaFavourites("paybill")
	if err != nil {
		t.Fatalf("ListLipaFavourites after reopen: %v", err)
	}
	if list[0].SortOrder != 1 || list[1].SortOrder != 2 {
		t.Fatalf("after reopen = %+v", list)
	}
}

func favouriteNames(t *testing.T, s *Store) []string {
	t.Helper()
	list, err := s.ListFavourites("send")
	if err != nil {
		t.Fatalf("ListFavourites: %v", err)
	}
	names := make([]string, len(list))
	for i, f := range list {
		names[i] = f.Name
	}
	return names
}

func lipaNames(t *testing.T, s *Store, kind string) []string {
	t.Helper()
	list, err := s.ListLipaFavourites(kind)
	if err != nil {
		t.Fatalf("ListLipaFavourites(%s): %v", kind, err)
	}
	names := make([]string, len(list))
	for i, f := range list {
		names[i] = f.Name
	}
	return names
}

func sameStrings(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}
