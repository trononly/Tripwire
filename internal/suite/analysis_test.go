package suite

import (
	. "mpesa-analyzer/internal/analysis"
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

func TestBalanceTrajectoryScrambledInput(t *testing.T) {
	// SMS imports arrive oldest-first, statements newest-first, and the
	// trajectory must not trust either: output is chronological regardless.
	chronological := []parser.Transaction{
		tx("2026-03-28 12:00:00", "Funds received", 10000, 632247),
		tx("2026-04-21 18:29:02", "Funds received", 3000, 76079),
		tx("2026-04-28 19:55:42", "Airtime Purchase", -500, 44679),
	}
	orders := [][]parser.Transaction{
		chronological,
		{chronological[2], chronological[1], chronological[0]},
		{chronological[1], chronological[2], chronological[0]},
	}
	for i, in := range orders {
		points, err := BalanceTrajectory(in)
		if err != nil {
			t.Fatal(err)
		}
		if len(points) != 3 ||
			points[0].Balance != 632247 ||
			points[1].Balance != 76079 ||
			points[2].Balance != 44679 {
			t.Errorf("order %d: want chronological, got %+v", i, points)
		}
	}
}

func TestTotalsOutIsPositive(t *testing.T) {
	txs := []parser.Transaction{
		tx("2026-04-28 19:55:42", "Airtime Purchase", -500, 44679),
		tx("2026-04-28 17:27:36", "Pay Bill Online to 888880 - KPLC", -5000, 45179),
		tx("2026-04-21 18:29:02", "Funds received from - Calvin", 3000, 76079),
		tx("2026-04-21 17:06:40", "Pay Bill Charge", -300, 87479),
	}
	got := TotalsOf(txs)
	if got.TotalOut != 5500 {
		t.Errorf("TotalOut = %d, want positive 5500", got.TotalOut)
	}
	// 3000 in, 5500 out, 300 fees.
	if got.Net != -2800 {
		t.Errorf("Net = %d, want -2800", got.Net)
	}
}

// TestFulizaAccessFeeIsAFee locks in that the SMS-derived "Fuliza Access
// Fee" (which carries no "Charge" word) is accounted as a fee: excluded
// from totals/cashflow spend, included in TotalFees - exactly like the
// statement charge rows.
func TestFulizaAccessFeeIsAFee(t *testing.T) {
	txs := []parser.Transaction{
		tx("2026-04-28 19:55:42", "Airtime Purchase", -500, 44679),
		tx("2026-04-28 17:27:36", "Fuliza Access Fee", -155, 44679),
	}
	in, out := TotalAmount(txs)
	if in != 0 || out != 500 {
		t.Errorf("TotalAmount = (%d, %d), want (0, 500)", in, out)
	}
	if fees := TotalFees(txs); fees != 155 {
		t.Errorf("TotalFees = %d, want 155", fees)
	}
	buckets, err := Cashflow(txs, "day")
	if err != nil {
		t.Fatal(err)
	}
	if len(buckets) != 1 || buckets[0].Out != 500 {
		t.Errorf("cashflow should exclude the fee, got %+v", buckets)
	}
}

func TestCategoryOf(t *testing.T) {
	cases := map[string]string{
		"Pay Bill Charge":                                  "Fees",
		"Overdraft (Charge)":                               "Fees",
		"Fuliza M-Pesa":                                    "Fees",
		"Pay Bill Online to 888880 - KPLC":                 "Pay Bill",
		"Merchant Payment to 7408526 - FAITH NJOKI BACHIA": "Buy Goods",
		"Customer Transfer to - John":                      "Send Money",
		"Funds received from - Calvin Kamara":              "Receive",
		"Salary Payment from 504900 - NCBA":                "Receive",
		"Airtime Purchase":                                 "Airtime",
		"Customer Bundle Purchase to 826915Safaricom":      "Bundles",
		"BUNDLES by - 07******192":                         "Bundles",
		"Agent Withdrawal":                                 "Withdraw",
		"ZIIDI MMF by M-PESA\\UnitTrust":                   "Bank & Savings",
		"Hello world":                                      "Other",
	}
	for desc, want := range cases {
		if got := CategoryOf(desc); got != want {
			t.Errorf("CategoryOf(%q) = %q, want %q", desc, got, want)
		}
	}
}

func TestCounterpartyOf(t *testing.T) {
	cases := map[string]string{
		"Merchant Payment to 7408526 - FAITH NJOKI BACHIA":       "FAITH NJOKI BACHIA",
		"Funds received from - 07******752 Calvin Kamara":        "Calvin Kamara",
		"Pay Bill Online to 888880 - KPLC":                       "KPLC",
		"Customer Transfer to - 2547******287 RICHARD NDAYIZEYE": "RICHARD NDAYIZEYE",
		"Airtime Purchase": "",
		"Pay Bill Charge":  "",
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

func TestTopCounterpartiesMergesCaseAndMasking(t *testing.T) {
	// Same person, three spellings: casing plus masked/unmasked numbers
	// must aggregate under the most common original form.
	txs := []parser.Transaction{
		tx("2026-04-21 18:29:02", "Customer Transfer to - Calvin Kamara 0712544752", -6500, 1),
		tx("2026-04-21 18:28:22", "Customer Transfer to - Calvin Kamara 0712***752", -6500, 1),
		tx("2026-04-21 18:08:45", "Customer Transfer to - CALVIN KAMARA 0141663900", -6500, 1),
		tx("2026-04-21 18:02:45", "Customer Transfer to - Calvin Kamara 0712544752", -6500, 1),
		tx("2026-04-21 18:08:45", "Merchant Payment to 7408526 - Faith Njoki Bachia", -14400, 1),
	}
	top := TopCounterparties(txs, 8)
	if len(top) != 2 {
		t.Fatalf("want 2 counterparties, got %+v", top)
	}
	if top[0].Name != "Calvin Kamara 0712544752" || top[0].Count != 4 {
		t.Errorf("merged entry wrong: %+v", top[0])
	}
}

func TestTopCounterpartiesExcludesSafaricomSystem(t *testing.T) {
	// Safaricom's own products are plumbing, not counterparties: Ziidi
	// unit-trust rows, Safaricom Offers bundle rows (which extract only the
	// account name), and M-Shwari/Fuliza-style names must all stay out.
	txs := []parser.Transaction{
		tx("2026-04-21 18:29:02", "Unit Trust Invest To 4145555 - ZIIDI MMF by M-PESA\\UnitTrust", -5000, 1),
		tx("2026-04-21 18:28:22", "Unit Trust Invest To 4145555 - ZIIDI MMF by M-PESA\\UnitTrust", -5000, 1),
		tx("2026-04-21 18:08:45", "Customer Bundle Purchase to Safaricom Offers - Tunukiwa", -1000, 1),
		tx("2026-04-21 18:02:45", "Customer Bundle Purchase to Safaricom Offers - Tunukiwa", -1000, 1),
		tx("2026-04-21 17:06:40", "Funds received from - Calvin Kamara", 3000, 1),
	}
	top := TopCounterparties(txs, 8)
	if len(top) != 1 || top[0].Name != "Calvin Kamara" || top[0].Count != 1 {
		t.Errorf("system counterparties should be excluded, got %+v", top)
	}
}
