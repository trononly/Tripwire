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

// Service is the validation layer between the Wails service and the store.
type Service struct {
	store *store.Store
}

func New(s *store.Store) *Service {
	return &Service{store: s}
}

// List returns the saved recipients, alphabetical by name.
func (s *Service) List() ([]store.Favourite, error) {
	return s.store.ListFavourites()
}

// Add normalizes a raw number from the contact picker or manual entry and
// saves it. The name is optional and falls back to the number.
func (s *Service) Add(name, rawPhone string) (store.Favourite, error) {
	canonical := phone.Normalize(rawPhone)
	if canonical == "" {
		return store.Favourite{}, fmt.Errorf("enter a valid Kenyan mobile number")
	}
	return s.store.AddFavourite(Name(name, canonical), canonical)
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
