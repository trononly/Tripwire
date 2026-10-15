package recurring

import (
	"reflect"
	"testing"
	"time"

	"mpesa-analyzer/internal/parser"
)

const kplc = "Pay Bill Online to 888880 - KPLC"

var base = time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

// day returns a timestamp n whole days after the test base date, always at
// the same time of day so gaps are exact multiples of 24h.
func day(n int) string {
	return base.Add(time.Duration(n) * 24 * time.Hour).Format(dateLayout)
}

// payment builds one transaction, n days after the base date.
func payment(n int, description string, amount int64) parser.Transaction {
	return parser.Transaction{
		ID:          "TEST" + day(n),
		Date:        day(n),
		Description: description,
		Status:      "Completed",
		Amount:      amount,
		Balance:     0,
	}
}

// spaced builds n same-amount payments every gap days starting at day 0.
func spaced(count, gap int, description string, amount int64) []parser.Transaction {
	txs := make([]parser.Transaction, 0, count)
	for i := 0; i < count; i++ {
		txs = append(txs, payment(i*gap, description, amount))
	}
	return txs
}

func TestDetectRecurringPaymentsEmptyInput(t *testing.T) {
	for name, in := range map[string][]parser.Transaction{
		"nil":   nil,
		"empty": {},
	} {
		t.Run(name, func(t *testing.T) {
			got := DetectRecurringPayments(in)
			if len(got) != 0 {
				t.Errorf("want no results, got %+v", got)
			}
		})
	}
}

func TestDetectRecurringPaymentsBelowMinimumOccurrences(t *testing.T) {
	for name, txs := range map[string][]parser.Transaction{
		"one transaction":  {payment(0, kplc, -5000)},
		"two transactions": spaced(2, 7, kplc, -5000),
	} {
		t.Run(name, func(t *testing.T) {
			// Even perfectly periodic pairs are coincidence-prone; the
			// absolute floor is three payments (two gaps), and weekly
			// patterns need four (see TestCadenceMinimumCounts).
			if got := DetectRecurringPayments(txs); len(got) != 0 {
				t.Errorf("want no results for %s, got %+v", name, got)
			}
		})
	}
}

func TestDetectRecurringPaymentsCadences(t *testing.T) {
	cases := []struct {
		name        string
		gap         int
		wantCadence string
		wantMedian  int
	}{
		{"exact weekly", 7, "weekly", 7},
		{"exact bi-weekly", 14, "bi-weekly", 14},
		{"exact monthly", 30, "monthly", 30},
		{"exact quarterly", 90, "quarterly", 90},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			txs := spaced(4, tc.gap, kplc, -5000)
			got := DetectRecurringPayments(txs)
			if len(got) != 1 {
				t.Fatalf("want 1 result, got %d: %+v", len(got), got)
			}
			p := got[0]
			if p.Cadence != tc.wantCadence || p.MedianGapDays != tc.wantMedian {
				t.Errorf("cadence = %q (%d days), want %q (%d days)", p.Cadence, p.MedianGapDays, tc.wantCadence, tc.wantMedian)
			}
			if p.Count != 4 || p.Counterparty != "KPLC" {
				t.Errorf("unexpected group: %+v", p)
			}
			if p.FirstDate != day(0) || p.LastDate != day(3*tc.gap) {
				t.Errorf("dates = %q..%q, want %q..%q", p.FirstDate, p.LastDate, day(0), day(3*tc.gap))
			}
		})
	}
}

func TestDetectRecurringPaymentsTenDayPatternRejected(t *testing.T) {
	// 10 days sits in the dead zone between weekly and bi-weekly; being
	// "close to weekly" must not qualify it.
	txs := spaced(4, 10, kplc, -5000)
	if got := DetectRecurringPayments(txs); len(got) != 0 {
		t.Errorf("want no results, got %+v", got)
	}
}

func TestDetectRecurringPaymentsIrregularGapsRejected(t *testing.T) {
	txs := []parser.Transaction{
		payment(0, kplc, -5000),
		payment(2, kplc, -5000),
		payment(4, kplc, -5000),
		payment(30, kplc, -5000),
		payment(33, kplc, -5000),
	}
	if got := DetectRecurringPayments(txs); len(got) != 0 {
		t.Errorf("want no results, got %+v", got)
	}
}

