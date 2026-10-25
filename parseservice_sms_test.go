package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"mpesa-analyzer/internal/categories"
	"mpesa-analyzer/internal/parser"
	"mpesa-analyzer/internal/store"
)

func groupingService(t *testing.T) *ParseService {
	t.Helper()
	s, err := store.New(filepath.Join(t.TempDir(), "statements.db"))
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return &ParseService{store: s}
}

// TestTransactionGroupsFulizaTiebreak locks in that a paired send and its
// Fuliza fee sharing one second-precision timestamp still end the day in
// debt: the "-F" fee row sorts first (newest) and the day header shows the
// net position (-292.00) with the owed amount split out, not the wallet
// zero the send left behind.
func TestTransactionGroupsFulizaTiebreak(t *testing.T) {
	txs := []parser.Transaction{
		{ID: "UJFPC9YWQQ", Date: "2026-10-15 14:40:00", Description: "Merchant Payment to - TERESIA WAKERA MUNENE", Status: "Completed", Amount: -6200, Balance: 0},
		{ID: "UJFPC9YWQQ-F", Date: "2026-10-15 14:40:00", Description: "Fuliza Access Fee", Status: "Completed", Amount: -62, Balance: -29200},
	}
	groups, err := groupingService(t).TransactionGroups(txs)
	if err != nil {
		t.Fatalf("TransactionGroups: %v", err)
	}
	if len(groups) != 1 {
		t.Fatalf("want 1 day group, got %+v", groups)
	}
	if groups[0].EndBalance != -29200 {
		t.Errorf("EndBalance = %d, want -29200 (net position owed)", groups[0].EndBalance)
	}
	if groups[0].EndOwed != 29200 {
		t.Errorf("EndOwed = %d, want 29200", groups[0].EndOwed)
	}
	if len(groups[0].Txs) != 2 || groups[0].Txs[0].ID != "UJFPC9YWQQ-F" {
		t.Errorf("fee row should sort first, got %+v", groups[0].Txs)
	}
}

// TestTransactionGroupsFulizaRepayDay locks in the reported bug: a day
// ending with a Fuliza repayment (wallet balance 0.00) after a disbursement
// must still head the day with the remaining debt. 15 Oct ends with wallet
// 0 and 343.00 owed (393.00 stated minus the 50.00 evening repayment), so
// the header reads Bal -343.00 with Owes 343.00 - never a clean 0.00.
func TestTransactionGroupsFulizaRepayDay(t *testing.T) {
	txs := []parser.Transaction{
		{ID: "UJFBOA99JS", Date: "2026-10-15 07:34:00", Description: "Funds received from - SIMON KANYOI", Status: "Completed", Amount: 20000, Balance: 20000},
		{ID: "UJFPC9XD0T", Date: "2026-10-15 08:00:00", Description: "Fuliza Repayment - Partially Paid", Status: "Completed", Amount: -20000, Balance: 0},
		{ID: "UJFPC9XRKY", Date: "2026-10-15 09:50:00", Description: "Merchant Payment to - TERESIA WAKERA MUNENE", Status: "Completed", Amount: -9000, Balance: 0},
		{ID: "UJFPC9XRKY-F", Date: "2026-10-15 09:50:01", Description: "Fuliza Access Fee", Status: "Completed", Amount: -90, Balance: -22938},
		{ID: "UJFPC9YWQQ", Date: "2026-10-15 14:40:00", Description: "Merchant Payment to - TERESIA WAKERA MUNENE", Status: "Completed", Amount: -6200, Balance: 0},
		{ID: "UJFPC9YWQQ-F", Date: "2026-10-15 14:40:01", Description: "Fuliza Access Fee", Status: "Completed", Amount: -62, Balance: -29200},
		{ID: "UJFPCA1C8X", Date: "2026-10-15 22:14:00", Description: "Pay Bill Online to KPLC PREPAID Acc. 01450540651", Status: "Completed", Amount: -10000, Balance: 0},
		{ID: "UJFPCA1C8X-F", Date: "2026-10-15 22:14:01", Description: "Fuliza Access Fee", Status: "Completed", Amount: -100, Balance: -39300},
		{ID: "UJF85AOSE4", Date: "2026-10-15 23:12:00", Description: "Funds received from - RAY MULAMA", Status: "Completed", Amount: 5000, Balance: 5000},
		{ID: "UJFPCA1DYD", Date: "2026-10-15 23:13:00", Description: "Fuliza Repayment - Partially Paid", Status: "Completed", Amount: -5000, Balance: 0},
		{ID: "UJGPCA1WZ6", Date: "2026-10-16 08:45:00", Description: "Customer Transfer to - Erastus Mukula", Status: "Completed", Amount: -4500, Balance: 0},
		{ID: "UJGPCA1WZ6-F", Date: "2026-10-16 08:45:01", Description: "Fuliza Access Fee", Status: "Completed", Amount: -45, Balance: -38845},
	}
	groups, err := groupingService(t).TransactionGroups(txs)
	if err != nil {
		t.Fatalf("TransactionGroups: %v", err)
	}
	if len(groups) != 2 {
		t.Fatalf("want 2 day groups, got %+v", groups)
	}
	if groups[0].DayKey != "2026-10-16" || groups[0].EndBalance != -38845 || groups[0].EndOwed != 38845 {
		t.Errorf("16 Oct header wrong: %+v", groups[0])
	}
	if groups[1].DayKey != "2026-10-15" || groups[1].EndBalance != -34300 || groups[1].EndOwed != 34300 {
		t.Errorf("15 Oct header wrong: %+v", groups[1])
	}
}

