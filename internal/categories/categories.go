// Package categories manages the user's own spending labels: validation and
// persistence of the category list, and the rules that attach a category to a
// transaction, a counterparty or a transaction type.
//
// Built-in categories (internal/analysis, derived from M-Pesa transaction
// types) remain the automatic baseline. A user category is an override on top
// and is resolved at read time, so statement re-imports and SMS refreshes
// never lose an assignment.
package categories

import (
	"fmt"
	"strings"
	"unicode/utf8"

	"mpesa-analyzer/internal/analysis"
	"mpesa-analyzer/internal/counterparty"
	"mpesa-analyzer/internal/parser"
	"mpesa-analyzer/internal/store"
)

const (
	maxNameLen    = 40
	maxEmojiBytes = 32
	maxCategories = 60
)

// Service is the validation layer between the Wails service and the store.
type Service struct {
	store *store.Store
}

func New(s *store.Store) *Service {
	return &Service{store: s}
}

// List returns every user category in display order.
func (s *Service) List() ([]store.Category, error) {
	return s.store.ListCategories()
}

// Create validates and appends a category.
func (s *Service) Create(rawName, rawEmoji string) (store.Category, error) {
	name, err := cleanName(rawName)
	if err != nil {
		return store.Category{}, err
	}
	emoji, err := cleanEmoji(rawEmoji)
	if err != nil {
		return store.Category{}, err
	}

	existing, err := s.store.ListCategories()
	if err != nil {
		return store.Category{}, err
	}
	if len(existing) >= maxCategories {
		return store.Category{}, fmt.Errorf("you already have %d categories; delete one first", maxCategories)
	}
	return s.store.AddCategory(name, emoji)
}

// Update changes a category's name and emoji. The id (and therefore every
// rule and link) stays the same.
func (s *Service) Update(id, rawName, rawEmoji string) error {
	name, err := cleanName(rawName)
	if err != nil {
		return err
	}
	emoji, err := cleanEmoji(rawEmoji)
	if err != nil {
		return err
	}
	return s.store.UpdateCategory(id, name, emoji)
}

// Delete removes a category and its rules. Transactions fall back to their
// built-in category rather than disappearing.
func (s *Service) Delete(id string) error {
	return s.store.DeleteCategory(id)
}

// Reorder persists a new manual order. ids is the full list in display order.
func (s *Service) Reorder(ids []string) error {
	return s.store.ReorderCategories(ids)
}

// Assign applies one choice from the category picker.
//
// With applyToSimilar and a counterparty key, the assignment becomes a
// counterparty rule (all transactions from that merchant/person); without a
// counterparty it becomes a transaction-type rule (all withdrawals, all
// airtime). Otherwise it is a single-transaction override.
//
// categoryID may be empty for "Automatic". On a single row that writes an
// explicit automatic override so the row can leave a counterparty/type rule
// group; applied to a whole group it clears the group rule so every member
// returns to its built-in category.
func (s *Service) Assign(txID, txType, counterpartyKey, categoryID string, applyToSimilar bool) error {
	txID = strings.TrimSpace(txID)
	if txID == "" {
		return fmt.Errorf("missing transaction")
	}
	categoryID = strings.TrimSpace(categoryID)
	if categoryID != "" {
		if _, err := s.store.CategoryByID(categoryID); err != nil {
			return fmt.Errorf("that category no longer exists")
		}
	}

	ruleKind, ruleKey := "", ""
	if applyToSimilar {
		if key := strings.TrimSpace(counterpartyKey); key != "" {
			ruleKind, ruleKey = store.RuleCounterparty, key
		} else if key := strings.TrimSpace(txType); key != "" {
			ruleKind, ruleKey = store.RuleType, key
		}
	}

	// No counterparty/type to share with: this is a single-row choice.
	if ruleKind == "" {
		return s.store.SetCategoryRule(store.RuleTx, txID, categoryID)
	}

	if categoryID == "" {
		// Back to automatic for the whole group: drop the shared rule, then
		// drop any row override that would keep this one labelled.
		if err := s.store.ClearCategoryRule(ruleKind, ruleKey); err != nil {
			return err
		}
		return s.store.ClearCategoryRule(store.RuleTx, txID)
	}

	if err := s.store.SetCategoryRule(ruleKind, ruleKey, categoryID); err != nil {
		return err
	}
	// A row override would shadow the shared rule it was just folded into.
	return s.store.ClearCategoryRule(store.RuleTx, txID)
}

