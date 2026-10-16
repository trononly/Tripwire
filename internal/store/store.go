// Package store persists imported datasets - parsed PDF statements and
// confirmed Android SMS imports - in a single SQLite database in the app's
// data directory. It holds parsed transactions, never PDFs or file paths: the
// parser runs once at import time and the password is never written to disk.
//
// The store is deliberately pure Go (modernc.org/sqlite) so the same code
// compiles for desktop and Android with CGO disabled.
package store

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"

	"mpesa-analyzer/internal/parser"
)

// DateRange is the statement's first and last transaction date,
// "2006-01-02". Derived from the transactions themselves, not the PDF
// header, which is unreliable.
type DateRange struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

// Record source kinds. Empty Source (older store files) is a statement:
// SMS imports are the only other kind.
const (
	SourceStatement = "statement"
	SourceSms       = "sms"
)

// StatementRecord is one imported dataset - a parsed PDF statement or a
// confirmed SMS import - and its transactions. Both kinds share the same
// normalized transaction model and the same analysis pipeline; Source only
// records where the rows came from.
//
// SimID/SimLabel identify the SIM an SMS record belongs to (empty for
// statements). SMS imports are stored one record per SIM so each wallet
// keeps its own balance series; the two fields are what lets the UI switch
// between them.
type StatementRecord struct {
	ID         string               `json:"id"`
	Name       string               `json:"name"`
	Source     string               `json:"source,omitempty"`
	SimID      string               `json:"simId,omitempty"`
	SimLabel   string               `json:"simLabel,omitempty"`
	DateRange  DateRange            `json:"dateRange"`
	TxCount    int                  `json:"txCount"`
	ImportedAt time.Time            `json:"importedAt"`
	Txs        []parser.Transaction `json:"txs"`
}

// StatementMeta is a record without its transactions, for listing.
type StatementMeta struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	Source     string    `json:"source,omitempty"`
	SimID      string    `json:"simId,omitempty"`
	SimLabel   string    `json:"simLabel,omitempty"`
	DateRange  DateRange `json:"dateRange"`
	TxCount    int       `json:"txCount"`
	ImportedAt time.Time `json:"importedAt"`
}

// schema is applied on every open; every statement is idempotent.
const schema = `
CREATE TABLE IF NOT EXISTS statements (
	id          TEXT PRIMARY KEY,
	name        TEXT NOT NULL,
	source      TEXT NOT NULL DEFAULT 'statement',
	sim_id      TEXT NOT NULL DEFAULT '',
	sim_label   TEXT NOT NULL DEFAULT '',
	start_date  TEXT NOT NULL DEFAULT '',
	end_date    TEXT NOT NULL DEFAULT '',
	tx_count    INTEGER NOT NULL DEFAULT 0,
	imported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
	statement_id TEXT NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
	seq          INTEGER NOT NULL,
	id           TEXT NOT NULL,
	date         TEXT NOT NULL,
	description  TEXT NOT NULL,
	status       TEXT NOT NULL,
	amount       INTEGER NOT NULL,
	balance      INTEGER NOT NULL,
	PRIMARY KEY (statement_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_statements_source_imported
	ON statements (source, imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_statement_date
	ON transactions (statement_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_receipt
	ON transactions (id);
`

// Store wraps the SQLite database.
type Store struct {
	mu sync.Mutex
	db *sql.DB
}

// New opens (creating if needed) the store at path. A missing file is an
// empty store, not an error. If a legacy `*.json` store sits next to the
// database, it is imported once and archived.
func New(path string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, fmt.Errorf("could not create data directory: %w", err)
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("could not open statement store: %w", err)
	}
	// One pooled connection: the store is single-process and small, and this
	// serializes writers so there is never a SQLITE_BUSY retry loop.
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	// PRAGMAs are per-connection; with a single pooled connection setting
	// them here persists for the process lifetime.
	for _, pragma := range []string{
		"PRAGMA busy_timeout = 5000",
		"PRAGMA journal_mode = WAL",
		"PRAGMA foreign_keys = ON",
	} {
		if _, err := db.Exec(pragma); err != nil {
			db.Close()
			return nil, fmt.Errorf("could not configure statement store: %w", err)
		}
	}
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, fmt.Errorf("could not initialize statement store: %w", err)
	}
	// Databases written before SMS records carried a SIM lack these columns;
	// CREATE TABLE IF NOT EXISTS never adds them, so backfill idempotently.
	for _, stmt := range []string{
		`ALTER TABLE statements ADD COLUMN sim_id TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE statements ADD COLUMN sim_label TEXT NOT NULL DEFAULT ''`,
	} {
		if _, err := db.Exec(stmt); err != nil && !strings.Contains(err.Error(), "duplicate column") {
			db.Close()
			return nil, fmt.Errorf("could not migrate statement store: %w", err)
		}
	}

	s := &Store{db: db}
	if err := s.migrateLegacyJSON(path); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

// Close releases the database handle.
func (s *Store) Close() error {
	return s.db.Close()
}