// fixtureBody reads one stored real SMS sample (same fixtures the parser
// tests use).
func fixtureBody(t *testing.T, name string) string {
	t.Helper()
	raw, err := os.ReadFile("internal/sms/testdata/" + name)
	if err != nil {
		t.Fatalf("fixture %s: %v", name, err)
	}
	return strings.TrimSpace(string(raw))
}

// nairobiMilli returns the epoch millis of a UTC wall-clock time.
func nairobiMilli(t *testing.T, y int, mo time.Month, d, h, mi int) int64 {
	t.Helper()
	return time.Date(y, mo, d, h, mi, 0, 0, time.UTC).UnixMilli()
}

func TestImportSmsSingle(t *testing.T) {
	tz := -180 // Nairobi, JS Date.getTimezoneOffset convention
	res := (&ParseService{}).ImportSms([]SmsMessage{{
		ID: "481", Address: "MPESA",
		DateMs:          nairobiMilli(t, 2026, time.September, 12, 11, 53), // 14:53 in Nairobi
		Body:            fixtureBody(t, "01-send-p2p.txt"),
		TzOffsetMinutes: &tz,
	}})
	if res.Imported != 1 || len(res.Txs) != 1 {
		t.Fatalf("imported=%d txs=%d: %+v", res.Imported, len(res.Txs), res)
	}
	want := parser.Transaction{
		ID: "ABCAP6H14J", Date: "2026-09-12 14:53:00",
		Description: "Customer Transfer to - PERSON ONE", Status: "Completed",
		Amount: -4000, Balance: 44049,
	}
	if res.Txs[0] != want {
		t.Errorf("tx:\n got  %+v\n want %+v", res.Txs[0], want)
	}
	r := res.Results[0]
	if r.SourceID != "481" || r.Kind != "imported" || r.Error != "" {
		t.Errorf("result: %+v", r)
	}
}

func TestImportSmsBatchMixed(t *testing.T) {
	tz := -180
	messages := []SmsMessage{
		// Newest first in the input; output must come back time-ascending.
		{ID: "1", DateMs: nairobiMilli(t, 2026, time.September, 13, 9, 0), Body: fixtureBody(t, "12-buy-goods-two.txt"), TzOffsetMinutes: &tz},
		{ID: "2", DateMs: 12345, Body: "ABCAP6ZZZ1 Confirmed. Ksh2,000.00 deposited by AGENT TWO on 8/9/26 at 1:00 PM."}, // unsupported
		{ID: "3", DateMs: 12346, Body: "ABC1234567 Confirmed."},                                                          // malformed: no timestamp
		{ID: "4", DateMs: 12347, Body: "   "},                         // invalid: no body
		{ID: "5", DateMs: 0, Body: fixtureBody(t, "01-send-p2p.txt")}, // invalid: no timestamp
		{ID: "6", DateMs: nairobiMilli(t, 2026, time.September, 12, 9, 0), Body: fixtureBody(t, "02-receive.txt"), TzOffsetMinutes: &tz},
	}
	res := (&ParseService{}).ImportSms(messages)
	if res.Imported != 2 || res.Unsupported != 1 || res.Malformed != 1 || res.Invalid != 2 {
		t.Fatalf("counts wrong: %+v", res)
	}
	if len(res.Txs) != 2 {
		t.Fatalf("got %d transactions, want 2 (good messages must survive bad ones)", len(res.Txs))
	}
	// Ascending received-time order, regardless of input order.
	if res.Txs[0].ID != "ABCAP6LGYW" || res.Txs[1].ID != "ABCAP5YRM1" {
		t.Errorf("order wrong: %s before %s", res.Txs[0].ID, res.Txs[1].ID)
	}
	// Results parallel the sorted transactions: the invalid record (zero
	// timestamp) sorts first, then unsupported, then the two real imports.
	if res.Results[0].SourceID != "5" || res.Results[1].Kind != "unsupported" ||
		res.Results[4].SourceID != "6" || res.Results[5].SourceID != "1" {
		t.Errorf("results misaligned: %+v", res.Results)
	}
}

