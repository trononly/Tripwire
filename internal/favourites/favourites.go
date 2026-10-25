// Package favourites validates and persists the recipients saved on the Send
// screen. A favourite is a snapshot of the contact the user picked: the name
// and canonical phone are stored locally, and no contact id or permission is
// needed afterwards.
package favourites

import (
	"fmt"
	"strings"

	"mpesa-analyzer/internal/phone"
	"mpesa-analyzer/internal/store"
)

// Saved Send flows. A favourite belongs to exactly one of these, so Send
// Money and Pochi La Biashara keep separate lists.
const (
	KindSend  = "send"
	KindPochi = "pochi"
)

// Service is the validation layer between the Wails service and the store.
type Service struct {
	store *store.Store
}

func New(s *store.Store) *Service {
	return &Service{store: s}
}

func kindOf(raw string) (string, error) {
	switch kind := strings.ToLower(strings.TrimSpace(raw)); kind {
	case KindSend, KindPochi:
		return kind, nil
	default:
		return "", fmt.Errorf("unknown favourite flow")
	}
}

// List returns one flow's saved recipients in display order.
func (s *Service) List(kind string) ([]store.Favourite, error) {
	clean, err := kindOf(kind)
	if err != nil {
		return nil, err
	}
	return s.store.ListFavourites(clean)
}

// Add normalizes a raw number from the contact picker or manual entry and
// saves it in the given flow. The name is optional and falls back to the
// number.
func (s *Service) Add(name, rawPhone, kind string) (store.Favourite, error) {
	clean, err := kindOf(kind)
	if err != nil {
		return store.Favourite{}, err
	}
	canonical := phone.Normalize(rawPhone)
	if canonical == "" {
		return store.Favourite{}, fmt.Errorf("enter a valid Kenyan mobile number")
	}
	return s.store.AddFavourite(Name(name, canonical), canonical, clean)
}

// Rename changes a saved recipient's display name.
func (s *Service) Rename(id, name string) error {
	clean := Name(name, "")
	if clean == "" {
		return fmt.Errorf("favourite name cannot be empty")
	}
	return s.store.RenameFavourite(id, clean)
}

// Delete removes a saved recipient.
func (s *Service) Delete(id string) error {
	return s.store.DeleteFavourite(id)
}

// Reorder persists a new manual order for saved recipients. ids is the full
// list in display order; ids[0] ends up first.
func (s *Service) Reorder(ids []string) error {
	return s.store.ReorderFavourites(ids)
}

// Name collapses whitespace, caps the length and falls back to the phone
// when the contact has no name. A blank fallback means "keep it empty".
func Name(raw, fallback string) string {
	name := strings.Join(strings.Fields(raw), " ")
	if name == "" {
		name = fallback
	}
	if r := []rune(name); len(r) > 60 {
		name = string(r[:60])
	}
	return name
}
