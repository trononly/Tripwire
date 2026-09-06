package main

import (
	"context"
	"fmt"
	"mpesa-analyzer/internal/parser"
	"mpesa-analyzer/internal/pdf"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) ParsePDF(filePath, password string) ([]parser.Transaction, error) {
	unparsedPdf, err := pdf.ReadPDF(filePath, password)
	if err != nil {
		return nil, fmt.Errorf("Failed to read PDF: %w", err)
	}
	txs, err := parser.ParseTX(unparsedPdf)
	if err != nil {
		return nil, fmt.Errorf("Failed to parse transactions: %w", err)
	}
	return txs, nil
}

func (a *App) PickFile() (string, error) {
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select a PDF file",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "Select an M-Pesa Statement",
				Pattern:     "*.pdf",
			},
		},
	})
}
