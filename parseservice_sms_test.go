package main

import (
	"os"
	"strings"
	"testing"
	"time"

	"mpesa-analyzer/internal/parser"
)

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
	// nil falls back to the process local zone — compare against the same
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
// SMS record: metadata, raw body, and generated transactions stay paired —
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
