package analysis

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"mpesa-analyzer/internal/parser"
)

// Categories are matched against the transaction Description as ordered
// prefix rules (case-insensitive). First match wins, so ordering matters:
// "Pay Bill Charge" must land in Fees before the Pay Bill rule sees it.
var categoryRules = []struct {
	Category string
	Prefixes []string
}{
	{"Fees", []string{"Pay Bill Charge", "Charge", "Overdraft", "Fuliza"}},
	{"Pay Bill", []string{"Pay Bill Online", "Pay Bill to", "Paybill"}},
	{"Buy Goods", []string{"Merchant Payment", "Lipa na M-PESA", "Buy Goods"}},
	{"Send Money", []string{"Customer Transfer", "Send Money"}},
	{"Receive", []string{"Funds received", "Salary Payment", "Business Payment"}},
	{"Airtime", []string{"Airtime Purchase"}},
	{"Bundles", []string{"Customer Bundle Purchase", "BUNDLES by"}},
	{"Withdraw", []string{"Agent Withdrawal", "ATM Withdrawal"}},
	{"Deposit", []string{"Agent Deposit", "ATM Deposit"}},
	{"Bank & Savings", []string{"M-Shwari", "ZIIDI", "Unit Trust", "Bank Transfer", "via API"}},
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

// CategoryOf maps a description to a category name.
func CategoryOf(description string) string {
	d := strings.ToLower(description)
	for _, rule := range categoryRules {
		for _, p := range rule.Prefixes {
			if strings.HasPrefix(d, strings.ToLower(p)) || strings.Contains(d, strings.ToLower(p)) {
				return rule.Category
			}
		}
	}
	return "Other"
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

var counterpartyRE = regexp.MustCompile(`(?i)\b(?:to|from)\s*(?:[\d*]+\s*)?-\s+(.+)$`)

// CounterpartyOf extracts the counterpart name from a description, e.g.
//
//	"Merchant Payment to 7408526 - FAITH NJOKI BACHIA" -> "FAITH NJOKI BACHIA"
//	"Pay Bill Online to 888880 - KPLC"                -> "KPLC"
//	"Funds received from - 07******752 Calvin Kamara" -> "Calvin Kamara"
//
// Masked phone-number prefixes ("07******752 ") are stripped. Returns ""
// when the description has no counterparty.
func CounterpartyOf(description string) string {
	m := counterpartyRE.FindStringSubmatch(description)
	if m == nil {
		return ""
	}
	name := strings.TrimSpace(m[1])
	// Strip leading masked numbers like "07******752" or "2547******103".
	for {
		fields := strings.Fields(name)
		if len(fields) < 2 || !isMaskedNumber(fields[0]) {
			break
		}
		name = strings.TrimSpace(strings.TrimPrefix(name, fields[0]))
	}
	return strings.TrimSpace(name)
}

func isMaskedNumber(s string) bool {
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= '0' && c <= '9', c == '*':
		default:
			return false
		}
	}
	return strings.Contains(s, "*") && len(s) >= 8
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

// RecurringPayment is a detected recurring expense/payment.
type RecurringPayment struct {
	Pattern     string `json:"pattern"`     // digit-stripped description
	Example     string `json:"example"`     // most recent full description
	Count       int    `json:"count"`
	Amount      int64  `json:"amount"`      // cents (most recent occurrence)
	FirstDate   string `json:"firstDate"`   // chronological first
	LastDate    string `json:"lastDate"`    // chronological last
	MedianDays  int    `json:"medianDays"`  // median gap between occurrences
}

var digitsRE = regexp.MustCompile(`\d+`)

// normalizePattern strips digits and collapses whitespace so
// "Pay Bill Online to 888880 - KPLC" and "Pay Bill Online to 4131317 - KPLC"
// group together.
func normalizePattern(description string) string {
	p := digitsRE.ReplaceAllString(description, "#")
	return strings.Join(strings.Fields(p), " ")
}

// Recurring detects payments that repeat: same normalized description and
// identical amount, occurring at least minCount times. Results are sorted
// by count descending.
func Recurring(transactions []parser.Transaction, minCount int) []RecurringPayment {
	if minCount < 2 {
		minCount = 2
	}

	type group struct {
		pattern string
		amount  int64
		dates   []time.Time
		example string
	}
	groups := make(map[string]*group)

	for _, tx := range transactions {
		pattern := normalizePattern(tx.Description)
		key := fmt.Sprintf("%s|%d", pattern, tx.Amount)
		g, ok := groups[key]
		if !ok {
			g = &group{pattern: pattern, amount: tx.Amount, example: tx.Description}
			groups[key] = g
		}
		t, err := txTime(tx)
		if err != nil {
			continue
		}
		g.dates = append(g.dates, t)
	}

	out := make([]RecurringPayment, 0)
	for _, g := range groups {
		if len(g.dates) < minCount {
			continue
		}
		sort.Slice(g.dates, func(i, j int) bool { return g.dates[i].Before(g.dates[j]) })
		r := RecurringPayment{
			Pattern:    g.pattern,
			Example:    g.example,
			Count:      len(g.dates),
			Amount:     g.amount,
			FirstDate:  g.dates[0].Format("2006-01-02"),
			LastDate:   g.dates[len(g.dates)-1].Format("2006-01-02"),
			MedianDays: medianGapDays(g.dates),
		}
		out = append(out, r)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Count > out[j].Count })
	return out
}

func medianGapDays(dates []time.Time) int {
	if len(dates) < 2 {
		return 0
	}
	gaps := make([]int, 0, len(dates)-1)
	for i := 1; i < len(dates); i++ {
		gaps = append(gaps, int(dates[i].Sub(dates[i-1]).Hours()/24))
	}
	sort.Ints(gaps)
	return gaps[len(gaps)/2]
}