func TestImportSmsTimezone(t *testing.T) {
	ms := nairobiMilli(t, 2026, time.September, 12, 11, 53) // 14:53 in Nairobi
	mk := func(tz *int) string {
		res := (&ParseService{}).ImportSms([]SmsMessage{{ID: "x", DateMs: ms, Body: fixtureBody(t, "01-send-p2p.txt"), TzOffsetMinutes: tz}})
		if res.Imported != 1 {
			t.Fatalf("import failed: %+v", res)
		}
		return res.Txs[0].Date
	}
	nairobi := -180
	if got := mk(&nairobi); got != "2026-09-12 14:53:00" {
		t.Errorf("Nairobi: got %q, want 2026-09-12 14:53:00", got)
	}
	utc := 0
	if got := mk(&utc); got != "2026-09-12 11:53:00" {
		t.Errorf("UTC: got %q, want 2026-09-12 11:53:00", got)
	}
	// nil falls back to the process local zone - compare against the same
	// conversion done here, so the test holds on any machine.
	want := time.UnixMilli(ms).In(time.Local).Format("2006-01-02 15:04:05")
	if got := mk(nil); got != want {
		t.Errorf("local fallback: got %q, want %q", got, want)
	}
}

func TestImportSmsChargePairKeepsOneTimestamp(t *testing.T) {
	tz := -180
	res := (&ParseService{}).ImportSms([]SmsMessage{{
		ID: "7", DateMs: nairobiMilli(t, 2026, time.September, 8, 9, 37),
		Body: fixtureBody(t, "11-paybill-with-fee.txt"), TzOffsetMinutes: &tz,
	}})
	if len(res.Txs) != 2 {
		t.Fatalf("got %d transactions, want main+charge", len(res.Txs))
	}
	if res.Txs[0].ID != "ABCAP5Z446" || res.Txs[1].ID != "ABCAP5Z446-C" {
		t.Errorf("pair order wrong: %s, %s", res.Txs[0].ID, res.Txs[1].ID)
	}
	for i, want := range []string{"2026-09-08 12:37:00", "2026-09-08 12:37:00"} {
		if res.Txs[i].Date != want {
			t.Errorf("tx %d date %q, want %q", i, res.Txs[i].Date, want)
		}
	}
}

func TestImportSmsDuplicateProviderIDs(t *testing.T) {
	// The provider ID is echoed for UI correlation only; two rows sharing
	// it are processed independently. Cross-import dedup is a later phase
	// and relies on the parser receipt ID, not this value.
	tz := -180
	res := (&ParseService{}).ImportSms([]SmsMessage{
		{ID: "999", DateMs: 1789252380000, Body: fixtureBody(t, "01-send-p2p.txt"), TzOffsetMinutes: &tz},
		{ID: "999", DateMs: 1789252380001, Body: fixtureBody(t, "12-buy-goods-two.txt"), TzOffsetMinutes: &tz},
	})
	if res.Imported != 2 || len(res.Txs) != 2 {
		t.Fatalf("duplicates lost: %+v", res)
	}
	if res.Txs[0].ID != "ABCAP6H14J" || res.Txs[1].ID != "ABCAP5YRM1" {
		t.Errorf("receipt IDs wrong: %s, %s", res.Txs[0].ID, res.Txs[1].ID)
	}
}

