package analysis

import (
	"sort"

	"mpesa-analyzer/internal/counterparty"
	"mpesa-analyzer/internal/parser"
	"mpesa-analyzer/internal/txtype"
)

// CategoryOf maps a description to a category display name (the labels
// the donut chart and category filter aggregate under). Same deterministic
// classification as TypeOf; only the presentation differs. The
// implementation lives in internal/txtype (shared with the recurring-
// payment detector); this wrapper keeps the analysis package's public
// surface stable.
func CategoryOf(description string) string {
	return txtype.CategoryOf(description)
}

// Categorize returns totals per category, sorted by volume descending.
// Amounts are signed cents; each category total is the sum of signed
// amounts (outflows negative).
func Categorize(transactions []parser.Transaction) []CategoryTotal {
	totals := make(map[string]*CategoryTotal)

	for _, tx := range transactions {
		cat := CategoryOf(tx.Description)
		c, ok := totals[cat]
		if !ok {
			c = &CategoryTotal{Name: cat}
			totals[cat] = c
		}
		c.Amount += tx.Amount
		c.Count++
	}

	out := make([]CategoryTotal, 0, len(totals))
	var abs int64
	for _, c := range totals {
		out = append(out, *c)
		a := c.Amount
		if a < 0 {
			a = -a
		}
		abs += a
	}
	for i := range out {
		if abs > 0 {
			a := out[i].Amount
			if a < 0 {
				a = -a
			}
			out[i].Percent = float64(a) / float64(abs) * 100
		}
	}
	sort.Slice(out, func(i, j int) bool { return absOf(out[i].Amount) > absOf(out[j].Amount) })
	return out
}

func absOf(n int64) int64 {
	if n < 0 {
		return -n
	}
	return n
}

// CategoryTotal aggregates one category.
type CategoryTotal struct {
	Name    string  `json:"name"`
	Amount  int64   `json:"amount"` // signed cents
	Count   int     `json:"count"`
	Percent float64 `json:"percent"`
}

// Counterparty is an aggregated person/business the user transacted with.
type Counterparty struct {
	Name   string `json:"name"`
	Count  int    `json:"count"`
	Amount int64  `json:"amount"` // signed cents, sum of signed amounts
	In     int64  `json:"in"`     // cents, positive sum of money received
	Out    int64  `json:"out"`    // cents, positive sum of money sent
}

// CounterpartyOf extracts the counterparty name from a description.
// The implementation lives in internal/counterparty (shared with the
// recurring-payment detector); this wrapper keeps the analysis package's
// public surface stable.
func CounterpartyOf(description string) string {
	return counterparty.CounterpartyOf(description)
}

// TopCounterparties returns the n counterparties by transaction count.
// Entries with empty names are skipped.
func TopCounterparties(transactions []parser.Transaction, n int) []Counterparty {
	if n <= 0 {
		return nil
	}
	index := make(map[string]*Counterparty)
	for _, tx := range transactions {
		name := CounterpartyOf(tx.Description)
		if name == "" {
			continue
		}
		c, ok := index[name]
		if !ok {
			c = &Counterparty{Name: name}
			index[name] = c
		}
		c.Count++
		c.Amount += tx.Amount
		if tx.Amount < 0 {
			c.Out += -tx.Amount
		} else {
			c.In += tx.Amount
		}
	}
	out := make([]Counterparty, 0, len(index))
	for _, c := range index {
		out = append(out, *c)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Count > out[j].Count })
	if len(out) > n {
		out = out[:n]
	}
	return out
}

// TypeOf classifies a description into its semantic transaction type. The
// implementation lives in internal/txtype (shared with the recurring-
// payment detector); this wrapper keeps the analysis package's public
// surface stable.
func TypeOf(description string) txtype.TransactionType {
	return txtype.TypeOf(description)
}
