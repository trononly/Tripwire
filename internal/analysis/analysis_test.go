package analysis

import (
	"testing"

	"mpesa-analyzer/internal/parser"
)

func tx(date, description string, amount, balance int64) parser.Transaction {
	return parser.Transaction{
		ID: "TEST123", Date: date, Description: description,
		Status: "Completed", Amount: amount, Balance: balance,
	}
}

func TestCashflowDay(t *testing.T) {
	txs := []parser.Transaction{
		tx("2026-04-28 19:55:42", "Airtime Purchase", -500, 44679),
		tx("2026-04-28 17:27:36", "Pay Bill Online to 888880 - KPLC", -5000, 45179),
		tx("2026-04-21 18:29:02", "Funds received from - Calvin", 3000, 76079),
		tx("2026-04-21 17:06:40", "Pay Bill Charge", -300, 87479), // fee: excluded
	}
	buckets, err := Cashflow(txs, "day")
	if err != nil {
		t.Fatal(err)
	}
	if len(buckets) != 2 {
		t.Fatalf("want 2 buckets, got %d: %+v", len(buckets), buckets)
	}
	if buckets[0].Label != "2026-04-21" || buckets[1].Label != "2026-04-28" {
		t.Errorf("wrong order/labels: %+v", buckets)
	}
	if buckets[0].In != 3000 || buckets[0].Out != 0 {
		t.Errorf("bucket 2026-04-21: want in=3000 out=0, got %+v", buckets[0])
	}
	if buckets[1].In != 0 || buckets[1].Out != 5500 {
		t.Errorf("bucket 2026-04-28: want out=5500 (fee excluded), got %+v", buckets[1])
	}
}

func TestCashflowWeekAndMonth(t *testing.T) {
	txs := []parser.Transaction{
		// 2026-03-28 is Saturday of ISO week 13; 2026-04-19 is Sunday of
		// week 16; 2026-04-20 is Monday of week 17 -> three weekly buckets.
		tx("2026-04-19 18:29:02", "Funds received", 3000, 76079),
		tx("2026-04-20 18:29:02", "Airtime Purchase", -500, 44679),
		tx("2026-03-28 12:00:00", "Funds received", 10000, 632247),
	}
	weekly, err := Cashflow(txs, "week")
	if err != nil {
		t.Fatal(err)
	}
	if len(weekly) != 3 {
		t.Fatalf("want 3 weekly buckets, got %d", len(weekly))
	}
	if weekly[0].Label != "2026-W13" || weekly[1].Label != "2026-W16" || weekly[2].Label != "2026-W17" {
		t.Errorf("weekly labels wrong: %+v", weekly)
	}
	monthly, err := Cashflow(txs, "month")
	if err != nil {
		t.Fatal(err)
	}
	if len(monthly) != 2 || monthly[0].Label != "2026-03" || monthly[1].Label != "2026-04" {
		t.Errorf("monthly buckets wrong: %+v", monthly)
	}
}

func TestCashflowInvalidGranularity(t *testing.T) {
	if _, err := Cashflow(nil, "year"); err == nil {
		t.Error("expected error for invalid granularity")
	}
}

func TestBalanceTrajectoryReversed(t *testing.T) {
	txs := []parser.Transaction{
		tx("2026-04-28 19:55:42", "Airtime Purchase", -500, 44679),
		tx("2026-04-21 18:29:02", "Funds received", 3000, 76079),
		tx("2026-03-28 12:00:00", "Funds received", 10000, 632247),
	}
	points, err := BalanceTrajectory(txs)
	if err != nil {
		t.Fatal(err)
	}
	if points[0].Balance != 632247 || points[len(points)-1].Balance != 44679 {
		t.Errorf("expected chronological order, got %+v", points)
	}
}

