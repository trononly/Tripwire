package analysis

import (
	"sort"
	"strings"
	"time"

	"mpesa-analyzer/internal/parser"
)

// RecurringView is the enriched recurring-payment model rendered by the
// frontend card list. All math (average gaps, monthly impact) is computed
// here so the frontend only renders.
type RecurringView struct {
	Label          string  `json:"label"`          // cleaned counterparty/payment name
	Category       string  `json:"category"`       // normalized key: receive, buy_goods, pay_bill, airtime, withdraw, send_money, other
	Direction      string  `json:"direction"`      // "in" | "out"
	Amount         float64 `json:"amount"`         // KES, most recent occurrence
	Count          int     `json:"count"`
	FrequencyLabel string  `json:"frequencyLabel"` // Daily / A few times a week / Weekly-ish / Monthly / Irregular
	MonthlyImpact  float64 `json:"monthlyImpact"`  // Amount × estimated occurrences per month
	FirstSeen      string  `json:"firstSeen"`      // "2006-01-02"
	LastSeen       string  `json:"lastSeen"`       // "2006-01-02"
}

// categoryKey normalizes a CategoryOf display name into the stable key set
// the frontend's icon/colour mapping expects.
func categoryKey(cat string) string {
	c := strings.ToLower(cat)
	switch {
	case strings.Contains(c, "receive"), strings.Contains(c, "salary"), strings.Contains(c, "funds"):
		return "receive"
	case strings.Contains(c, "buy goods"), strings.Contains(c, "merchant"):
		return "buy_goods"
	case strings.Contains(c, "pay bill"):
		return "pay_bill"
	case strings.Contains(c, "airtime"):
		return "airtime"
	case strings.Contains(c, "withdraw"):
		return "withdraw"
	case strings.Contains(c, "send"):
		return "send_money"
	default:
		return "other"
	}
}

// frequencyLabel buckets an average gap (in days) into a human cadence.
func frequencyLabel(avgGapDays float64) string {
	switch {
	case avgGapDays <= 2:
		return "Daily"
	case avgGapDays <= 5:
		return "A few times a week"
	case avgGapDays <= 10:
		return "Weekly-ish"
	case avgGapDays <= 40:
		return "Monthly"
	default:
		return "Irregular"
	}
}

// averageGapDays returns the mean gap between consecutive occurrences.
func averageGapDays(dates []time.Time) float64 {
	if len(dates) < 2 {
		return 0
	}
	var total float64
	for i := 1; i < len(dates); i++ {
		total += dates[i].Sub(dates[i-1]).Hours() / 24
	}
	return total / float64(len(dates)-1)
}

// RecurringDetailed detects recurring payments and enriches them for the
// frontend. Detection happens in two phases:
//
//  1. Raw grouping per (description pattern, exact amount) — the base
//     detector.
//  2. Aggregation per (counterparty, direction): one row per person/biller
//     regardless of how many distinct amounts they paid. "Fees" (charges
//     like Fuliza, Pay Bill Charge, overdraft) are excluded — they ride
//     along on other transactions and are not recurring payments.
//
// NextDue prefers the actual average gap between historical occurrences
// (LastSeen + avg interval); per-occurrence dates are always available from
// the statement, so there is no label-based fallback.
func RecurringDetailed(transactions []parser.Transaction, minCount int) []RecurringView {
	type bucket struct {
		label      string
		category   string
		direction  string
		dates      []time.Time
		lastDate   time.Time
		lastAmount int64
	}

	buckets := make(map[string]*bucket)
	for _, g := range groupRecurring(transactions, 2) {
		cat := CategoryOf(g.example)
		if cat == "Fees" {
			continue // charges attached to transactions are not "recurring payments"
		}
		direction := "out"
		if g.amount >= 0 {
			direction = "in"
		}
		label := CounterpartyOf(g.example)
		if label == "" {
			// No counterparty in the description (e.g. "Airtime Purchase"):
			// fall back to the classifier's display name.
			label = cat
		}
		key := label + "|" + direction
		b, ok := buckets[key]
		if !ok {
			b = &bucket{label: label, category: categoryKey(cat), direction: direction}
			buckets[key] = b
		}
		b.dates = append(b.dates, g.dates...)
		if last := g.dates[len(g.dates)-1]; last.After(b.lastDate) {
			b.lastDate = last
			b.lastAmount = g.amount
			b.category = categoryKey(cat) // most recent occurrence wins
		}
	}

	out := make([]RecurringView, 0)
	for _, b := range buckets {
		if len(b.dates) < minCount {
			continue
		}
		sort.Slice(b.dates, func(i, j int) bool { return b.dates[i].Before(b.dates[j]) })
		avgGap := averageGapDays(b.dates)
		last := b.dates[len(b.dates)-1]

		amountKES := float64(b.lastAmount) / 100
		occurrencesPerMonth := 0.0
		if avgGap > 0 {
			occurrencesPerMonth = 30.44 / avgGap
		}

		out = append(out, RecurringView{
			Label:          b.label,
			Category:       b.category,
			Direction:      b.direction,
			Amount:         amountKES,
			Count:          len(b.dates),
			FrequencyLabel: frequencyLabel(avgGap),
			MonthlyImpact:  amountKES * occurrencesPerMonth,
			FirstSeen:      b.dates[0].Format("2006-01-02"),
			LastSeen:       last.Format("2006-01-02"),
		})
	}
	return out
}

// SortRecurringViews sorts views in place per the frontend's sort choice:
// "amount" (|Amount| desc) or "frequency" (cadence rank asc); anything else
// sorts by MonthlyImpact descending (the default).
func SortRecurringViews(views []RecurringView, sortBy string) {
	var frequencyRank = map[string]int{
		"Daily":               0,
		"A few times a week":  1,
		"Weekly-ish":          2,
		"Monthly":             3,
		"Irregular":           4,
	}
	sort.SliceStable(views, func(i, j int) bool {
		a, b := views[i], views[j]
		switch sortBy {
		case "amount":
			if abs64(a.Amount) != abs64(b.Amount) {
				return abs64(a.Amount) > abs64(b.Amount)
			}
			return a.Count > b.Count
		case "frequency":
			if frequencyRank[a.FrequencyLabel] != frequencyRank[b.FrequencyLabel] {
				return frequencyRank[a.FrequencyLabel] < frequencyRank[b.FrequencyLabel]
			}
			return a.Count > b.Count
		default: // "impact"
			return a.MonthlyImpact > b.MonthlyImpact
		}
	})
}

func abs64(v float64) float64 {
	if v < 0 {
		return -v
	}
	return v
}
