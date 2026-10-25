package store

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

// Category is one user-defined spending label: an emoji plus a name. It is
// global (not scoped to a statement), so the same label applies to PDF
// imports and SMS wallets alike. SortOrder is the user's manual position in
// the picker and the chart legend: lower shows first, and new categories are
// appended.
type Category struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Emoji     string    `json:"emoji"`
	SortOrder int       `json:"sortOrder"`
	CreatedAt time.Time `json:"createdAt"`
}

// Category rule kinds. A rule's key is the stable identity of the thing it
// labels, never a statement row: receipt IDs survive re-imports, counterparty
// keys normalize casing and phone formatting, and the semantic type is the
// fallback for rows that name no counterparty (fees, airtime, withdrawals).
const (
	RuleTx           = "tx"
	RuleCounterparty = "counterparty"
	RuleType         = "type"
)

// CategoryRule is one persisted assignment. CategoryID is empty for an
// explicit "automatic" override on a single transaction: it wins over a
// counterparty/type rule and makes the row fall back to the built-in
// category.
type CategoryRule struct {
	Kind       string `json:"kind"`
	Key        string `json:"key"`
	CategoryID string `json:"categoryId"`
}

// ListCategories returns every user category in display order.
func (s *Store) ListCategories() ([]Category, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	rows, err := s.db.Query(`
		SELECT id, name, emoji, sort_order, created_at
		FROM categories
		ORDER BY sort_order, name COLLATE NOCASE, created_at, rowid`)
	if err != nil {
		return nil, fmt.Errorf("could not list categories: %w", err)
	}
	defer rows.Close()

	out := make([]Category, 0, 8)
	for rows.Next() {
		var (
			c       Category
			created string
		)
		if err := rows.Scan(&c.ID, &c.Name, &c.Emoji, &c.SortOrder, &created); err != nil {
			return nil, fmt.Errorf("could not read category: %w", err)
		}
		c.CreatedAt = parseTime(created)
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("could not list categories: %w", err)
	}
	return out, nil
}

// CategoryByID returns one category, or an error when it no longer exists.
func (s *Store) CategoryByID(id string) (Category, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var (
		c       Category
		created string
	)
	err := s.db.QueryRow(
		"SELECT id, name, emoji, sort_order, created_at FROM categories WHERE id = ?", id,
	).Scan(&c.ID, &c.Name, &c.Emoji, &c.SortOrder, &created)
	if errors.Is(err, sql.ErrNoRows) {
		return Category{}, fmt.Errorf("no category with id %q", id)
	}
	if err != nil {
		return Category{}, fmt.Errorf("could not read category: %w", err)
	}
	c.CreatedAt = parseTime(created)
	return c, nil
}

// AddCategory appends a category. Names are unique case-insensitively so the
// picker never shows two rows the user cannot tell apart.
func (s *Store) AddCategory(name, emoji string) (Category, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var existing string
	err := s.db.QueryRow(
		"SELECT name FROM categories WHERE name = ? COLLATE NOCASE", name,
	).Scan(&existing)
	switch {
	case err == nil:
		return Category{}, fmt.Errorf("you already have a category called %s", existing)
	case !errors.Is(err, sql.ErrNoRows):
		return Category{}, fmt.Errorf("could not check category name: %w", err)
	}

	c := Category{
		ID:        NewID(),
		Name:      name,
		Emoji:     emoji,
		CreatedAt: time.Now().UTC(),
	}
	if _, err := s.db.Exec(`
		INSERT INTO categories (id, name, emoji, sort_order, created_at)
		VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories), ?)`,
		c.ID, c.Name, c.Emoji, c.CreatedAt.Format(time.RFC3339Nano),
	); err != nil {
		return Category{}, fmt.Errorf("could not save category: %w", err)
	}
	if err := s.db.QueryRow(
		"SELECT sort_order FROM categories WHERE id = ?", c.ID,
	).Scan(&c.SortOrder); err != nil {
		return Category{}, fmt.Errorf("could not read category: %w", err)
	}
	return c, nil
}