// normalizeSource maps the empty legacy source to a statement.
func normalizeSource(src string) string {
	if src == "" {
		return SourceStatement
	}
	return src
}

// count returns how many records are stored.
func (s *Store) count() (int, error) {
	var n int
	err := s.db.QueryRow("SELECT COUNT(*) FROM statements").Scan(&n)
	return n, err
}

// migrateLegacyJSON imports the pre-SQLite `statements.json` file (if present
// and the database is empty) and archives it. The JSON schema is exactly
// StatementRecord, so it round-trips unchanged.
func (s *Store) migrateLegacyJSON(dbPath string) error {
	legacy := dbPath[:len(dbPath)-len(filepath.Ext(dbPath))] + ".json"
	raw, err := os.ReadFile(legacy)
	if err != nil {
		return nil // no legacy store: nothing to do
	}
	if n, err := s.count(); err != nil {
		return err
	} else if n > 0 {
		return nil // database already has data; leave the file alone
	}
	var data struct {
		Statements []StatementRecord `json:"statements"`
	}
	if err := json.Unmarshal(raw, &data); err != nil {
		return fmt.Errorf("could not parse legacy statement store: %w", err)
	}
	for _, rec := range data.Statements {
		if err := s.Add(rec); err != nil {
			return fmt.Errorf("could not migrate legacy statement %q: %w", rec.ID, err)
		}
	}
	// Archive rather than delete: migration should never destroy the old copy.
	if err := os.Rename(legacy, legacy+".migrated"); err != nil {
		return fmt.Errorf("could not archive legacy store: %w", err)
	}
	return nil
}

// List returns every record's metadata, newest import first.
func (s *Store) List() ([]StatementMeta, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	rows, err := s.db.Query(`
		SELECT id, name, source, sim_id, sim_label, start_date, end_date, tx_count, imported_at
		FROM statements
		ORDER BY imported_at DESC, rowid DESC`)
	if err != nil {
		return nil, fmt.Errorf("could not list statements: %w", err)
	}
	defer rows.Close()

	out := make([]StatementMeta, 0, 8)
	for rows.Next() {
		var (
			m        StatementMeta
			imported string
		)
		if err := rows.Scan(&m.ID, &m.Name, &m.Source, &m.SimID, &m.SimLabel,
			&m.DateRange.Start, &m.DateRange.End, &m.TxCount, &imported); err != nil {
			return nil, fmt.Errorf("could not read statement: %w", err)
		}
		m.Source = normalizeSource(m.Source)
		m.ImportedAt = parseTime(imported)
		out = append(out, m)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("could not list statements: %w", err)
	}
	return out, nil
}

// Get returns one record including its transactions.
func (s *Store) Get(id string) (StatementRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.get(id)
}

// get is the lock-free body of Get, shared by locked callers.
func (s *Store) get(id string) (StatementRecord, error) {
	var (
		rec      StatementRecord
		imported string
	)
	err := s.db.QueryRow(`
		SELECT id, name, source, sim_id, sim_label, start_date, end_date, tx_count, imported_at
		FROM statements WHERE id = ?`, id).
		Scan(&rec.ID, &rec.Name, &rec.Source, &rec.SimID, &rec.SimLabel,
			&rec.DateRange.Start, &rec.DateRange.End, &rec.TxCount, &imported)
	if errors.Is(err, sql.ErrNoRows) {
		return StatementRecord{}, fmt.Errorf("no statement with id %q", id)
	}
	if err != nil {
		return StatementRecord{}, fmt.Errorf("could not read statement: %w", err)
	}
	rec.Source = normalizeSource(rec.Source)
	rec.ImportedAt = parseTime(imported)

	txs, err := s.transactions(id)
	if err != nil {
		return StatementRecord{}, err
	}
	rec.Txs = txs
	return rec, nil
}

// transactions returns a record's transactions in insertion order.
func (s *Store) transactions(id string) ([]parser.Transaction, error) {
	rows, err := s.db.Query(`
		SELECT id, date, description, status, amount, balance
		FROM transactions WHERE statement_id = ? ORDER BY seq ASC`, id)
	if err != nil {
		return nil, fmt.Errorf("could not read transactions: %w", err)
	}
	defer rows.Close()

	out := make([]parser.Transaction, 0, 64)
	for rows.Next() {
		var tx parser.Transaction
		if err := rows.Scan(&tx.ID, &tx.Date, &tx.Description, &tx.Status,
			&tx.Amount, &tx.Balance); err != nil {
			return nil, fmt.Errorf("could not read transaction: %w", err)
		}
		out = append(out, tx)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("could not read transactions: %w", err)
	}
	return out, nil
}

// Add stores a record and its transactions, writing immediately. IDs are
// random per import, so in practice this always inserts; a repeated Add of
// the same ID replaces its rows atomically rather than duplicating them.
func (s *Store) Add(rec StatementRecord) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.write(rec)
}

