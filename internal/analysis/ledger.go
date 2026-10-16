package analysis

import (
	"sort"
	"strings"

	"mpesa-analyzer/internal/parser"
)

// Fuliza description prefixes emitted by internal/sms (exact case). Only
// the SMS importer produces these rows; PDF statements never carry them,
// so the ledger walk below leaves statement datasets untouched.
const (
	fulizaFeePrefix       = "Fuliza Access Fee"
	fulizaRepayPrefix     = "Fuliza Repayment"
	fulizaRepayFullPrefix = "Fuliza Repayment - Fully Paid"
)

func isFulizaFeeRow(description string) bool {
	return strings.HasPrefix(description, fulizaFeePrefix)
}

func isFulizaRepayRow(description string) bool {
	return strings.HasPrefix(description, fulizaRepayPrefix)
}

func isFulizaFullRepay(description string) bool {
	return strings.HasPrefix(description, fulizaRepayFullPrefix)
}

// LedgerPoint is one transaction's net M-Pesa position after applying it:
// wallet cash minus Fuliza debt. Wallet and debt are separate Safaricom
// ledgers sharing one Balance column on the wire (fee rows carry the debt
// as a negated outstanding, every other row carries the wallet balance),
// so any display of "the balance" must derive it from both.
type LedgerPoint struct {
	ID     string
	Date   string
	Wallet int64 // wallet cash, positive cents
	Debt   int64 // Fuliza debt, positive cents
	Net    int64 // Wallet - Debt
}

// Ledger walks transactions chronologically (date ascending; same-second
// ties by ID ascending so a paired base row precedes its "-F"/"-C" row,
// matching received order) tracking wallet cash and Fuliza debt:
//
//   - Fuliza fee rows overwrite the debt with the stated outstanding
//     (Safaricom already folds principal plus access fee into it, so the
//     fee Amount is never added on top). A non-negative balance is not a
//     stated debt and is ignored.
//   - Repayment rows update the wallet from their balance line and reduce
//     the debt by the paid amount; a full repayment zeroes it. Clamped at
//     zero: repayments against a debt from before the dataset (partial
//     history) carry no observable balance.
//   - Every other row updates the wallet from its balance line.
//
// Without Fuliza rows the debt stays zero and Net equals each row's
// Balance, so non-Fuliza datasets behave exactly as before.
func Ledger(txs []parser.Transaction) []LedgerPoint {
	sorted := make([]parser.Transaction, len(txs))
	copy(sorted, txs)
	sort.SliceStable(sorted, func(i, j int) bool {
		if sorted[i].Date != sorted[j].Date {
			return sorted[i].Date < sorted[j].Date
		}
		return sorted[i].ID < sorted[j].ID
	})

	var wallet, debt int64
	out := make([]LedgerPoint, 0, len(sorted))
	for _, tx := range sorted {
		switch {
		case isFulizaFeeRow(tx.Description):
			if tx.Balance < 0 {
				debt = -tx.Balance
			}
		case isFulizaRepayRow(tx.Description):
			wallet = tx.Balance
			if isFulizaFullRepay(tx.Description) {
				debt = 0
			} else if tx.Amount < 0 {
				debt += tx.Amount // Amount is negative: repays reduce debt
				if debt < 0 {
					debt = 0
				}
			}
		default:
			wallet = tx.Balance
		}
		out = append(out, LedgerPoint{
			ID:     tx.ID,
			Date:   tx.Date,
			Wallet: wallet,
			Debt:   debt,
			Net:    wallet - debt,
		})
	}
	return out
}

// DayLedger folds the ledger walk into per-day end states: net position
// and debt owed after each day's latest transaction. Day keys are
// "2006-01-02" ("" when a date is too short to hold one, mirroring the
// grouping code). Days without Fuliza activity carry zero debt, so their
// net equals the last wallet balance as before.
func DayLedger(txs []parser.Transaction) (net, owed map[string]int64) {
	net = make(map[string]int64)
	owed = make(map[string]int64)
	for _, p := range Ledger(txs) {
		day := ""
		if len(p.Date) >= 10 {
			day = p.Date[:10]
		}
		net[day] = p.Net
		owed[day] = p.Debt
	}
	return net, owed
}
