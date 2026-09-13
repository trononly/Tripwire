package main

import (
	"fmt"
	"log"
	"mpesa-analyzer/internal/analysis"
	"mpesa-analyzer/internal/parser"
	"mpesa-analyzer/internal/pdf"
	"mpesa-analyzer/internal/store"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type ParseService struct {
	mu       sync.Mutex
	store    *store.Store
	activeID string
}

// statements lazily creates the store the first time a history method
// runs. The file lives in an app-private directory: getFilesDir() on
// Android (via the Wails bridge — xdg has no Android support and $HOME is
// unset there, which resolves to a read-only /.local), the xdg data home
// on desktop.
func (p *ParseService) statements() (*store.Store, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.store == nil {
		base := application.Mobile.StoragePath()
		if base == "" {
			if runtime.GOOS == "android" {
				log.Println("statement store: Android storage path unavailable (bridge not ready?), falling back to xdg data home")
			}
			base = application.Path(application.PathDataHome)
		}
		p.store = store.New(filepath.Join(base, "mpesa-analyzer", "statements.json"))
	}
	return p.store, nil
}

// TransactionView is a single prepared row for the frontend transaction
// list: type, category and counterparty are pre-classified here so the UI
// never re-runs classification and never infers semantics from an amount's
// sign or a name.
type TransactionView struct {
	ID           string `json:"id"`
	Date         string `json:"date"`
	Description  string `json:"description"`
	Status       string `json:"status"`
	Amount       int64  `json:"amount"`
	Balance      int64  `json:"balance"`
	Category     string `json:"category"`
	Type         string `json:"type"`
	Counterparty string `json:"counterparty"`
}

// DayGroup is one calendar day of transactions, newest first. EndBalance is
// the running balance after the day's latest transaction (true end-of-day
// value, independent of any frontend filtering).
type DayGroup struct {
	DayKey     string            `json:"dayKey"` // "2006-01-02"
	EndBalance int64             `json:"endBalance"`
	Txs        []TransactionView `json:"txs"`
}

// TransactionGroups prepares the frontend's transaction list in one call:
// sorts newest-first, categorizes, and groups by calendar day. Sorting and
// grouping run here (once per dataset) instead of in JS on every render.
func (p *ParseService) TransactionGroups(txs []parser.Transaction) []DayGroup {
	sorted := make([]parser.Transaction, len(txs))
	copy(sorted, txs)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Date > sorted[j].Date })

	out := make([]DayGroup, 0, 16)
	for _, tx := range sorted {
		var day string
		if len(tx.Date) >= 10 {
			day = tx.Date[:10]
		}
		if len(out) == 0 || out[len(out)-1].DayKey != day {
			out = append(out, DayGroup{
				DayKey:     day,
				EndBalance: tx.Balance, // first row in desc order = day's latest tx
				Txs:        []TransactionView{},
			})
		}
		g := &out[len(out)-1]
		g.Txs = append(g.Txs, TransactionView{
			ID:           tx.ID,
			Date:         tx.Date,
			Description:  tx.Description,
			Status:       tx.Status,
			Amount:       tx.Amount,
			Balance:      tx.Balance,
			Category:     analysis.CategoryOf(tx.Description),
			Type:         string(analysis.TypeOf(tx.Description)),
			Counterparty: analysis.CounterpartyOf(tx.Description),
		})
	}
	return out
}

func (p *ParseService) ParsePDF(filePath, password string) ([]parser.Transaction, error) {
	// Table-based extraction (gopdf): reads the statement's transaction
	// table directly instead of regexing flattened text.
	txs, err := pdf.ReadPDFTX(filePath, password)
	if err != nil {
		return nil, fmt.Errorf("Failed to parse transactions: %w", err)
	}
	return txs, nil
}

// AnalyzeTransactions computes all dashboard analytics for the given
// transactions in a single call.
func (p *ParseService) AnalyzeTransactions(txs []parser.Transaction) (*analysis.AnalysisResult, error) {
	result, err := analysis.Analyze(txs)
	if err != nil {
		return nil, fmt.Errorf("Failed to analyze transactions: %w", err)
	}
	return result, nil
}

// TransactionCategories maps each transaction ID to its category so the
// transactions table can filter by category.
func (p *ParseService) TransactionCategories(txs []parser.Transaction) map[string]string {
	out := make(map[string]string, len(txs))
	for _, tx := range txs {
		out[tx.ID] = analysis.CategoryOf(tx.Description)
	}
	return out
}

func (p *ParseService) PickFile() (string, error) {
	return application.Get().Dialog.OpenFileWithOptions(&application.OpenFileDialogOptions{
		Title:          "Select a PDF file",
		CanChooseFiles: true,
		Filters: []application.FileFilter{
			{
				DisplayName: "Select an M-Pesa Statement",
				Pattern:     "*.pdf",
			},
		},
	}).PromptForSingleSelection()
}

// ImportStatement parses a PDF, stores the transactions under the given
// name (derived from the date range when the name is blank), activates
// the new record, and returns it with its transactions.
func (p *ParseService) ImportStatement(filePath, password, name string) (*store.StatementRecord, error) {
	txs, err := pdf.ReadPDFTX(filePath, password)
	if err != nil {
		return nil, fmt.Errorf("Failed to parse transactions: %w", err)
	}
	rangeOf := store.DateRangeOf(txs)
	name = strings.TrimSpace(name)
	if name == "" {
		name = store.NameOf(rangeOf)
	}
	rec := store.StatementRecord{
		ID:         store.NewID(),
		Name:       name,
		DateRange:  rangeOf,
		TxCount:    len(txs),
		ImportedAt: time.Now().UTC(),
		Txs:        txs,
	}

	s, err := p.statements()
	if err != nil {
		return nil, err
	}
	if err := s.Add(rec); err != nil {
		return nil, err
	}

	p.mu.Lock()
	p.activeID = rec.ID
	p.mu.Unlock()
	return &rec, nil
}

// ListStatements returns the stored statements' metadata, newest import
// first.
func (p *ParseService) ListStatements() ([]store.StatementMeta, error) {
	s, err := p.statements()
	if err != nil {
		return nil, err
	}
	return s.List()
}

// ActivateStatement loads one stored statement's transactions and makes
// it the active one for this session.
func (p *ParseService) ActivateStatement(id string) ([]parser.Transaction, error) {
	s, err := p.statements()
	if err != nil {
		return nil, err
	}
	rec, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	p.mu.Lock()
	p.activeID = rec.ID
	p.mu.Unlock()
	return rec.Txs, nil
}

// DeleteStatement removes a stored statement and its transactions. If it
// was the active one, nothing is active afterwards.
func (p *ParseService) DeleteStatement(id string) error {
	s, err := p.statements()
	if err != nil {
		return err
	}
	if err := s.Delete(id); err != nil {
		return err
	}
	p.mu.Lock()
	if p.activeID == id {
		p.activeID = ""
	}
	p.mu.Unlock()
	return nil
}

// RenameStatement sets a new name for a stored statement.
func (p *ParseService) RenameStatement(id, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("statement name cannot be empty")
	}
	s, err := p.statements()
	if err != nil {
		return err
	}
	return s.Rename(id, name)
}