func (s *Store) write(rec StatementRecord) error {
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("could not start store write: %w", err)
	}
	defer tx.Rollback()

	// Replace semantics: drop the old rows so a re-write is self-consistent.
	if _, err := tx.Exec("DELETE FROM transactions WHERE statement_id = ?", rec.ID); err != nil {
		return fmt.Errorf("could not replace transactions: %w", err)
	}
	if err := upsertStatement(tx, rec); err != nil {
		return err
	}
	if err := insertTransactions(tx, rec.ID, rec.Txs, 0); err != nil {
		return err
	}
	return tx.Commit()
}

// AppendFresh adds only fresh transactions to an existing record and updates
// its metadata, leaving the already-stored rows untouched. This is the SMS
// refresh path's write: a growing feed appends incrementally instead of
// rewriting its whole history on every merge.
func (s *Store) AppendFresh(rec StatementRecord, fresh []parser.Transaction) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("could not start store write: %w", err)
	}
	defer tx.Rollback()

	var maxSeq sql.NullInt64
	if err := tx.QueryRow(
		"SELECT MAX(seq) FROM transactions WHERE statement_id = ?", rec.ID,
	).Scan(&maxSeq); err != nil {
		return fmt.Errorf("could not read transaction sequence: %w", err)
	}
	start := 0
	if maxSeq.Valid {
		start = int(maxSeq.Int64) + 1
	}
	if err := insertTransactions(tx, rec.ID, fresh, start); err != nil {
		return err
	}
	if err := upsertStatement(tx, rec); err != nil {
		return err
	}
	return tx.Commit()
}

// Delete removes a record and its transactions (cascade), writing immediately.
func (s *Store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	res, err := s.db.Exec("DELETE FROM statements WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("could not delete statement: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("no statement with id %q", id)
	}
	return nil
}

// Rename sets a record's name, writing immediately.
func (s *Store) Rename(id, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	res, err := s.db.Exec("UPDATE statements SET name = ? WHERE id = ?", name, id)
	if err != nil {
		return fmt.Errorf("could not rename statement: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("no statement with id %q", id)
	}
	return nil
}

// SetSimLabel sets a record's SIM display name, writing immediately. Used
// to upgrade a wallet's fallback name ("SIM 1") once the bridge can
// resolve the carrier name; transactions are untouched.
func (s *Store) SetSimLabel(id, label string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	res, err := s.db.Exec("UPDATE statements SET sim_label = ? WHERE id = ?", label, id)
	if err != nil {
		return fmt.Errorf("could not set SIM label: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("no statement with id %q", id)
	}
	return nil
}

// SetSimID moves a record to another SIM key, writing immediately. Used
// when a wallet imported by subscription id later resolves to a slot:
// without the move, post-grant imports would open a second record for the
// same physical SIM. Only called when no record already claims the key.
func (s *Store) SetSimID(id, simID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	res, err := s.db.Exec("UPDATE statements SET sim_id = ? WHERE id = ?", simID, id)
	if err != nil {
		return fmt.Errorf("could not set SIM id: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("no statement with id %q", id)
	}
	return nil
}

// upsertStatement writes a record's metadata row without touching its
// transactions.
func upsertStatement(tx *sql.Tx, rec StatementRecord) error {
	_, err := tx.Exec(`
		INSERT INTO statements
			(id, name, source, sim_id, sim_label, start_date, end_date, tx_count, imported_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name        = excluded.name,
			source      = excluded.source,
			sim_id      = excluded.sim_id,
			sim_label   = excluded.sim_label,
			start_date  = excluded.start_date,
			end_date    = excluded.end_date,
			tx_count    = excluded.tx_count,
			imported_at = excluded.imported_at`,
		rec.ID, rec.Name, normalizeSource(rec.Source), rec.SimID, rec.SimLabel,
		rec.DateRange.Start, rec.DateRange.End, rec.TxCount,
		rec.ImportedAt.UTC().Format(time.RFC3339Nano),
	)
	if err != nil {
		return fmt.Errorf("could not write statement: %w", err)
	}
	return nil
}

// insertTransactions appends transactions at seq startSeq, startSeq+1, ...
func insertTransactions(tx *sql.Tx, statementID string, txs []parser.Transaction, startSeq int) error {
	if len(txs) == 0 {
		return nil
	}
	stmt, err := tx.Prepare(`
		INSERT INTO transactions
			(statement_id, seq, id, date, description, status, amount, balance)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return fmt.Errorf("could not prepare transactions: %w", err)
	}
	defer stmt.Close()

	for i, t := range txs {
		if _, err := stmt.Exec(statementID, startSeq+i, t.ID, t.Date,
			t.Description, t.Status, t.Amount, t.Balance); err != nil {
			return fmt.Errorf("could not write transaction %q: %w", t.ID, err)
		}
	}
	return nil
}

// parseTime reads a stored RFC3339Nano timestamp, tolerating zero values.
func parseTime(s string) time.Time {
	t, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		return time.Time{}
	}
	return t
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