// UpdateCategory changes a category's name and emoji. Renaming keeps the id,
// so every rule and deep link keeps pointing at the same category.
func (s *Store) UpdateCategory(id, name, emoji string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	var existing string
	err := s.db.QueryRow(
		"SELECT name FROM categories WHERE name = ? COLLATE NOCASE AND id <> ?", name, id,
	).Scan(&existing)
	switch {
	case err == nil:
		return fmt.Errorf("you already have a category called %s", existing)
	case !errors.Is(err, sql.ErrNoRows):
		return fmt.Errorf("could not check category name: %w", err)
	}

	res, err := s.db.Exec(
		"UPDATE categories SET name = ?, emoji = ? WHERE id = ?", name, emoji, id,
	)
	if err != nil {
		return fmt.Errorf("could not update category: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("no category with id %q", id)
	}
	return nil
}

// DeleteCategory removes a category and every rule that pointed at it, in a
// single transaction. The transactions themselves are untouched: with the
// rules gone they fall back to their built-in M-Pesa category.
func (s *Store) DeleteCategory(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("could not start category delete: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM category_rules WHERE category_id = ?", id); err != nil {
		return fmt.Errorf("could not clear category rules: %w", err)
	}
	res, err := tx.Exec("DELETE FROM categories WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("could not delete category: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("no category with id %q", id)
	}
	return tx.Commit()
}

// ReorderCategories rewrites the categories' positions to match ids: ids[0]
// becomes 1, ids[1] becomes 2, and so on. One transaction, so a partial order
// is never visible and an unknown id rolls the whole change back.
func (s *Store) ReorderCategories(ids []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("could not start category reorder: %w", err)
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare("UPDATE categories SET sort_order = ? WHERE id = ?")
	if err != nil {
		return fmt.Errorf("could not prepare category reorder: %w", err)
	}
	defer stmt.Close()

	for i, id := range ids {
		res, err := stmt.Exec(i+1, id)
		if err != nil {
			return fmt.Errorf("could not reorder categories: %w", err)
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return fmt.Errorf("no category with id %q", id)
		}
	}
	return tx.Commit()
}

// ListCategoryRules returns every persisted assignment, for the resolver that
// decorates transactions and analytics.
func (s *Store) ListCategoryRules() ([]CategoryRule, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	rows, err := s.db.Query(
		"SELECT kind, key, category_id FROM category_rules ORDER BY kind, key",
	)
	if err != nil {
		return nil, fmt.Errorf("could not list category rules: %w", err)
	}
	defer rows.Close()

	out := make([]CategoryRule, 0, 16)
	for rows.Next() {
		var r CategoryRule
		if err := rows.Scan(&r.Kind, &r.Key, &r.CategoryID); err != nil {
			return nil, fmt.Errorf("could not read category rule: %w", err)
		}
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("could not list category rules: %w", err)
	}
	return out, nil
}

// SetCategoryRule upserts one assignment. An empty CategoryID is meaningful
// for a transaction rule ("automatic for this row"); callers that mean "no
// rule at all" use ClearCategoryRule.
func (s *Store) SetCategoryRule(kind, key, categoryID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	switch kind {
	case RuleTx, RuleCounterparty, RuleType:
	default:
		return fmt.Errorf("unknown category rule kind %q", kind)
	}
	if strings.TrimSpace(key) == "" {
		return fmt.Errorf("category rule key cannot be empty")
	}

	if _, err := s.db.Exec(`
		INSERT INTO category_rules (kind, key, category_id, updated_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(kind, key) DO UPDATE SET
			category_id = excluded.category_id,
			updated_at  = excluded.updated_at`,
		kind, key, categoryID, time.Now().UTC().Format(time.RFC3339Nano),
	); err != nil {
		return fmt.Errorf("could not save category rule: %w", err)
	}
	return nil
}

// ClearCategoryRule removes one assignment. Removing an already-absent rule
// is not an error: the desired state (no rule) is already true.
func (s *Store) ClearCategoryRule(kind, key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, err := s.db.Exec(
		"DELETE FROM category_rules WHERE kind = ? AND key = ?", kind, key,
	); err != nil {
		return fmt.Errorf("could not clear category rule: %w", err)
	}
	return nil
}
