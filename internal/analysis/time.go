package analysis

import (
	"fmt"
	"sort"
	"time"

	"mpesa-analyzer/internal/parser"
)

// txTime parses a transaction's Completion Time ("2006-01-02 15:04:05").
func txTime(tx parser.Transaction) (time.Time, error) {
	return time.Parse("2006-01-02 15:04:05", tx.Date)
}

// CashflowBucket aggregates money in/out for one period.
type CashflowBucket struct {
	Label string `json:"label"` // "2026-04-28", "2026-W18", "2026-04"
	Start string `json:"start"` // period start date "2006-01-02"
	In    int64  `json:"in"`    // cents
	Out   int64  `json:"out"`   // cents, always positive
}

// Cashflow buckets transactions into daily, weekly or monthly periods.
// Fees are excluded, consistent with TotalAmount. Buckets are
// returned chronologically ascending.
func Cashflow(transactions []parser.Transaction, granularity string) ([]CashflowBucket, error) {
	switch granularity {
	case "day", "week", "month":
	default:
		return nil, fmt.Errorf("invalid granularity %q: want \"day\", \"week\" or \"month\"", granularity)
	}

	index := make(map[string]*CashflowBucket)
	keys := make([]string, 0)

	for _, tx := range transactions {
		if isFee(tx.Description) {
			continue
		}
		t, err := txTime(tx)
		if err != nil {
			return nil, err
		}

		var label, start string
		switch granularity {
		case "day":
			start, label = t.Format("2006-01-02"), t.Format("2006-01-02")
		case "week":
			// ISO week, labeled "2026-W18", starting Monday.
			y, w := t.ISOWeek()
			label = fmt.Sprintf("%d-W%02d", y, w)
			monday := t.AddDate(0, 0, -(int(t.Weekday())+6)%7)
			start = monday.Format("2006-01-02")
		case "month":
			start = t.Format("2006-01-02")
			label = t.Format("2006-01")
		}

		b, ok := index[label]
		if !ok {
			b = &CashflowBucket{Label: label, Start: start}
			index[label] = b
			keys = append(keys, label)
		}
		if tx.Amount < 0 {
			b.Out += -tx.Amount
		} else {
			b.In += tx.Amount
		}
	}

	sort.Strings(keys)
	buckets := make([]CashflowBucket, 0, len(keys))
	for _, k := range keys {
		buckets = append(buckets, *index[k])
	}
	return buckets, nil
}

// BalancePoint is one sample of the account balance over time.
type BalancePoint struct {
	Time    string `json:"time"`    // "2006-01-02 15:04:05"
	Balance int64  `json:"balance"` // cents
}

// BalanceTrajectory returns the net M-Pesa position (wallet cash minus
// Fuliza debt) over time in chronological ascending order. The input order
// is not trusted (statements arrive newest-first, SMS imports oldest-first),
// so points are sorted by timestamp instead of assuming any direction;
// same-second ties break by transaction ID so paired rows order
// deterministically. Without Fuliza rows the debt ledger stays zero and
// every point equals its raw balance exactly as before.
func BalanceTrajectory(transactions []parser.Transaction) ([]BalancePoint, error) {
	for _, tx := range transactions {
		if _, err := txTime(tx); err != nil {
			return nil, err
		}
	}
	pts := Ledger(transactions)
	points := make([]BalancePoint, 0, len(pts))
	for _, p := range pts {
		points = append(points, BalancePoint{Time: p.Date, Balance: p.Net})
	}
	return points, nil
}