func TestImportSmsTimestampBounds(t *testing.T) {
	body := fixtureBody(t, "01-send-p2p.txt")
	res := (&ParseService{}).ImportSms([]SmsMessage{
		{ID: "a", DateMs: -1, Body: body},                         // before epoch
		{ID: "b", DateMs: 0, Body: body},                          // unset
		{ID: "c", DateMs: int64(4102444800000), Body: body},       // year 2100 boundary
		{ID: "d", DateMs: int64(9223372036854775807), Body: body}, // overflow junk
	})
	if res.Invalid != 4 || res.Imported != 0 || len(res.Txs) != 0 {
		t.Errorf("bounds not rejected: %+v", res)
	}
}

func TestImportSmsEmptyBatch(t *testing.T) {
	res := (&ParseService{}).ImportSms(nil)
	if res.Imported != 0 || res.Results == nil || res.Txs == nil {
		t.Errorf("empty batch should return empty non-nil collections: %+v", res)
	}
}

// TestImportSmsResultRetention proves every result keeps its own original
// SMS record: metadata, raw body, and generated transactions stay paired -
// including duplicate provider IDs, missing provider IDs, and every outcome
// kind. The audit inspector depends on this pairing being exact.
func TestImportSmsResultRetention(t *testing.T) {
	tz := -180
	ms := nairobiMilli(t, 2026, time.September, 12, 9, 0)
	messages := []SmsMessage{
		// One tx.
		{ID: "101", Address: "MPESA", DateMs: ms, Body: fixtureBody(t, "01-send-p2p.txt"), TzOffsetMinutes: &tz},
		// Main + charge pair.
		{ID: "101", Address: "MPESA", DateMs: ms + 1, Body: fixtureBody(t, "11-paybill-with-fee.txt"), TzOffsetMinutes: &tz},
		// Unsupported.
		{ID: "", Address: "MPESA", DateMs: ms + 2, Body: "ABCAP6ZZZ1 Confirmed. Ksh2,000.00 deposited by AGENT TWO on 8/9/26 at 1:00 PM. New M-PESA balance is Ksh2,500.00."},
		// Malformed (missing timestamp).
		{ID: "104", Address: "MPESA", DateMs: ms + 3, Body: "ABC1234567 Confirmed. Ksh40.00 sent to X."},
		// Invalid metadata (blank body).
		{ID: "105", Address: "MPESA", DateMs: ms + 4, Body: "   "},
		// Missing provider ID, imported.
		{Address: "MPESA", DateMs: ms + 5, Body: fixtureBody(t, "02-receive.txt"), TzOffsetMinutes: &tz},
	}
	res := (&ParseService{}).ImportSms(messages)
	if len(res.Results) != len(messages) {
		t.Fatalf("got %d results for %d messages", len(res.Results), len(messages))
	}

	wantBody := map[string]string{ // sourceId -> body fragment
		"101|0": "ABCAP6H14J",
		"101|1": "ABCAP5Z446",
		"|2":    "withdrawn from AGENT ONE",
		"104|3": "ABC1234567",
		"105|4": "   ",
		"|5":    "ABCAP6LGYW",
	}
	// Match results to inputs by their echoed metadata, not position.
	found := map[string]bool{}
	for _, r := range res.Results {
		key := r.SourceID + "|" + r.Body[len(r.Body):] // placeholder, replaced below
		_ = key
		switch {
		case strings.Contains(r.Body, "ABCAP6H14J"):
			found["101|0"] = true
			if r.SourceID != "101" || r.Address != "MPESA" || r.DateMs != ms || r.Kind != "imported" {
				t.Errorf("01-send metadata mismatch: %+v", r)
			}
			if len(r.Txs) != 1 || r.Txs[0].ID != "ABCAP6H14J" {
				t.Errorf("01-send transactions wrong: %+v", r.Txs)
			}
		case strings.Contains(r.Body, "ABCAP5Z446"):
			found["101|1"] = true
			if r.SourceID != "101" || r.DateMs != ms+1 || r.Kind != "imported" {
				t.Errorf("paybill metadata mismatch: %+v", r)
			}
			if len(r.Txs) != 2 || r.Txs[0].ID != "ABCAP5Z446" || r.Txs[1].ID != "ABCAP5Z446-C" {
				t.Errorf("paybill pair wrong: %+v", r.Txs)
			}
		case strings.Contains(r.Body, "deposited by AGENT TWO"):
			found["|2"] = true
			if r.SourceID != "" || r.DateMs != ms+2 || r.Kind != "unsupported" {
				t.Errorf("unsupported metadata mismatch: %+v", r)
			}
			if len(r.Txs) != 0 {
				t.Errorf("unsupported must have no transactions: %+v", r.Txs)
			}
		case strings.Contains(r.Body, "ABC1234567"):
			found["104|3"] = true
			if r.SourceID != "104" || r.DateMs != ms+3 || r.Kind != "malformed" {
				t.Errorf("malformed metadata mismatch: %+v", r)
			}
		case strings.TrimSpace(r.Body) == "" && r.SourceID == "105":
			found["105|4"] = true
			if r.Kind != "invalid" || r.DateMs != ms+4 {
				t.Errorf("invalid metadata mismatch: %+v", r)
			}
		case strings.Contains(r.Body, "ABCAP6LGYW"):
			found["|5"] = true
			if r.SourceID != "" || r.DateMs != ms+5 || r.Kind != "imported" {
				t.Errorf("missing-ID metadata mismatch: %+v", r)
			}
			if len(r.Txs) != 1 || r.Txs[0].ID != "ABCAP6LGYW" {
				t.Errorf("missing-ID transactions wrong: %+v", r.Txs)
			}
		}
	}
	for k := range wantBody {
		if !found[k] {
			t.Errorf("result for input %q missing or mispaired", k)
		}
	}
}

