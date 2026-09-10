// Package store persists imported statements as one JSON file in the
// app's data directory. It holds parsed transactions, never PDFs or file
// paths: the parser runs once at import time and the password is never
// written to disk.
package store

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"mpesa-analyzer/internal/parser"
)

// DateRange is the statement's first and last transaction date,
// "2006-01-02". Derived from the transactions themselves, not the PDF
// header, which is unreliable.
type DateRange struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

// StatementRecord is one imported statement and its transactions.
type StatementRecord struct {
	ID         string               `json:"id"`
	Name       string               `json:"name"`
	DateRange  DateRange            `json:"dateRange"`
	TxCount    int                  `json:"txCount"`
	ImportedAt time.Time            `json:"importedAt"`
	Txs        []parser.Transaction `json:"txs"`
}

// StatementMeta is a record without its transactions, for listing.
type StatementMeta struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	DateRange  DateRange `json:"dateRange"`
	TxCount    int       `json:"txCount"`
	ImportedAt time.Time `json:"importedAt"`
}

type fileData struct {
	Statements []StatementRecord `json:"statements"`
}

// Store wraps the statements JSON file. All methods are safe for
// concurrent use.
type Store struct {
	mu   sync.Mutex
	path string
	data fileData
}

// New returns a Store backed by path. The file is read on first use; a
// missing file is an empty store, not an error.
func New(path string) *Store {
	return &Store{path: path}
}

func (s *Store) load() error {
	if s.data.Statements != nil {
		return nil
	}
	s.data.Statements = []StatementRecord{}
	raw, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("could not read statement store: %w", err)
	}
	if err := json.Unmarshal(raw, &s.data); err != nil {
		return fmt.Errorf("could not parse statement store: %w", err)
	}
	return nil
}

// save writes the file atomically: temp file in the same directory, then
// rename over the target.
func (s *Store) save() error {
	raw, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return fmt.Errorf("could not encode statement store: %w", err)
	}
	dir := filepath.Dir(s.path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("could not create data directory: %w", err)
	}
	tmp, err := os.CreateTemp(dir, "statements-*.json")
	if err != nil {
		return fmt.Errorf("could not create temp file: %w", err)
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath) // no-op after a successful rename
	if _, err := tmp.Write(raw); err != nil {
		tmp.Close()
		return fmt.Errorf("could not write temp file: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("could not close temp file: %w", err)
	}
	if err := os.Rename(tmpPath, s.path); err != nil {
		return fmt.Errorf("could not replace statement store: %w", err)
	}
	return nil
}

// List returns every record's metadata, newest import first.
func (s *Store) List() ([]StatementMeta, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.load(); err != nil {
		return nil, err
	}
	out := make([]StatementMeta, 0, len(s.data.Statements))
	for i := len(s.data.Statements) - 1; i >= 0; i-- {
		r := s.data.Statements[i]
		out = append(out, StatementMeta{
			ID:         r.ID,
			Name:       r.Name,
			DateRange:  r.DateRange,
			TxCount:    r.TxCount,
			ImportedAt: r.ImportedAt,
		})
	}
	return out, nil
}

// Get returns one record including its transactions.
func (s *Store) Get(id string) (StatementRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.load(); err != nil {
		return StatementRecord{}, err
	}
	for _, r := range s.data.Statements {
		if r.ID == id {
			return r, nil
		}
	}
	return StatementRecord{}, fmt.Errorf("no statement with id %q", id)
}

// Add appends a record and writes the file immediately.
func (s *Store) Add(rec StatementRecord) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.load(); err != nil {
		return err
	}
	s.data.Statements = append(s.data.Statements, rec)
	return s.save()
}

// Delete removes a record and its transactions, writing the file
// immediately.
func (s *Store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.load(); err != nil {
		return err
	}
	kept := s.data.Statements[:0]
	found := false
	for _, r := range s.data.Statements {
		if r.ID == id {
			found = true
			continue
		}
		kept = append(kept, r)
	}
	if !found {
		return fmt.Errorf("no statement with id %q", id)
	}
	s.data.Statements = kept
	return s.save()
}

// Rename sets a record's name and writes the file immediately.
func (s *Store) Rename(id, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.load(); err != nil {
		return err
	}
	for i := range s.data.Statements {
		if s.data.Statements[i].ID == id {
			s.data.Statements[i].Name = name
			return s.save()
		}
	}
	return fmt.Errorf("no statement with id %q", id)
}

// DateRangeOf returns the min and max transaction dates, "2006-01-02".
// Dates compare correctly as strings in this format.
func DateRangeOf(txs []parser.Transaction) DateRange {
	start, end := "", ""
	for _, tx := range txs {
		if len(tx.Date) < 10 {
			continue
		}
		day := tx.Date[:10]
		if start == "" || day < start {
			start = day
		}
		if end == "" || day > end {
			end = day
		}
	}
	return DateRange{Start: start, End: end}
}

// NameOf renders a date range as a statement name, e.g.
// "Jan 2025 – Sep 2025", or a single month when both dates share one.
func NameOf(r DateRange) string {
	const layout = "2006-01-02"
	start, err := time.Parse(layout, r.Start)
	if err != nil {
		return ""
	}
	end, err := time.Parse(layout, r.End)
	if err != nil {
		return ""
	}
	s, e := start.Format("Jan 2006"), end.Format("Jan 2006")
	if s == e {
		return s
	}
	return s + " – " + e
}

// NewID returns a random 16-byte hex ID.
func NewID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(fmt.Sprintf("crypto/rand failed: %v", err))
	}
	return hex.EncodeToString(b)
}