// CounterpartyKey is the identity used for "same counterparty" rules. It is
// the normalized form of the displayed counterparty label, so the list's
// grouping preview and the backend's rule matching can never disagree.
func CounterpartyKey(description string) string {
	return counterparty.GroupKey(analysis.CounterpartyLabel(description))
}

// Index is the resolved category state of one dataset: the definitions plus
// the three rule maps. Loading it is one query per table, independent of the
// number of transactions.
type Index struct {
	categories   map[string]store.Category
	tx           map[string]string
	counterparty map[string]string
	byType       map[string]string
}

// Load reads the category definitions and every rule.
func (s *Service) Load() (*Index, error) {
	defs, err := s.store.ListCategories()
	if err != nil {
		return nil, err
	}
	rules, err := s.store.ListCategoryRules()
	if err != nil {
		return nil, err
	}

	ix := &Index{
		categories:   make(map[string]store.Category, len(defs)),
		tx:           make(map[string]string),
		counterparty: make(map[string]string),
		byType:       make(map[string]string),
	}
	for _, c := range defs {
		ix.categories[c.ID] = c
	}
	for _, r := range rules {
		switch r.Kind {
		case store.RuleTx:
			ix.tx[r.Key] = r.CategoryID
		case store.RuleCounterparty:
			ix.counterparty[r.Key] = r.CategoryID
		case store.RuleType:
			ix.byType[r.Key] = r.CategoryID
		}
	}
	return ix, nil
}

// ResolveAll maps each transaction ID to its user category. Paired Fuliza fee
// rows ("<receipt>-F"/"-C") inherit their parent's category when they have no
// assignment of their own, so labelling a purchase also labels its fee.
func (ix *Index) ResolveAll(txs []parser.Transaction) map[string]store.Category {
	out := make(map[string]store.Category, len(txs))
	for _, tx := range txs {
		if c, ok := ix.resolveOne(tx); ok {
			out[tx.ID] = c
		}
	}
	for _, tx := range txs {
		if _, ok := out[tx.ID]; ok {
			continue
		}
		base, ok := baseReceipt(tx.ID)
		if !ok {
			continue
		}
		if c, ok := out[base]; ok {
			out[tx.ID] = c
		}
	}
	return out
}

// resolveOne applies the precedence: transaction override, then counterparty,
// then transaction type. An empty transaction rule is an explicit automatic
// choice and stops the search. A rule whose category was deleted is ignored
// (and the next level gets a chance) instead of hiding the row's category.
func (ix *Index) resolveOne(tx parser.Transaction) (store.Category, bool) {
	if id, ok := ix.tx[tx.ID]; ok {
		if id == "" {
			return store.Category{}, false
		}
		if c, ok := ix.categories[id]; ok {
			return c, true
		}
	}
	if key := CounterpartyKey(tx.Description); key != "" {
		if id, ok := ix.counterparty[key]; ok {
			if c, ok := ix.categories[id]; ok {
				return c, true
			}
		}
	}
	if id, ok := ix.byType[string(analysis.TypeOf(tx.Description))]; ok {
		if c, ok := ix.categories[id]; ok {
			return c, true
		}
	}
	return store.Category{}, false
}

// baseReceipt strips the SMS pairing suffix from a Fuliza fee/charge row.
// M-Pesa receipt numbers never contain a hyphen, so this cannot collide with
// a real receipt.
func baseReceipt(id string) (string, bool) {
	for _, suffix := range []string{"-F", "-C"} {
		if strings.HasSuffix(id, suffix) && len(id) > len(suffix) {
			return strings.TrimSuffix(id, suffix), true
		}
	}
	return "", false
}

func cleanName(raw string) (string, error) {
	name := strings.Join(strings.Fields(raw), " ")
	if name == "" {
		return "", fmt.Errorf("give the category a name")
	}
	if utf8.RuneCountInString(name) > maxNameLen {
		return "", fmt.Errorf("category names are limited to %d characters", maxNameLen)
	}
	return name, nil
}

func cleanEmoji(raw string) (string, error) {
	emoji := strings.TrimSpace(raw)
	if emoji == "" {
		return "", fmt.Errorf("pick an emoji")
	}
	if len(emoji) > maxEmojiBytes {
		return "", fmt.Errorf("pick a single emoji")
	}
	return emoji, nil
}