func TestRefreshSmsImportMerges(t *testing.T) {
	tz := -180
	s, err := store.New(filepath.Join(t.TempDir(), "statements.db"))
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	p := &ParseService{store: s}
	msg := func(id, fixture string, ms int64) SmsMessage {
		return SmsMessage{ID: id, Address: "MPESA", DateMs: ms, Body: fixtureBody(t, fixture), TzOffsetMinutes: &tz}
	}
	msgA := msg("a", "01-send-p2p.txt", nairobiMilli(t, 2026, time.September, 12, 11, 53))
	msgB := msg("b", "02-receive.txt", nairobiMilli(t, 2026, time.September, 12, 9, 0))

	first, err := p.RefreshSmsImport([]SmsMessage{msgA})
	if err != nil {
		t.Fatalf("refresh: %v", err)
	}
	if len(first.Sims) != 1 {
		t.Fatalf("create: want one SIM, got %+v", first.Sims)
	}
	sim := first.Sims[0]
	if sim.NewCount != 1 || sim.Record == nil || sim.Record.TxCount != 1 {
		t.Fatalf("create: %+v", sim.Record)
	}
	// 01-send-p2p is a customer transfer: receipt-worthy.
	if !sim.Receipt || len(sim.NewTxs) != 1 {
		t.Errorf("create receipt wrong: %+v", sim)
	}
	if sim.Record.Source != store.SourceSms || first.Result.Imported != 1 {
		t.Errorf("record wrong: %+v", sim.Record)
	}
	id := sim.Record.ID

	// Same inbox again: nothing new, same record, no store write needed.
	again, err := p.RefreshSmsImport([]SmsMessage{msgA})
	if err != nil {
		t.Fatalf("re-refresh: %v", err)
	}
	if len(again.Sims) != 1 || again.Sims[0].NewCount != 0 ||
		again.Sims[0].Record.ID != id || again.Sims[0].Record.TxCount != 1 {
		t.Errorf("re-refresh must be a no-op: %+v", again.Sims)
	}

	// One old + one new message: only the new receipt is appended.
	both, err := p.RefreshSmsImport([]SmsMessage{msgB, msgA})
	if err != nil {
		t.Fatalf("merge: %v", err)
	}
	if len(both.Sims) != 1 {
		t.Fatalf("merge: want one SIM, got %+v", both.Sims)
	}
	sim = both.Sims[0]
	if sim.NewCount != 1 || sim.Record.ID != id || sim.Record.TxCount != 2 {
		t.Fatalf("merge wrong: new=%d txs=%d", sim.NewCount, sim.Record.TxCount)
	}
	if len(sim.NewTxs) != 1 || sim.NewTxs[0].ID != sim.Record.Txs[0].ID {
		t.Errorf("new txs wrong: %+v", sim.NewTxs)
	}
	// The only new arrival is inbound (02-receive): merges, no receipt.
	if sim.Receipt {
		t.Errorf("inbound-only arrival must not pop a receipt")
	}
	if sim.Record.Txs[0].ID != "ABCAP6LGYW" || sim.Record.Txs[1].ID != "ABCAP6H14J" {
		t.Errorf("merge order wrong: %s, %s", sim.Record.Txs[0].ID, sim.Record.Txs[1].ID)
	}

	// A snapshot that parses to nothing yields no record at all.
	none, err := p.RefreshSmsImport([]SmsMessage{{ID: "x", DateMs: 1, Body: "   "}})
	if err != nil {
		t.Fatalf("empty: %v", err)
	}
	if len(none.Sims) != 0 {
		t.Errorf("empty snapshot must yield no SIMs: %+v", none.Sims)
	}
}

