package favourites

import (
	"fmt"
	"strings"

	"mpesa-analyzer/internal/store"
)

// Lipa na M-Pesa destination kinds. A paybill needs an account (the
// identifier the biller expects); a till identifies the shop on its own, so
// its account is always empty.
const (
	LipaKindPaybill = "paybill"
	LipaKindTill    = "till"
)

// lipaKindOf normalizes and validates a Lipa flow name.
func lipaKindOf(raw string) (string, error) {
	kind := strings.ToLower(strings.TrimSpace(raw))
	switch kind {
	case LipaKindPaybill, LipaKindTill:
		return kind, nil
	default:
		return "", fmt.Errorf("unknown favourite kind")
	}
}

// ListLipa returns one flow's saved Lipa na M-Pesa destinations in display
// order: paybills and tills never mix.
func (s *Service) ListLipa(kind string) ([]store.LipaFavourite, error) {
	clean, err := lipaKindOf(kind)
	if err != nil {
		return nil, err
	}
	return s.store.ListLipaFavourites(clean)
}

// AddLipa validates a manually entered paybill or till and saves it. Lipa
// favourites never touch the phone's contacts: the number and account are
// typed by the user. The name is optional and falls back to the account
// (paybill) or the number (till).
func (s *Service) AddLipa(name, kind, number, account string) (store.LipaFavourite, error) {
	kind, err := lipaKindOf(kind)
	if err != nil {
		return store.LipaFavourite{}, err
	}
	// Tolerate grouping spaces in typed numbers ("247 247"); anything that
	// still is not all digits fails the length/format check below.
	number = strings.Join(strings.Fields(number), "")

	var fallback string
	switch kind {
	case LipaKindPaybill:
		if !digitsBetween(number, 4, 7) {
			return store.LipaFavourite{}, fmt.Errorf("enter a valid paybill number (4-7 digits)")
		}
		account = strings.Join(strings.Fields(account), " ")
		if account == "" {
			return store.LipaFavourite{}, fmt.Errorf("enter an account name or number")
		}
		if len([]rune(account)) > 20 {
			return store.LipaFavourite{}, fmt.Errorf("account cannot be longer than 20 characters")
		}
		if strings.ContainsAny(account, "*#") {
			return store.LipaFavourite{}, fmt.Errorf("account cannot contain * or #")
		}
		fallback = account
	case LipaKindTill:
		if !digitsBetween(number, 5, 7) {
			return store.LipaFavourite{}, fmt.Errorf("enter a valid till number (5-7 digits)")
		}
		// A till has no account; ignore anything the caller sent.
		account = ""
		fallback = number
	}
	if fallback == "" {
		fallback = number
	}
	return s.store.AddLipaFavourite(Name(name, fallback), kind, number, account)
}

// RenameLipa changes a saved Lipa destination's display name.
func (s *Service) RenameLipa(id, name string) error {
	clean := Name(name, "")
	if clean == "" {
		return fmt.Errorf("favourite name cannot be empty")
	}
	return s.store.RenameLipaFavourite(id, clean)
}

// DeleteLipa removes a saved Lipa destination.
func (s *Service) DeleteLipa(id string) error {
	return s.store.DeleteLipaFavourite(id)
}

// ReorderLipa persists a new manual order for saved Lipa destinations.
func (s *Service) ReorderLipa(ids []string) error {
	return s.store.ReorderLipaFavourites(ids)
}

// digitsBetween reports whether s is all ASCII digits and min..max long.
func digitsBetween(s string, min, max int) bool {
	if len(s) < min || len(s) > max {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