func TestDetectRecurringPaymentsMADValidation(t *testing.T) {
	cases := []struct {
		name    string
		days    []int
		wantGot bool
	}{
		{"low MAD passes", []int{0, 6, 14, 20, 28}, true},                   // gaps 6,8,6,8: median 7, MAD 1
		{"high MAD fails", []int{0, 4, 11, 21}, false},                      // gaps 4,7,10: median 7, MAD 3 > weekly tolerance 2
		{"single skipped payment tolerated", []int{0, 7, 21, 28, 35}, true}, // gaps 7,14,7,7: median 7, MAD 0, max gap 14 <= 21
		{"median gap in dead zone", []int{0, 10, 60, 150}, false},           // gaps 10,50,90: median 50 matches no cadence
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var txs []parser.Transaction
			for _, d := range tc.days {
				txs = append(txs, payment(d, kplc, -5000))
			}
			got := DetectRecurringPayments(txs)
			if tc.wantGot && len(got) != 1 {
				t.Errorf("want 1 result, got %+v", got)
			}
			if !tc.wantGot && len(got) != 0 {
				t.Errorf("want no results, got %+v", got)
			}
		})
	}
}

func TestDetectRecurringPaymentsAmounts(t *testing.T) {
	cases := []struct {
		name       string
		amounts    []int64
		wantMedian int64
		wantMin    int64
		wantMax    int64
	}{
		{"identical amounts", []int64{-5000, -5000, -5000}, 5000, 5000, 5000},
		{"slightly varying amounts", []int64{-5000, -5100, -4900, -5000}, 5000, 4900, 5100},
		{"one unusually large payment", []int64{-5000, -5000, -5000, -50000}, 5000, 5000, 50000},
		{"highly variable utility bill", []int64{-2000, -9000, -4000, -6000}, 5000, 2000, 9000},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			txs := spaced(len(tc.amounts), 30, kplc, 0)
			for i, a := range tc.amounts {
				txs[i].Amount = a
			}
			got := DetectRecurringPayments(txs)
			if len(got) != 1 {
				t.Fatalf("want 1 result, got %+v", got)
			}
			p := got[0]
			// Reported amounts are positive cents (money out), whatever the
			// variability: variability alone never disqualifies a bill.
			if p.Amount != tc.wantMedian || p.AmountMin != tc.wantMin || p.AmountMax != tc.wantMax {
				t.Errorf("amounts = median %d, min %d, max %d; want %d, %d, %d",
					p.Amount, p.AmountMin, p.AmountMax, tc.wantMedian, tc.wantMin, tc.wantMax)
			}
		})
	}
}

func TestDetectRecurringPaymentsMalformedDatesSkipped(t *testing.T) {
	txs := []parser.Transaction{
		payment(0, kplc, -5000),
		payment(7, kplc, -5000),
		{ID: "BAD", Date: "2026-13-45 99:99:99", Description: kplc, Status: "Completed", Amount: -5000},
		payment(14, kplc, -5000),
		payment(21, kplc, -5000),
	}
	got := DetectRecurringPayments(txs)
	if len(got) != 1 {
		t.Fatalf("want 1 result, got %+v", got)
	}
	if got[0].Count != 4 {
		t.Errorf("count = %d, want 4 (malformed row skipped)", got[0].Count)
	}
	if got[0].Cadence != "weekly" {
		t.Errorf("cadence = %q, want weekly", got[0].Cadence)
	}
}

func TestDetectRecurringPaymentsDuplicateDatesAndSameDayPayments(t *testing.T) {
	// A same-day double payment adds a 0-day gap; the median absorbs it.
	txs := []parser.Transaction{
		payment(0, kplc, -2500),
		payment(0, kplc, -2500),
		payment(7, kplc, -2500),
		payment(14, kplc, -2500),
	}
	got := DetectRecurringPayments(txs)
	if len(got) != 1 {
		t.Fatalf("want 1 result, got %+v", got)
	}
	p := got[0]
	if p.Count != 4 || p.Cadence != "weekly" || p.MedianGapDays != 7 {
		t.Errorf("unexpected result: %+v", p)
	}
}

func TestDetectRecurringPaymentsMixedRegularAndUnrelatedRejected(t *testing.T) {
	// Same counterparty, but the timing is chaotic: this is not a
	// recurring pattern even though some gaps look periodic.
	txs := []parser.Transaction{
		payment(0, kplc, -5000),
		payment(1, kplc, -5000),
		payment(7, kplc, -5000),
		payment(9, kplc, -5000),
		payment(20, kplc, -5000),
	}
	if got := DetectRecurringPayments(txs); len(got) != 0 {
		t.Errorf("want no results, got %+v", got)
	}
}