// TestRefreshSmsImportSeparatesSims pins the dual-SIM contract: each SIM's
// messages merge into their own record, and switching SIM never mixes the
// two wallets.
func TestRefreshSmsImportSeparatesSims(t *testing.T) {
	tz := -180
	s, err := store.New(filepath.Join(t.TempDir(), "statements.db"))
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	p := &ParseService{store: s}

	simOne := func(id, fixture string, ms int64) SmsMessage {
		return SmsMessage{ID: id, Address: "MPESA", DateMs: ms, Body: fixtureBody(t, fixture),
			Slot: 0, SubID: 1, SimLabel: "Safaricom", TzOffsetMinutes: &tz}
	}
	simTwo := func(id, fixture string, ms int64) SmsMessage {
		return SmsMessage{ID: id, Address: "MPESA", DateMs: ms, Body: fixtureBody(t, fixture),
			Slot: 1, SubID: 2, SimLabel: "Airtel", TzOffsetMinutes: &tz}
	}

	out, err := p.RefreshSmsImport([]SmsMessage{
		simOne("a", "01-send-p2p.txt", nairobiMilli(t, 2026, time.September, 12, 11, 53)),
		simTwo("c", "02-receive.txt", nairobiMilli(t, 2026, time.September, 12, 9, 0)),
	})
	if err != nil {
		t.Fatalf("refresh: %v", err)
	}
	if len(out.Sims) != 2 {
		t.Fatalf("want two SIM records, got %+v", out.Sims)
	}
	bySim := map[string]SmsSimRefresh{}
	for _, sim := range out.Sims {
		bySim[sim.SimID] = sim
	}
	one, ok := bySim["sim-0"]
	if !ok || one.Record == nil || one.SimLabel != "Safaricom" || one.Record.TxCount != 1 {
		t.Fatalf("SIM 0 record wrong: %+v", bySim["sim-0"])
	}
	two, ok := bySim["sim-1"]
	if !ok || two.Record == nil || two.SimLabel != "Airtel" || two.Record.TxCount != 1 {
		t.Fatalf("SIM 1 record wrong: %+v", bySim["sim-1"])
	}
	if one.Record.ID == two.Record.ID {
		t.Fatalf("SIMs must not share a record: %s", one.Record.ID)
	}
	if one.Record.SimID != "sim-0" || one.Record.SimLabel != "Safaricom" {
		t.Errorf("record must carry its SIM: %+v", one.Record)
	}
	// Re-reading only SIM 1's message must not touch SIM 0's record.
	only, err := p.RefreshSmsImport([]SmsMessage{simOne("a", "01-send-p2p.txt", nairobiMilli(t, 2026, time.September, 12, 11, 53))})
	if err != nil {
		t.Fatalf("re-refresh: %v", err)
	}
	if len(only.Sims) != 1 || only.Sims[0].SimID != "sim-0" || only.Sims[0].NewCount != 0 {
		t.Errorf("SIM 0 re-refresh wrong: %+v", only.Sims)
	}
}

