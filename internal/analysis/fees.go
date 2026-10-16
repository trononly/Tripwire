package analysis

import (
	"sort"
	"strings"

	"mpesa-analyzer/internal/parser"
)

// FeeTotal aggregates one fee kind for the Insights fee radar. Amount is
// positive cents taken by Safaricom.
type FeeTotal struct {
	Key    string `json:"key"`    // stable key: "fuliza", "transfer", "paybill", "withdrawal", "other"
	Label  string `json:"label"`  // display label: "Fuliza access fee", ...
	Amount int64  `json:"amount"` // cents, positive
	Count  int    `json:"count"`
}

// feeKindOf maps a fee-row description to its breakdown bucket. Only rows
// isFee accepts reach here; anything unrecognized rides under "other"
// rather than being dropped.
func feeKindOf(description string) (key, label string) {
	d := strings.ToLower(description)
	switch {
	case strings.HasPrefix(d, "fuliza access fee"):
		return "fuliza", "Fuliza access fee"
	case strings.HasPrefix(d, "customer transfer of"):
		return "transfer", "Transfer charge"
	case strings.HasPrefix(d, "pay bill charge"):
		return "paybill", "Paybill charge"
	case strings.HasPrefix(d, "withdrawal charge"):
		return "withdrawal", "Withdrawal charge"
	default:
		return "other", "Other charges"
	}
}

// FeesByType splits TotalFees into per-kind totals, largest first. Empty
// (non-nil) when there are no fee rows so the radar can render an honest
// empty state.
func FeesByType(txs []parser.Transaction) []FeeTotal {
	byKey := make(map[string]*FeeTotal)
	for _, tx := range txs {
		if !isFee(tx.Description) {
			continue
		}
		amount := -tx.Amount
		if amount < 0 {
			amount = 0
		}
		key, label := feeKindOf(tx.Description)
		f, ok := byKey[key]
		if !ok {
			f = &FeeTotal{Key: key, Label: label}
			byKey[key] = f
		}
		f.Amount += amount
		f.Count++
	}
	out := make([]FeeTotal, 0, len(byKey))
	for _, f := range byKey {
		out = append(out, *f)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Amount != out[j].Amount {
			return out[i].Amount > out[j].Amount
		}
		return out[i].Key < out[j].Key
	})
	if out == nil {
		out = []FeeTotal{}
	}
	return out
}

// FulizaOutstanding estimates the current Fuliza debt (positive cents) from
// SMS-derived rows: the debt ledger's end state after walking the dataset
// chronologically. The latest stated outstanding overwrites (principal plus
// access fees included - Safaricom already adds the fee, so the fee row's
// Amount is never added on top); later repayments reduce it and a full
// repayment zeroes it. Clamped at zero: without a fresh outstanding
// statement the debt can only be an estimate, and daily charges may add on
// top. Returns 0 when no disbursement exists.
func FulizaOutstanding(txs []parser.Transaction) int64 {
	pts := Ledger(txs)
	if len(pts) == 0 {
		return 0
	}
	return pts[len(pts)-1].Debt
}
