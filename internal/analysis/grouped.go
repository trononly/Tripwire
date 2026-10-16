package analysis

import (
	"sort"
	"strings"
	"time"

	"mpesa-analyzer/internal/parser"
)

// TransactionFilter is the set of list filters the frontend sends. All
// filtering happens here, in Go, so the UI never re-derives grouping,
// categories or totals from raw rows.
type TransactionFilter struct {
	Search    string `json:"search"`    // case-insensitive substring; "" = off
	Category  string `json:"category"`  // "all" or a normalized key (legacy display names also match)
	Direction string `json:"direction"` // "all" | "in" | "out"
	FromDate  string `json:"fromDate"`  // "YYYY-MM-DD" inclusive; "" = off
	ToDate    string `json:"toDate"`    // "YYYY-MM-DD" inclusive; "" = off
}

// TransactionRow is one display row of the transaction list. Amount and
// BalanceAfter are KES floats; Reference and BalanceAfter are only shown in
// the row's expanded detail.
type TransactionRow struct {
	Time         string  `json:"time"`         // "15:04"
	Description  string  `json:"description"`  // cleaned/truncated name
	Category     string  `json:"category"`     // normalized key
	Direction    string  `json:"direction"`    // "in" | "out"
	Amount       float64 `json:"amount"`       // KES, signed
	BalanceAfter float64 `json:"balanceAfter"` // KES, full balance after this row
	Reference    string  `json:"reference"`    // till/paybill/payer or receipt no.
}

// TransactionGroup is one calendar day of rows for the list. BalanceAfter is
// the net M-Pesa position (wallet cash minus Fuliza debt) at the end of that
// day and OwedAfter is the Fuliza debt owed then (positive cents, zero when
// debt-free), both computed from the unfiltered data, so the header stays
// meaningful while rows are filtered.
type TransactionGroup struct {
	DateLabel    string           `json:"dateLabel"`    // "Today, 28 Apr" / "Yesterday, 27 Apr" / "28 Apr" / "28 Apr 2024"
	BalanceAfter float64          `json:"balanceAfter"` // KES, net position
	OwedAfter    float64          `json:"owedAfter"`    // KES, positive Fuliza debt
	Transactions []TransactionRow `json:"transactions"`
}

// PeriodSummary is the sidebar summary for the current filtered period.
// Unlike the dashboard totals, charges are included here because this
// summary must reconcile with the rows on screen.
type PeriodSummary struct {
	TotalIn           float64 `json:"totalIn"`           // KES, positive
	TotalOut          float64 `json:"totalOut"`          // KES, positive
	TopCategory       string  `json:"topCategory"`       // normalized key; "" when no rows
	TopCategoryAmount float64 `json:"topCategoryAmount"` // KES, positive
}

func toKES(cents int64) float64 {
	return float64(cents) / 100
}

// CategoryKeyOf maps a description to the coarse category key carried by
// transaction-list rows and matched by their filter. Keys are stable
// legacy values (buy_goods, pay_bill, …), distinct from the display names
// CategoryOf returns for the charts.
func CategoryKeyOf(description string) string {
	d := strings.ToLower(description)
	// Charge rows ride under "other": the list shows them with their own
	// descriptions ("Transfer charge") and the summary reconciles with the
	// visible rows, rather than attributing fees to a spending kind.
	if strings.Contains(d, "charge") {
		return "other"
	}
	switch {
	case hasPrefixAny(d, "merchant payment", "lipa na m-pesa", "buy goods",
		"customer bundle purchase", "bundles by"):
		return "buy_goods"
	case hasPrefixAny(d, "pay bill online", "pay bill to", "paybill"):
		return "pay_bill"
	case hasPrefixAny(d, "funds received", "business payment",
		"agent deposit", "atm deposit"):
		return "receive"
	case hasPrefixAny(d, "airtime purchase", "recharge for customer"):
		return "airtime"
	case hasPrefixAny(d, "customer transfer", "send money", "customer payment"):
		return "send_money"
	case hasPrefixAny(d, "agent withdrawal", "atm withdrawal",
		"customer withdrawal at"):
		return "withdraw"
	default:
		return "other"
	}
}

func hasPrefixAny(s string, prefixes ...string) bool {
	for _, p := range prefixes {
		if strings.HasPrefix(s, p) {
			return true
		}
	}
	return false
}

// matchesFilter applies every filter to one transaction.
func matchesFilter(tx parser.Transaction, name, ref, direction, key string, f TransactionFilter) bool {
	if f.Category != "all" && f.Category != key && f.Category != CategoryOf(tx.Description) {
		return false
	}
	if f.Direction == "in" && tx.Amount < 0 {
		return false
	}
	if f.Direction == "out" && tx.Amount >= 0 {
		return false
	}
	day := tx.Date[:10]
	if f.FromDate != "" && day < f.FromDate {
		return false
	}
	if f.ToDate != "" && day > f.ToDate {
		return false
	}
	if f.Search != "" {
		hay := strings.ToLower(name + " " + ref + " " + tx.Description + " " + key)
		if !containsAllTokens(hay, f.Search) {
			return false
		}
	}
	return true
}