// TestRefreshSimLabels pins the carrier-name upgrade: wallets imported
// while READ_PHONE_STATE was unavailable carry fallback names, and a
// later SIM-list snapshot renames exactly those records.
func TestRefreshSimLabels(t *testing.T) {
	tz := -180
	s, err := store.New(filepath.Join(t.TempDir(), "statements.db"))
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	p := &ParseService{store: s}

	// No carrier names at import time: records get "SIM 1" / "SIM 2".
	_, err = p.RefreshSmsImport([]SmsMessage{
		{ID: "a", Address: "MPESA", DateMs: nairobiMilli(t, 2026, time.September, 12, 11, 53),
			Body: fixtureBody(t, "01-send-p2p.txt"), Slot: 0, SubID: 1, TzOffsetMinutes: &tz},
		{ID: "c", Address: "MPESA", DateMs: nairobiMilli(t, 2026, time.September, 12, 9, 0),
			Body: fixtureBody(t, "02-receive.txt"), Slot: 1, SubID: 2, TzOffsetMinutes: &tz},
	})
	if err != nil {
		t.Fatalf("refresh: %v", err)
	}

	n, err := p.RefreshSimLabels([]SimCard{
		{SubID: 1, Slot: 0, SimLabel: "Safaricom"},
		{SubID: 2, Slot: 1, SimLabel: "Airtel"},
	})
	if err != nil {
		t.Fatalf("labels: %v", err)
	}
	if n != 2 {
		t.Fatalf("want 2 renames, got %d", n)
	}
	metas, err := s.List()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	bySim := map[string]string{}
	for _, m := range metas {
		bySim[m.SimID] = m.SimLabel
	}
	if bySim["sim-0"] != "Safaricom" || bySim["sim-1"] != "Airtel" {
		t.Errorf("labels wrong: %+v", bySim)
	}

	// Same names again, blank names, and unknown SIMs change nothing.
	n, err = p.RefreshSimLabels([]SimCard{
		{SubID: 1, Slot: 0, SimLabel: "Safaricom"},
		{SubID: 2, Slot: 1, SimLabel: ""},
		{SubID: 9, Slot: 5, SimLabel: "Telkom"},
	})
	if err != nil {
		t.Fatalf("re-labels: %v", err)
	}
	if n != 0 {
		t.Errorf("want 0 renames, got %d", n)
	}
}

// TestRefreshSimLabelsMigratesSubKeys pins the grant-later path: a wallet
// imported by subscription id (slot unknown, no phone-state grant) moves
// onto its slot key once the SIM list resolves it, so later imports merge
// into the same record instead of opening a second one.
func TestRefreshSimLabelsMigratesSubKeys(t *testing.T) {
	tz := -180
	s, err := store.New(filepath.Join(t.TempDir(), "statements.db"))
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	p := &ParseService{store: s}

	// Slot unknown at import time: subscription-keyed record, fallback name.
	out, err := p.RefreshSmsImport([]SmsMessage{
		{ID: "a", Address: "MPESA", DateMs: nairobiMilli(t, 2026, time.September, 12, 11, 53),
			Body: fixtureBody(t, "01-send-p2p.txt"), Slot: -1, SubID: 7, TzOffsetMinutes: &tz},
	})
	if err != nil {
		t.Fatalf("refresh: %v", err)
	}
	if len(out.Sims) != 1 || out.Sims[0].SimID != "sub-7" {
		t.Fatalf("want one sub-keyed SIM, got %+v", out.Sims)
	}
	id := out.Sims[0].Record.ID

	n, err := p.RefreshSimLabels([]SimCard{{SubID: 7, Slot: 0, SimLabel: "Calvin"}})
	if err != nil {
		t.Fatalf("labels: %v", err)
	}
	if n != 1 {
		t.Fatalf("want 1 change, got %d", n)
	}
	rec, err := s.Get(id)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if rec.SimID != "sim-0" || rec.SimLabel != "Calvin" {
		t.Errorf("record must move to the slot key with the new name: %+v", rec)
	}
	if rec.TxCount != 1 {
		t.Errorf("migration must not touch transactions: %+v", rec)
	}

	// A later import for the same SIM merges into the moved record.
	again, err := p.RefreshSmsImport([]SmsMessage{
		{ID: "a", Address: "MPESA", DateMs: nairobiMilli(t, 2026, time.September, 12, 11, 53),
			Body: fixtureBody(t, "01-send-p2p.txt"), Slot: 0, SubID: 7, SimLabel: "Calvin", TzOffsetMinutes: &tz},
	})
	if err != nil {
		t.Fatalf("re-refresh: %v", err)
	}
	if len(again.Sims) != 1 || again.Sims[0].Record.ID != id || again.Sims[0].NewCount != 0 {
		t.Errorf("post-grant import must merge into the moved record: %+v", again.Sims)
	}
}

