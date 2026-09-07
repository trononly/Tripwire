package main

import (
	"mpesa-analyzer/internal/analysis"
	"mpesa-analyzer/internal/parser"
	"mpesa-analyzer/internal/pdf"
	"fmt"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type ParseService struct{}

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