func TestDetectRecurringPaymentsMissingCounterpartySkipped(t *testing.T) {
	txs := spaced(6, 7, "Airtime Purchase", -500)
	if got := DetectRecurringPayments(txs); len(got) != 0 {
		t.Errorf("counterparty-less transactions must be skipped, got %+v", got)
	}
}

func TestDetectRecurringPaymentsIncomingAndZeroAmountsSkipped(t *testing.T) {
	txs := []parser.Transaction{
		// Incoming payments from the same counterparty are not outflows.
		payment(1, "Funds received from - KPLC Reversal", 3000),
		payment(8, "Funds received from - KPLC Reversal", 3000),
		payment(15, "Funds received from - KPLC Reversal", 3000),
		// Zero-value rows carry no payment.
		payment(0, kplc, 0),
		// The genuine weekly outflow survives.
		payment(0, kplc, -5000),
		payment(7, kplc, -5000),
		payment(14, kplc, -5000),
		payment(21, kplc, -5000),
	}
	got := DetectRecurringPayments(txs)
	if len(got) != 1 {
		t.Fatalf("want 1 result, got %+v", got)
	}
	if got[0].Count != 4 || got[0].Amount != 5000 {
		t.Errorf("unexpected result: %+v", got[0])
	}
}

func TestDetectRecurringPaymentsMultipleCounterpartiesSorted(t *testing.T) {
	water := "Pay Bill Online to 559999 - NAIROBI WATER"
	txs := append(
		spaced(4, 14, water, -1200),  // would sort after KPLC
		spaced(4, 7, kplc, -5000)..., // would sort before... but appended second
	)
	got := DetectRecurringPayments(txs)
	if len(got) != 2 {
		t.Fatalf("want 2 results, got %d: %+v", len(got), got)
	}
	if got[0].Counterparty != "KPLC" || got[1].Counterparty != "NAIROBI WATER" {
		t.Errorf("results not sorted by counterparty: %q, %q", got[0].Counterparty, got[1].Counterparty)
	}
	if got[0].Cadence != "weekly" || got[1].Cadence != "bi-weekly" {
		t.Errorf("cadences wrong: %+v", got)
	}
}

func TestDetectRecurringPaymentsDeterministicOutput(t *testing.T) {
	txs := append(
		spaced(4, 30, "Pay Bill Online to 559999 - NAIROBI WATER", -1200),
		spaced(4, 7, kplc, -5000)...,
	)
	spaced(4, 7, "Merchant Payment to 7408526 - SUPERMARKET", -14400)
	txs = append(txs, spaced(4, 7, "Merchant Payment to 7408526 - SUPERMARKET", -14400)...)

	first := DetectRecurringPayments(txs)
	second := DetectRecurringPayments(txs)
	if !reflect.DeepEqual(first, second) {
		t.Error("output is not deterministic between runs")
	}
	if len(first) != 3 {
		t.Fatalf("want 3 results, got %+v", first)
	}
	for i := 1; i < len(first); i++ {
		if first[i-1].Counterparty >= first[i].Counterparty {
			t.Errorf("results not sorted: %q before %q", first[i-1].Counterparty, first[i].Counterparty)
		}
	}
}

func TestDetectRecurringPaymentsOutOfOrderInput(t *testing.T) {
	// The parser normally returns chronological data, but the detector
	// must not depend on it.
	txs := []parser.Transaction{
		payment(21, kplc, -5000),
		payment(7, kplc, -5000),
		payment(14, kplc, -5000),
		payment(0, kplc, -5000),
	}
	got := DetectRecurringPayments(txs)
	if len(got) != 1 || got[0].Cadence != "weekly" || got[0].FirstDate != day(0) {
		t.Errorf("out-of-order input mishandled: %+v", got)
	}
}

func TestDetectRecurringPaymentsSameDayTimeOfDayJitter(t *testing.T) {
	// Weekly payments drifting by 30 minutes must still measure a 7-day gap
	// (rounding), not 6 (truncation).
	early := parser.Transaction{ID: "E", Date: "2026-01-08 17:30:00", Description: kplc, Status: "Completed", Amount: -5000}
	txs := []parser.Transaction{
		payment(0, kplc, -5000), // 12:00
		early,
		payment(14, kplc, -5000),
		payment(21, kplc, -5000),
	}
	got := DetectRecurringPayments(txs)
	if len(got) != 1 || got[0].MedianGapDays != 7 {
		t.Errorf("time-of-day jitter not rounded: %+v", got)
	}
}

