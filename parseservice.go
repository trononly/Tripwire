package main

import (
	"mpesa-analyzer/internal/analysis"
	"mpesa-analyzer/internal/parser"
	"mpesa-analyzer/internal/pdf"
	"fmt"
	"sort"
	"strings"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type ParseService struct{}

// TransactionView is a single prepared row for the frontend transaction
// list: pre-categorized so the UI never re-runs classification.
type TransactionView struct {
	ID          string `json:"id"`
	Date        string `json:"date"`
	Description string `json:"description"`
	Status      string `json:"status"`
	Amount      int64  `json:"amount"`
	Balance     int64  `json:"balance"`
	Category    string `json:"category"`
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
			ID:          tx.ID,
			Date:        tx.Date,
			Description: tx.Description,
			Status:      tx.Status,
			Amount:      tx.Amount,
			Balance:     tx.Balance,
			Category:    analysis.CategoryOf(tx.Description),
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

// GetRecurringPayments detects recurring payments and returns enriched,
// searched and sorted view models in one call. The frontend passes the
// current search term and sort choice; all detection, averaging and
// sorting happen here.
//
// search: case-insensitive match on label or category ("" = all).
// sortBy: "amount" | "frequency"; anything else = MonthlyImpact desc.
func (p *ParseService) GetRecurringPayments(txs []parser.Transaction, search, sortBy string) []analysis.RecurringView {
	views := analysis.RecurringDetailed(txs, 3)

	if q := strings.ToLower(strings.TrimSpace(search)); q != "" {
		filtered := make([]analysis.RecurringView, 0, len(views))
		for _, v := range views {
			if strings.Contains(strings.ToLower(v.Label), q) ||
				strings.Contains(strings.ToLower(v.Category), q) {
				filtered = append(filtered, v)
			}
		}
		views = filtered
	}

	analysis.SortRecurringViews(views, sortBy)
	if views == nil {
		views = []analysis.RecurringView{}
	}
	return views
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