// containsAllTokens reports whether every whitespace-separated token of query
// appears in hay. Matching all tokens (rather than the whole query as one
// substring) lets "absa plc" find "Absa Bank Kenya PLC".
func containsAllTokens(hay, query string) bool {
	for _, tok := range strings.Fields(strings.ToLower(query)) {
		if !strings.Contains(hay, tok) {
			return false
		}
	}
	return true
}

// DateLabelOf renders "Today, 28 Apr" / "Yesterday, 27 Apr" / "28 Apr" for
// the current year, appending the year for older statements.
func DateLabelOf(day string) string {
	now := time.Now()
	if day == now.Format("2006-01-02") {
		return "Today, " + now.Format("2 Jan")
	}
	yesterday := now.AddDate(0, 0, -1)
	if day == yesterday.Format("2006-01-02") {
		return "Yesterday, " + yesterday.Format("2 Jan")
	}
	date, _ := time.Parse("2006-01-02", day)
	label := date.Format("2 Jan")
	if day[:4] != now.Format("2006") {
		label += " " + day[:4]
	}
	return label
}

// GroupedTransactions sorts newest-first, applies the filter, and groups the
// surviving rows by calendar day (newest day first, newest row first within
// a day). Same-second ties break by transaction ID descending so paired
// Fuliza fee ("<receipt>-F") and charge ("<receipt>-C") rows sort before
// their base row and day end balances stay deterministic.
func GroupedTransactions(txs []parser.Transaction, filter TransactionFilter) []TransactionGroup {
	sorted := make([]parser.Transaction, len(txs))
	copy(sorted, txs)
	sort.SliceStable(sorted, func(i, j int) bool {
		if sorted[i].Date != sorted[j].Date {
			return sorted[i].Date > sorted[j].Date
		}
		return sorted[i].ID > sorted[j].ID
	})

	// True end-of-day positions from the net ledger: wallet cash minus
	// Fuliza debt (plus the debt itself for the header). Keyed by day, so
	// filtering rows below can never move a header.
	dayNet, dayOwed := DayLedger(txs)

	groups := make([]TransactionGroup, 0, 16)
	var lastDay string
	for _, tx := range sorted {
		name, ref := SplitTransaction(tx)
		direction := "in"
		if tx.Amount < 0 {
			direction = "out"
		}
		key := CategoryKeyOf(tx.Description)
		if !matchesFilter(tx, name, ref, direction, key, filter) {
			continue
		}

		day := tx.Date[:10]
		if len(groups) == 0 || day != lastDay {
			groups = append(groups, TransactionGroup{
				DateLabel:    DateLabelOf(day),
				BalanceAfter: toKES(dayNet[day]),
				OwedAfter:    toKES(dayOwed[day]),
				Transactions: []TransactionRow{},
			})
			lastDay = day
		}
		g := &groups[len(groups)-1]
		g.Transactions = append(g.Transactions, TransactionRow{
			Time:         tx.Date[11:16],
			Description:  name,
			Category:     key,
			Direction:    direction,
			Amount:       toKES(tx.Amount),
			BalanceAfter: toKES(tx.Balance),
			Reference:    ref,
		})
	}
	return groups
}

// catFlow accumulates one category's direction-specific flow.
type catFlow struct {
	Key    string
	Amount int64
}

func addFlow(m map[string]*catFlow, key string, amount int64) {
	c, ok := m[key]
	if !ok {
		c = &catFlow{Key: key}
		m[key] = c
	}
	c.Amount += amount
}

func topFlow(m map[string]*catFlow) *catFlow {
	var best *catFlow
	for _, c := range m {
		if best == nil || c.Amount > best.Amount {
			best = c
		}
	}
	return best
}

// PeriodSummaryOf computes money in/out and the top category over the
// filtered set. Top category prefers the largest outflow category (where the
// money went), falling back to inflows when nothing left the wallet.
func PeriodSummaryOf(txs []parser.Transaction, filter TransactionFilter) PeriodSummary {
	totalIn, totalOut := int64(0), int64(0)
	outFlow := make(map[string]*catFlow)
	inFlow := make(map[string]*catFlow)

	for _, tx := range txs {
		name, ref := SplitTransaction(tx)
		direction := "in"
		if tx.Amount < 0 {
			direction = "out"
		}
		key := CategoryKeyOf(tx.Description)
		if !matchesFilter(tx, name, ref, direction, key, filter) {
			continue
		}
		if tx.Amount < 0 {
			amount := -tx.Amount
			totalOut += amount
			addFlow(outFlow, key, amount)
		} else {
			totalIn += tx.Amount
			addFlow(inFlow, key, tx.Amount)
		}
	}

	sum := PeriodSummary{
		TotalIn:  toKES(totalIn),
		TotalOut: toKES(totalOut),
	}
	top := topFlow(outFlow)
	if top == nil {
		top = topFlow(inFlow)
	}
	if top != nil {
		sum.TopCategory = top.Key
		sum.TopCategoryAmount = toKES(top.Amount)
	}
	return sum
}