func TestCategoryOf(t *testing.T) {
	cases := map[string]string{
		"Pay Bill Charge":                                   "Fees",
		"Overdraft (Charge)":                                "Fees",
		"Fuliza M-Pesa":                                     "Fees",
		"Pay Bill Online to 888880 - KPLC":                  "Pay Bill",
		"Merchant Payment to 7408526 - FAITH NJOKI BACHIA":  "Buy Goods",
		"Customer Transfer to - John":                       "Send Money",
		"Funds received from - Calvin Kamara":               "Receive",
		"Salary Payment from 504900 - NCBA":                 "Receive",
		"Airtime Purchase":                                  "Airtime",
		"Customer Bundle Purchase to 826915Safaricom":       "Bundles",
		"BUNDLES by - 07******192":                          "Bundles",
		"Agent Withdrawal":                                  "Withdraw",
		"ZIIDI MMF by M-PESA\\UnitTrust":                    "Bank & Savings",
		"Hello world":                                       "Other",
	}
	for desc, want := range cases {
		if got := CategoryOf(desc); got != want {
			t.Errorf("CategoryOf(%q) = %q, want %q", desc, got, want)
		}
	}
}

func TestCounterpartyOf(t *testing.T) {
	cases := map[string]string{
		"Merchant Payment to 7408526 - FAITH NJOKI BACHIA":   "FAITH NJOKI BACHIA",
		"Funds received from - 07******752 Calvin Kamara":    "Calvin Kamara",
		"Pay Bill Online to 888880 - KPLC":                   "KPLC",
		"Customer Transfer to - 2547******287 RICHARD NDAYIZEYE": "RICHARD NDAYIZEYE",
		"Airtime Purchase":                                   "",
		"Pay Bill Charge":                                    "",
	}
	for desc, want := range cases {
		if got := CounterpartyOf(desc); got != want {
			t.Errorf("CounterpartyOf(%q) = %q, want %q", desc, got, want)
		}
	}
}

func TestTopCounterparties(t *testing.T) {
	txs := []parser.Transaction{
		tx("2026-04-21 18:29:02", "Funds received from - Calvin Kamara", 3000, 76079),
		tx("2026-04-21 18:28:22", "Funds received from - Calvin Kamara", 10000, 73079),
		tx("2026-04-21 18:08:45", "Merchant Payment to 7408526 - FAITH NJOKI BACHIA", -14400, 63079),
		tx("2026-04-21 17:25:13", "Merchant Payment to 7408526 - FAITH NJOKI BACHIA", -10000, 77479),
		tx("2026-04-21 17:06:40", "Funds received from - Calvin Kamara", 10000, 87479),
	}
	top := TopCounterparties(txs, 1)
	if len(top) != 1 || top[0].Name != "Calvin Kamara" || top[0].Count != 3 {
		t.Errorf("unexpected top: %+v", top)
	}
}

func TestRecurring(t *testing.T) {
	txs := []parser.Transaction{
		tx("2026-04-28 10:00:00", "Pay Bill Online to 888880 - KPLC", -50000, 44679),
		tx("2026-03-28 10:00:00", "Pay Bill Online to 888880 - KPLC", -50000, 44679),
		tx("2026-02-28 10:00:00", "Pay Bill Online to 4131317 - KPLC", -50000, 44679),
		tx("2026-04-27 10:00:00", "Airtime Purchase", -500, 44679),
	}
	rec := Recurring(txs, 3)
	if len(rec) != 1 {
		t.Fatalf("want 1 recurring group, got %d: %+v", len(rec), rec)
	}
	r := rec[0]
	if r.Count != 3 || r.Amount != -50000 {
		t.Errorf("unexpected recurring: %+v", r)
	}
	// Median gap of 28|31 days.
	if r.MedianDays < 28 || r.MedianDays > 31 {
		t.Errorf("unexpected median days: %d", r.MedianDays)
	}
	if r.Pattern != "Pay Bill Online to # - KPLC" {
		t.Errorf("unexpected pattern: %q", r.Pattern)
	}
}
