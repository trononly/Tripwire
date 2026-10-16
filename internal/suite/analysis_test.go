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

// TestFeesByTypeFuliza locks in the Insights fee-radar split: the Fuliza
// access fee gets its own row rather than dissolving into the total.
func TestFeesByTypeFuliza(t *testing.T) {
	txs := []parser.Transaction{
		tx("2026-10-15 09:50:00", "Fuliza Access Fee", -90, -22938),
		tx("2026-10-15 14:40:00", "Fuliza Access Fee", -62, -29200),
		tx("2026-10-15 14:40:00", "Pay Bill Charge", -500, 0),
		tx("2026-10-15 14:40:00", "Merchant Payment to - SHOP", -6200, 0),
	}
	got := FeesByType(txs)
	byKey := map[string]FeeTotal{}
	for _, f := range got {
		byKey[f.Key] = f
	}
	fuliza, ok := byKey["fuliza"]
	if !ok || fuliza.Amount != 152 || fuliza.Count != 2 {
		t.Errorf("fuliza breakdown wrong: %+v", byKey)
	}
	if paybill, ok := byKey["paybill"]; !ok || paybill.Amount != 500 || paybill.Count != 1 {
		t.Errorf("paybill breakdown wrong: %+v", byKey)
	}
	if len(got) != 2 || got[0].Key != "paybill" {
		t.Errorf("breakdown should sort largest first, got %+v", got)
	}
}

// TestFulizaOutstanding locks in the debt estimate: the latest stated
// outstanding (fee already folded in by Safaricom) minus repayments after
// it. The October thread ends owing 292.00 with no later repayment.
func TestFulizaOutstanding(t *testing.T) {
	txs := []parser.Transaction{
		tx("2026-10-15 07:34:00", "Funds received from - SIMON", 20000, 20000),
		tx("2026-10-15 08:00:00", "Fuliza Repayment - Partially Paid", -20000, 0),
		tx("2026-10-15 09:50:00", "Fuliza Access Fee", -90, -22938),
		tx("2026-10-15 14:40:00", "Fuliza Access Fee", -62, -29200),
	}
	if got := FulizaOutstanding(txs); got != 29200 {
		t.Errorf("FulizaOutstanding = %d, want 29200", got)
	}

	// A repayment after the latest disbursement reduces the estimate.
	later := append(append([]parser.Transaction{}, txs...),
		tx("2026-10-16 08:00:00", "Fuliza Repayment - Partially Paid", -10000, 0))
	if got := FulizaOutstanding(later); got != 19200 {
		t.Errorf("FulizaOutstanding after repay = %d, want 19200", got)
	}

	if got := FulizaOutstanding(nil); got != 0 {
		t.Errorf("FulizaOutstanding with no disbursement = %d, want 0", got)
	}
}

// TestLedgerNetPosition walks the October Fuliza thread: wallet cash and
// debt stay on separate ledgers and each point nets them. The 50.00 evening
// repayment leaves wallet 0 with 343.00 owed (393.00 stated minus 50.00),
// never a clean zero.
func TestLedgerNetPosition(t *testing.T) {
	txs := []parser.Transaction{
		tx("2026-10-15 07:34:00", "Funds received from - SIMON", 20000, 20000),
		tx("2026-10-15 08:00:00", "Fuliza Repayment - Partially Paid", -20000, 0),
		tx("2026-10-15 09:50:00", "Merchant Payment to - TERESIA", -9000, 0),
		tx("2026-10-15 09:50:01", "Fuliza Access Fee", -90, -22938),
		tx("2026-10-15 23:12:00", "Funds received from - RAY", 5000, 5000),
		tx("2026-10-15 23:13:00", "Fuliza Repayment - Partially Paid", -5000, 0),
	}
	pts := Ledger(txs)
	if len(pts) != len(txs) {
		t.Fatalf("want %d points, got %d", len(txs), len(pts))
	}
	last := pts[len(pts)-1]
	if last.Wallet != 0 || last.Debt != 17938 || last.Net != -17938 {
		t.Errorf("end state wrong: %+v, want wallet 0 debt 17938 net -17938", last)
	}
	net, owed := DayLedger(txs)
	if net["2026-10-15"] != -17938 || owed["2026-10-15"] != 17938 {
		t.Errorf("day ledger wrong: net=%d owed=%d", net["2026-10-15"], owed["2026-10-15"])
	}
}

// TestLedgerFullRepayZeroes locks in that a full repayment clears the debt
// ledger even when the paid amount trails accrued charges.
func TestLedgerFullRepayZeroes(t *testing.T) {
	txs := []parser.Transaction{
		tx("2026-10-15 09:50:01", "Fuliza Access Fee", -90, -22938),
		tx("2026-10-15 10:00:00", "Fuliza Repayment - Fully Paid", -22900, 100),
	}
	pts := Ledger(txs)
	last := pts[len(pts)-1]
	if last.Debt != 0 || last.Wallet != 100 || last.Net != 100 {
		t.Errorf("full repay must zero debt: %+v", last)
	}
}

// TestLedgerNoFulizaUnchanged locks in that datasets without Fuliza rows
// behave exactly as before: net equals each row's balance.
func TestLedgerNoFulizaUnchanged(t *testing.T) {
	txs := []parser.Transaction{
		tx("2026-04-21 18:29:02", "Funds received from - Calvin", 3000, 76079),
		tx("2026-04-28 19:55:42", "Airtime Purchase", -500, 44679),
	}
	pts := Ledger(txs)
	if pts[0].Net != 76079 || pts[1].Net != 44679 {
		t.Errorf("nets wrong: %+v", pts)
	}
	if open, close := OpeningClosingBalance(txs); open != 76079 || close != 44679 {
		t.Errorf("open/close = (%d, %d), want (76079, 44679)", open, close)
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