// TestDetectRecurringPaymentsInactivityBreaks pins the behavior for the
// known median/MAD blind spot: a lone gap far beyond the cadence means the
// pattern lapsed or consists of two coincidentally similar periods, and
// must be rejected as a single recurring pattern even though the median
// and MAD look perfect.
func TestDetectRecurringPaymentsInactivityBreaks(t *testing.T) {
	cases := []struct {
		name    string
		days    []int
		wantGot bool
	}{
		// The known failure case: gaps [7, 7, 190] - median 7, MAD 0 - must
		// not qualify as weekly.
		{"break in the middle", []int{1, 8, 15, 205}, false},
		{"break in the tail: long-silent then one resumption payment", []int{0, 7, 14, 204}, false},
		{"recent payment far outside cadence", []int{0, 7, 14, 21, 111}, false},
		{"weekly that later became quarterly", []int{0, 7, 14, 21, 28, 118, 208, 298}, false},
		// Real-world lapses within the outlier factor must survive.
		{"weekly with one skipped payment", []int{0, 7, 21, 28, 35}, true},   // gap 14 <= 21
		{"weekly boundary: 21-day gap tolerated", []int{0, 7, 28, 35}, true}, // gap 21 == 3*7
		{"weekly boundary: 22-day gap rejected", []int{0, 7, 29, 36}, false}, // gap 22 > 21
		{"monthly with one skipped cycle", []int{0, 30, 90, 120}, true},      // gap 60 <= 90
		{"quarterly with one missed cycle", []int{0, 90, 180, 360}, true},    // gap 180 <= 270
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var txs []parser.Transaction
			for _, d := range tc.days {
				txs = append(txs, payment(d, kplc, -5000))
			}
			got := DetectRecurringPayments(txs)
			if tc.wantGot && len(got) != 1 {
				t.Errorf("want 1 result, got %+v", got)
			}
			if !tc.wantGot && len(got) != 0 {
				t.Errorf("want no results, got %+v", got)
			}
		})
	}
}

// TestCadenceMinimumCounts verifies the per-cadence minimum occurrence
// counts: weekly and bi-weekly patterns need four payments, monthly and
// quarterly need three.
func TestCadenceMinimumCounts(t *testing.T) {
	cases := []struct {
		name    string
		count   int
		gap     int
		wantGot bool
	}{
		{"three weekly payments rejected", 3, 7, false},
		{"four weekly payments accepted", 4, 7, true},
		{"three bi-weekly payments rejected", 3, 14, false},
		{"four bi-weekly payments accepted", 4, 14, true},
		{"three monthly payments accepted", 3, 30, true},
		{"two monthly payments rejected", 2, 30, false},
		{"three quarterly payments accepted", 3, 90, true},
		{"two quarterly payments rejected", 2, 90, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := DetectRecurringPayments(spaced(tc.count, tc.gap, kplc, -5000))
			if tc.wantGot && len(got) != 1 {
				t.Errorf("want 1 result, got %+v", got)
			}
			if !tc.wantGot && len(got) != 0 {
				t.Errorf("want no results, got %+v", got)
			}
		})
	}
}

func TestConsecutiveGapDays(t *testing.T) {
	txs := []timedTx{
		{tx: payment(0, kplc, -1), at: base},
		{tx: payment(7, kplc, -1), at: base.Add(7 * 24 * time.Hour)},
		{tx: payment(7, kplc, -1), at: base.Add(7 * 24 * time.Hour)}, // duplicate timestamp
		{tx: payment(37, kplc, -1), at: base.Add(37 * 24 * time.Hour)},
	}
	got := consecutiveGapDays(txs)
	want := []int64{7, 0, 30}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("gaps = %v, want %v", got, want)
	}
}

// The recurring card's icon is driven by a pre-computed transaction type,
// not guessed from the counterparty string.
func TestRecurringPaymentsCarryType(t *testing.T) {
	txs := []parser.Transaction{
		payment(0, "Pay Bill Online to 888880 - KPLC PREPAID Acc. 01450540651", -245000),
		payment(31, "Pay Bill Online to 888880 - KPLC PREPAID Acc. 01450540651", -230000),
		payment(60, "Pay Bill Online to 888880 - KPLC PREPAID Acc. 01450540651", -260000),
	}
	found := DetectRecurringPayments(txs)
	if len(found) != 1 {
		t.Fatalf("want 1 recurring payment, got %d: %+v", len(found), found)
	}
	if found[0].Type != "paybill" {
		t.Errorf("type = %q, want %q", found[0].Type, "paybill")
	}
}
