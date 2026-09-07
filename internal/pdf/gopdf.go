package pdf

import (
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/razvandimescu/gopdf/pdf"

	"mpesa-analyzer/internal/parser"
)

// Column headers of the M-Pesa "DETAILED STATEMENT" transaction table.
var mpesaHeaders = []string{
	"Receipt No.", "Completion Time", "Details", "Transaction Status",
	"Paid In", "Withdrawn", "Balance",
}

var (
	datetimeRE = regexp.MustCompile(`^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$`)
	// Rows belonging to the statement footer (disclaimer, verification code,
	// page numbers) must never be merged into a transaction description.
	footerRE = regexp.MustCompile(
		`(?i)disclaimer|statement verification code|verify the validity|prompts to enter|^page \d+ of \d+$`)
)

// openDocument opens a PDF, prompting with password only if it is encrypted.
func openDocument(path, password string) (*pdf.Document, error) {
	doc, err := pdf.OpenFile(path)
	if errors.Is(err, pdf.ErrEncrypted) {
		doc, err = pdf.OpenFile(path, pdf.WithPassword(password))
		if errors.Is(err, pdf.ErrWrongPassword) {
			return nil, fmt.Errorf("invalid PIN")
		}
	}
	return doc, err
}

// ReadPDFTX extracts M-Pesa transactions directly from the statement's
// transaction table (gopdf implementation, no regex over flattened text).
//
// It locates the table by its header anchors across all pages, then merges
// wrapped description lines into their parent transaction. Paid In and
// Withdrawn are read as separate columns; Withdrawn values are already
// signed negative in the statement, so Amount = PaidIn + Withdrawn.
func ReadPDFTX(path, password string) ([]parser.Transaction, error) {
	doc, err := openDocument(path, password)
	if err != nil {
		return nil, err
	}

	pages := make([][]pdf.TextSpan, 0, doc.NumPages())
	for i := 0; i < doc.NumPages(); i++ {
		spans, err := doc.Page(i).TextSpans()
		if err != nil {
			return nil, fmt.Errorf("page %d: %w", i+1, err)
		}
		pages = append(pages, spans)
	}

	tbl := pdf.FindTableAcrossPages(pages, &pdf.TableOpts{Headers: mpesaHeaders})

	col := make(map[string]int, len(tbl.Columns))
	for i, c := range tbl.Columns {
		col[strings.TrimSpace(c.Name)] = i
	}

	txs := make([]parser.Transaction, 0, len(tbl.Rows))
	footerSeen := false

	for _, row := range tbl.Rows {
		cells := make([]string, len(tbl.Columns))
		for _, c := range row.Cells {
			if c.Column >= 0 && c.Column < len(cells) {
				cells[c.Column] = c.Text
			}
		}
		get := func(name string) string {
			if i, ok := col[name]; ok && i < len(cells) {
				return strings.TrimSpace(cells[i])
			}
			return ""
		}

		switch {
		case datetimeRE.MatchString(get("Completion Time")):
			// A real transaction row.
			amount, err := sumMoney(get("Paid In"), get("Withdrawn"))
			if err != nil {
				return nil, fmt.Errorf("row %q: %w", get("Receipt No."), err)
			}
			balance, err := parser.ParseMoney(get("Balance"))
			if err != nil {
				return nil, fmt.Errorf("row %q: %w", get("Receipt No."), err)
			}
			txs = append(txs, parser.Transaction{
				ID:          get("Receipt No."),
				Date:        get("Completion Time"),
				Description: get("Details"),
				Status:      get("Transaction Status"),
				Amount:      amount,
				Balance:     balance,
			})
			footerSeen = false

		case isFooterRow(cells):
			footerSeen = true

		case get("Details") != "" && len(txs) > 0 && !footerSeen:
			// Wrapped continuation of the previous transaction's Details cell.
			txs[len(txs)-1].Description += " " + get("Details")
		}
	}

	return txs, nil
}

func isFooterRow(cells []string) bool {
	for _, c := range cells {
		if footerRE.MatchString(strings.TrimSpace(c)) {
			return true
		}
	}
	return false
}

// sumMoney adds money strings; empty strings count as zero. Withdrawn values
// in M-Pesa statements are already negative ("-50.00").
func sumMoney(vals ...string) (int64, error) {
	var total int64
	for _, v := range vals {
		if v == "" {
			continue
		}
		n, err := parser.ParseMoney(v)
		if err != nil {
			return 0, err
		}
		total += n
	}
	return total, nil
}
