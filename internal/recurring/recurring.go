// Package recurring detects recurring outgoing payments in parsed M-Pesa
// statements: bills, subscriptions, rent, loan instalments, standing
// transfers and similar periodic outflows.
//
// The detector is deterministic and explainable - no ML, no hidden state.
// It groups eligible outgoing payments by counterparty, measures the gaps
// between consecutive payment dates, and qualifies a group only when:
//
//  1. it has enough payments for the cadence (at least minOccurrences;
//     weekly and bi-weekly patterns additionally need four payments),
//  2. the median gap falls inside a known cadence window,
//  3. the gaps are regular enough for that cadence (measured with the
//     median absolute deviation, MAD), and
//  4. no single gap is an inactivity break (more than gapOutlierFactor
//     times the median gap) - the one failure mode median/MAD statistics
//     are structurally blind to.
//
// Amounts are summarized (median/min/max) but deliberately do not gate
// qualification, because many genuine recurring bills - utilities, school
// fees, variable loan instalments - change amount from cycle to cycle.
package recurring

import (
	"sort"
	"time"

	"mpesa-analyzer/internal/counterparty"
	"mpesa-analyzer/internal/parser"
	"mpesa-analyzer/internal/txtype"
)

// dateLayout is the parser's transaction timestamp format.
const dateLayout = "2006-01-02 15:04:05"

// minOccurrences is the absolute floor on the number of payments per
// group, enforced before any cadence is known: it guarantees at least two
// gaps so the median and MAD statistics are meaningful. Each cadence
// additionally enforces its own cadenceRule.minCount (see cadence.go).
const minOccurrences = 3

// gapOutlierFactor is how many times the median gap a single gap may span
// before it is treated as an inactivity break rather than a late payment.
// Three tolerates common real-world lapses - a weekly payment skipped once
// (14 days against a 21-day ceiling), a monthly bill skipped one cycle
// (60 against 90) - while rejecting the "weekly for a while, then silent
// for months" pattern that median/MAD statistics alone accept.
const gapOutlierFactor = 3

// RecurringPayment is a detected recurring outgoing payment. It replaces
// the earlier RecurringBill type: the detector identifies any periodic
// outflow (rent, savings, loan instalments, standing transfers), not just
// bills, so the name describes what is actually detected. All amounts are
// positive cents (money out), matching how the frontend displays outflows.
type RecurringPayment struct {
	Counterparty  string `json:"counterparty"`
	Count         int    `json:"count"`
	Type          string `json:"type"`      // majority transaction type of the group (see internal/txtype)
	Amount        int64  `json:"amount"`    // median outgoing amount, positive cents
	AmountMin     int64  `json:"amountMin"` // smallest outgoing amount, positive cents
	AmountMax     int64  `json:"amountMax"` // largest outgoing amount, positive cents
	Cadence       string `json:"cadence"`   // weekly, bi-weekly, monthly, quarterly
	MedianGapDays int    `json:"medianGapDays"`
	FirstDate     string `json:"firstDate"` // "2006-01-02 15:04:05"
	LastDate      string `json:"lastDate"`  // "2006-01-02 15:04:05"
}

// timedTx pairs a transaction with its parsed timestamp so dates are
// parsed exactly once per transaction instead of once per gap.
type timedTx struct {
	tx parser.Transaction
	at time.Time
}

// DetectRecurringPayments returns every counterparty whose outgoing
// payments qualify as recurring, sorted by counterparty name for stable,
// deterministic output.
//
// The function never returns an error because it has no failure path: it
// is total over its input space, and every input - including nil - maps to
// a well-defined deterministic result. That is not the same as claiming it
// "cannot fail" in a broader sense: it silently filters ineligible
// transactions (non-outgoing, counterparty-less, unparseable-date rows)
// and omits groups that do not qualify, without reporting what was
// dropped. Malformed dates therefore reduce recall silently. Because
// parser.ParseTX already rejects invalid dates and amounts, their presence
// in this input indicates a caller bypassing the parser; validate upstream
// if visibility into dropped rows matters.
func DetectRecurringPayments(transactions []parser.Transaction) []RecurringPayment {
	groups := groupByCounterparty(transactions)

	results := make([]RecurringPayment, 0, len(groups))
	for counterparty, txs := range groups {
		if p, ok := analyzeGroup(txs); ok {
			p.Counterparty = counterparty
			results = append(results, p)
		}
	}
	sort.Slice(results, func(i, j int) bool { return results[i].Counterparty < results[j].Counterparty })
	return results
}

// groupByCounterparty collects eligible outgoing payments: negative amount
// (money out), a non-empty counterparty, and a parseable date. The parser
// normally returns transactions in chronological order, but ordering is
// not part of its contract, so each group is sorted defensively; the cost
// is one O(n log n) pass over the eligible subset. Unparseable dates are
// skipped: one corrupt row must not poison a long payment history with
// bogus gaps.
func groupByCounterparty(transactions []parser.Transaction) map[string][]timedTx {
	groups := make(map[string][]timedTx)
	for _, tx := range transactions {
		if tx.Amount >= 0 {
			continue
		}
		counterparty := counterparty.CounterpartyOf(tx.Description)
		if counterparty == "" {
			continue
		}
		at, err := time.Parse(dateLayout, tx.Date)
		if err != nil {
			continue
		}
		groups[counterparty] = append(groups[counterparty], timedTx{tx: tx, at: at})
	}
	for _, group := range groups {
		sort.SliceStable(group, func(i, j int) bool { return group[i].at.Before(group[j].at) })
	}
	return groups
}