// TestRefreshSimLabelsKeepsClaimedSlotKeys ensures a subscription-keyed
// record is renamed but never moved when its slot key is already taken by
// another record - the older one stays as a snapshot.
func TestRefreshSimLabelsKeepsClaimedSlotKeys(t *testing.T) {
	tz := -180
	s, err := store.New(filepath.Join(t.TempDir(), "statements.db"))
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	p := &ParseService{store: s}

	msgs := []SmsMessage{
		{ID: "a", Address: "MPESA", DateMs: nairobiMilli(t, 2026, time.September, 12, 11, 53),
			Body: fixtureBody(t, "01-send-p2p.txt"), Slot: 0, SubID: 7, SimLabel: "Old", TzOffsetMinutes: &tz},
		{ID: "c", Address: "MPESA", DateMs: nairobiMilli(t, 2026, time.September, 12, 9, 0),
			Body: fixtureBody(t, "02-receive.txt"), Slot: -1, SubID: 9, TzOffsetMinutes: &tz},
	}
	if _, err := p.RefreshSmsImport(msgs); err != nil {
		t.Fatalf("refresh: %v", err)
	}

	// Sub 9's card claims slot 0, which sim-0 already owns.
	n, err := p.RefreshSimLabels([]SimCard{{SubID: 9, Slot: 0, SimLabel: "New"}})
	if err != nil {
		t.Fatalf("labels: %v", err)
	}
	if n != 2 {
		t.Fatalf("want 2 renames, got %d", n)
	}
	metas, err := s.List()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	bySim := map[string]string{}
	for _, m := range metas {
		bySim[m.SimID] = m.SimLabel
	}
	if bySim["sim-0"] != "New" || bySim["sub-9"] != "New" {
		t.Errorf("both wallets take the current name, sub-9 keeps its key: %+v", bySim)
	}
}

// TestParseServiceCategoryAssignment walks the whole binding path: create a
// category, assign it to one merchant with "apply to similar", and confirm the
// prepared rows carry it - then reopen the store and confirm the assignment
// survives a restart (the promise that rules live outside statement rows).
func TestParseServiceCategoryAssignment(t *testing.T) {
	path := filepath.Join(t.TempDir(), "statements.db")
	s, err := store.New(path)
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	p := &ParseService{store: s}

	food, err := p.CreateCategory("Food", "🍔")
	if err != nil {
		t.Fatalf("CreateCategory: %v", err)
	}
	txs := []parser.Transaction{
		{ID: "R1", Date: "2026-10-15 12:00:00", Description: "Merchant Payment to 7408526 - FAITH NJOKI BACHIA", Status: "Completed", Amount: -100, Balance: 0},
		{ID: "R2", Date: "2026-10-14 12:00:00", Description: "Merchant Payment to 999 - FAITH NJOKI BACHIA 0712544752", Status: "Completed", Amount: -200, Balance: 0},
		{ID: "R3", Date: "2026-10-13 12:00:00", Description: "Agent Withdrawal", Status: "Completed", Amount: -300, Balance: 0},
	}
	key := categories.CounterpartyKey(txs[0].Description)
	if err := p.AssignCategory("R1", "till", key, food.ID, true); err != nil {
		t.Fatalf("AssignCategory: %v", err)
	}

	assertAssigned := func(groups []DayGroup) {
		t.Helper()
		seen := 0
		for _, g := range groups {
			for _, tx := range g.Txs {
				if tx.CustomCategoryID != "" {
					seen++
					if tx.CustomCategoryID != food.ID || tx.CustomCategoryEmoji != "🍔" {
						t.Errorf("%s category = %+v", tx.ID, tx)
					}
				}
			}
		}
		if seen != 2 {
			t.Errorf("assigned rows = %d, want R1 and R2 (R3 has no counterparty)", seen)
		}
	}

	groups, err := p.TransactionGroups(txs)
	if err != nil {
		t.Fatalf("TransactionGroups: %v", err)
	}
	assertAssigned(groups)

	if err := s.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}
	reopened, err := store.New(path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	t.Cleanup(func() { reopened.Close() })
	groups, err = (&ParseService{store: reopened}).TransactionGroups(txs)
	if err != nil {
		t.Fatalf("TransactionGroups after restart: %v", err)
	}
	assertAssigned(groups)
}