// analyzeGroup decides whether one counterparty's chronologically sorted
// payments qualify as recurring, and builds the result if they do.
//
// A group qualifies when (a) it has enough payments for the cadence,
// (b) its median gap matches a cadence window, (c) its gaps are regular
// enough for that cadence (MAD), and (d) no single gap is an inactivity
// break - a gap more than gapOutlierFactor times the median gap. The
// last check exists because median/MAD are structurally blind to a lone
// outlier gap: gaps [7, 7, 190] yield median 7 and MAD 0, yet the
// payments are two coincidentally similar periods around a six-month
// silence, not one recurring pattern. It is deliberately per-gap rather
// than span-based so it catches breaks anywhere in the timeline (middle
// or tail) with the same constant.
//
// Counterparty grouping uses the counterparty string exactly as extracted
// from the description. The only normalization performed is whitespace
// trimming, already done by analysis.CounterpartyOf. Case-folding or
// stripping punctuation would merge names like "JOHN DOE" and "John Doe",
// which is usually the same person but occasionally two different tills or
// accounts that happen to share a display name - the risk of merging
// genuinely distinct counterparties outweighs the recall gain.
func analyzeGroup(txs []timedTx) (RecurringPayment, bool) {
	if len(txs) < minOccurrences {
		return RecurringPayment{}, false
	}

	gaps := consecutiveGapDays(txs)

	medianGap, ok := median(gaps)
	if !ok {
		// Unreachable: len(txs) >= minOccurrences implies len(gaps) >= 2.
		return RecurringPayment{}, false
	}
	rule, ok := classifyCadence(medianGap)
	if !ok {
		return RecurringPayment{}, false // median gap matches no cadence
	}
	if len(txs) < rule.minCount {
		return RecurringPayment{}, false // too few payments for this cadence
	}
	mad, _ := medianAbsoluteDeviation(gaps)
	if mad > rule.maxMAD {
		return RecurringPayment{}, false // gaps too irregular for the cadence
	}
	for _, g := range gaps {
		if g > gapOutlierFactor*medianGap {
			return RecurringPayment{}, false // inactivity break
		}
	}

	stats := amountStats(txs)
	return RecurringPayment{
		Count:         len(txs),
		Type:          majorityType(txs),
		Amount:        stats.median,
		AmountMin:     stats.min,
		AmountMax:     stats.max,
		Cadence:       rule.name,
		MedianGapDays: int(medianGap),
		FirstDate:     txs[0].tx.Date,
		LastDate:      txs[len(txs)-1].tx.Date,
	}, true
}

// majorityType returns the most common transaction type in a group. The
// recurring detector's grouping is by counterparty, so a group's rows are
// almost always one kind; the vote just resolves the rare mixed group
// (e.g. a payee paid both by Pay Bill and by merchant payment). Ties are
// broken alphabetically so the result stays deterministic. Never guesses
// from the counterparty string - only from the statement descriptions.
func majorityType(txs []timedTx) string {
	counts := make(map[txtype.TransactionType]int)
	for _, t := range txs {
		counts[txtype.TypeOf(t.tx.Description)]++
	}
	best, bestCount := txtype.TypeOther, 0
	for typ, n := range counts {
		if n > bestCount || (n == bestCount && typ < best) {
			best, bestCount = typ, n
		}
	}
	return string(best)
}

// consecutiveGapDays returns the gaps in whole days between consecutive
// payments, rounded to the nearest day. Rounding (rather than truncating)
// keeps a payment made slightly earlier or later than its usual time of
// day from shifting the measured gap by a full day. Same-day payments
// yield a gap of 0, which is included as-is: the median and MAD absorb
// occasional same-day double payments without rejecting the group.
func consecutiveGapDays(txs []timedTx) []int64 {
	gaps := make([]int64, 0, len(txs)-1)
	for i := 1; i < len(txs); i++ {
		d := txs[i].at.Sub(txs[i-1].at).Round(24 * time.Hour)
		gaps = append(gaps, int64(d.Hours()/24))
	}
	return gaps
}

// amountSummary summarizes a group's outgoing amounts in positive cents.
type amountSummary struct {
	median int64
	min    int64
	max    int64
}

// amountStats summarizes the absolute outgoing amounts of a chronological
// group. The median is used instead of the mean so that one unusually
// large payment (a lump-sum settlement, a shared bill paid in full) does
// not distort the "typical amount"; min/max expose the true range.
func amountStats(txs []timedTx) amountSummary {
	amounts := make([]int64, 0, len(txs))
	var min, max int64
	for i, t := range txs {
		a := -t.tx.Amount // outgoing amounts are negative; report positive cents
		amounts = append(amounts, a)
		if i == 0 || a < min {
			min = a
		}
		if i == 0 || a > max {
			max = a
		}
	}
	m, _ := median(amounts)
	return amountSummary{median: m, min: min, max: max}
}
