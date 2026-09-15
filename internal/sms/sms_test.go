package sms

import (
	"errors"
	"os"
	"strings"
	"testing"

	"mpesa-analyzer/internal/parser"
	"mpesa-analyzer/internal/txtype"
)

// fixture reads one stored real SMS sample.
func fixture(t *testing.T, name string) string {
	t.Helper()
	raw, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatalf("fixture %s: %v", name, err)
	}
	return strings.TrimSpace(string(raw))
}

// TestRealSamples parses every real M-Pesa SMS fixture and verifies the
// full transaction contract (ID, Date, Amount, Balance, Status,
// Description, charge rows) plus the integration contract: the generated
// description must classify correctly under the EXISTING txtype
// classifier — no SMS-specific classification exists.
func TestRealSamples(t *testing.T) {
	tests := []struct {
		name  string
		file  string
		want  []parser.Transaction
		types []txtype.TransactionType
		cats  []string
	}{
		{
			name: "p2p send",
			file: "01-send-p2p.txt",
			want: []parser.Transaction{
				{ID: "ABCAP6H14J", Date: "2026-09-12 14:53:00", Description: "Customer Transfer to - PERSON ONE", Status: "Completed", Amount: -4000, Balance: 44049},
			},
			types: []txtype.TransactionType{txtype.TypeSendMoney},
			cats:  []string{"Send Money"},
		},
		{
			name: "received money",
			file: "02-receive.txt",
			want: []parser.Transaction{
				{ID: "ABCAP6LGYW", Date: "2026-09-13 16:24:00", Description: "Funds received from - COMPANY ONE 4072221", Status: "Completed", Amount: 40300, Balance: 74349},
			},
			types: []txtype.TransactionType{txtype.TypeReceive},
			cats:  []string{"Receive"},
		},
		{
			name: "buy goods",
			file: "03-buy-goods.txt",
			want: []parser.Transaction{
				{ID: "ABCAP8GWSP", Date: "2026-06-18 20:01:00", Description: "Merchant Payment to - SHOP ONE TRM 24", Status: "Completed", Amount: -59900, Balance: 180623},
			},
			types: []txtype.TransactionType{txtype.TypeTill},
			cats:  []string{"Buy Goods"},
		},
		{
			name: "paybill with account",
			file: "04-paybill.txt",
			want: []parser.Transaction{
				{ID: "ABCAP66TPO", Date: "2026-09-10 08:01:00", Description: "Pay Bill Online to COMPANY TWO C2B Acc. P5RNFR", Status: "Completed", Amount: -7300, Balance: 33049},
			},
			types: []txtype.TransactionType{txtype.TypePaybill},
			cats:  []string{"Pay Bill"},
		},
		{
			name: "KPLC prepaid is a pay bill",
			file: "05-kplc-prepaid.txt",
			want: []parser.Transaction{
				{ID: "ABCAP6CS4C", Date: "2026-09-11 15:22:00", Description: "Pay Bill Online to KPLC PREPAID Acc. 01450540651", Status: "Completed", Amount: -10000, Balance: 82049},
			},
			types: []txtype.TransactionType{txtype.TypePaybill},
			cats:  []string{"Pay Bill"},
		},
		{
			name: "safaricom offers is a bundle purchase",
			file: "06-safaricom-offers.txt",
			want: []parser.Transaction{
				{ID: "ABCAP69LX9", Date: "2026-09-10 19:16:00", Description: "Customer Bundle Purchase to Safaricom Offers - Tunukiwa", Status: "Completed", Amount: -1000, Balance: 30549},
			},
			types: []txtype.TransactionType{txtype.TypeBundles},
			cats:  []string{"Bundles"},
		},
		{
			name: "postpaid bundles",
			file: "07-postpaid-bundles.txt",
			want: []parser.Transaction{
				{ID: "ABCAP65X5Z", Date: "2026-09-09 21:46:00", Description: "Customer Bundle Purchase to SAFARICOM POSTPAID BUNDLES - SHook Data Daily", Status: "Completed", Amount: -2900, Balance: 40349},
			},
			types: []txtype.TransactionType{txtype.TypeBundles},
			cats:  []string{"Bundles"},
		},
		{
			name: "buy goods, inconsistent whitespace",
			file: "08-buy-goods-whitespace.txt",
			want: []parser.Transaction{
				{ID: "ABCAP652B4", Date: "2026-09-09 19:07:00", Description: "Merchant Payment to - Pizza Inn TRM", Status: "Completed", Amount: -99900, Balance: 17360},
			},
			types: []txtype.TransactionType{txtype.TypeTill},
			cats:  []string{"Buy Goods"},
		},
		{
			name: "received money, timestamp without at",
			file: "09-receive-no-at.txt",
			want: []parser.Transaction{
				{ID: "ABCAP6C3NS", Date: "2026-09-11 12:57:00", Description: "Funds received from - COMPANY THREE", Status: "Completed", Amount: 86200, Balance: 97049},
			},
			types: []txtype.TransactionType{txtype.TypeReceive},
			cats:  []string{"Receive"},
		},
		{
			name: "m-shwari transfer, no space before balance period, Ksh. cost variant",
			file: "10-mshwari.txt",
			want: []parser.Transaction{
				{ID: "ABCAP62T60", Date: "2026-09-09 10:01:00", Description: "M-Shwari Deposit", Status: "Completed", Amount: -1500000, Balance: 160760},
			},
			types: []txtype.TransactionType{txtype.TypeSavings},
			cats:  []string{"Bank & Savings"},
		},
		{
			name: "paybill with non-zero transaction cost emits a charge row",
			file: "11-paybill-with-fee.txt",
			want: []parser.Transaction{
				{ID: "ABCAP5Z446", Date: "2026-09-08 12:37:00", Description: "Pay Bill Online to COMPANY FOUR C2B Acc. GTQR920", Status: "Completed", Amount: -15000, Balance: 46160},
				{ID: "ABCAP5Z446-C", Date: "2026-09-08 12:37:00", Description: "Pay Bill Charge", Status: "Completed", Amount: -500, Balance: 46160},
			},
			types: []txtype.TransactionType{txtype.TypePaybill, txtype.TypeFees},
			cats:  []string{"Pay Bill", "Fees"},
		},
		{
			name: "buy goods with zero fee",
			file: "12-buy-goods-two.txt",
			want: []parser.Transaction{
				{ID: "ABCAP5YRM1", Date: "2026-09-08 11:00:00", Description: "Merchant Payment to - SHOP TWO", Status: "Completed", Amount: -70000, Balance: 61660},
			},
			types: []txtype.TransactionType{txtype.TypeTill},
			cats:  []string{"Buy Goods"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseMessage(fixture(t, tt.file))
			if err != nil {
				t.Fatalf("ParseMessage: %v", err)
			}
			if len(got) != len(tt.want) {
				t.Fatalf("got %d transactions, want %d", len(got), len(tt.want))
			}
			for i, want := range tt.want {
				if got[i] != want {
					t.Errorf("transaction %d:\n got  %+v\n want %+v", i, got[i], want)
				}
				if ttype := txtype.TypeOf(got[i].Description); ttype != tt.types[i] {
					t.Errorf("txtype.TypeOf(%q) = %q, want %q", got[i].Description, ttype, tt.types[i])
				}
				if cat := txtype.CategoryOf(got[i].Description); cat != tt.cats[i] {
					t.Errorf("txtype.CategoryOf(%q) = %q, want %q", got[i].Description, cat, tt.cats[i])
				}
			}
		})
	}
}

// TestVariations covers structural variations without dedicated fixtures:
// optional fields missing, transfer fees, 12-hour boundaries.
func TestVariations(t *testing.T) {
	tests := []struct {
		name string
		sms  string
		want []parser.Transaction
	}{
		{
			// Real send without balance line, cost line, or marketing tail.
			name: "optional fields absent",
			sms:  "ABCAP6H14J Confirmed. Ksh40.00 sent to PERSON ONE on 12/9/26 at 2:53 PM.",
			want: []parser.Transaction{
				{ID: "ABCAP6H14J", Date: "2026-09-12 14:53:00", Description: "Customer Transfer to - PERSON ONE", Status: "Completed", Amount: -4000, Balance: 0},
			},
		},
		{
			// A person-to-person send with a real fee: the statement calls
			// that charge row "Customer Transfer of Funds Charge".
			name: "send with transfer charge",
			sms:  "ABCAP5AAAA Confirmed. Ksh1,000.00 sent to JOHN DOE on 8/9/26 at 12:37 AM. New M-PESA balance is Ksh10,000.00. Transaction cost, Ksh7.00.",
			want: []parser.Transaction{
				{ID: "ABCAP5AAAA", Date: "2026-09-08 00:37:00", Description: "Customer Transfer to - JOHN DOE", Status: "Completed", Amount: -100000, Balance: 1000000},
				{ID: "ABCAP5AAAA-C", Date: "2026-09-08 00:37:00", Description: "Customer Transfer of Funds Charge", Status: "Completed", Amount: -700, Balance: 1000000},
			},
		},
		{
			name: "midnight is 12:00 AM, noon is 12:00 PM",
			sms:  "ABCAP5BBBB Confirmed. Ksh5.00 sent to A on 1/1/26 at 12:00 AM.",
			want: []parser.Transaction{
				{ID: "ABCAP5BBBB", Date: "2026-01-01 00:00:00", Description: "Customer Transfer to - A", Status: "Completed", Amount: -500, Balance: 0},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseMessage(tt.sms)
			if err != nil {
				t.Fatalf("ParseMessage: %v", err)
			}
			if len(got) != len(tt.want) {
				t.Fatalf("got %d transactions, want %d", len(got), len(tt.want))
			}
			for i, want := range tt.want {
				if got[i] != want {
					t.Errorf("transaction %d:\n got  %+v\n want %+v", i, got[i], want)
				}
			}
		})
	}
}

// TestMalformed covers confirmation-shaped messages that must be rejected,
// not guessed at. Every failure must be one of the two sentinel errors.
func TestMalformed(t *testing.T) {
	tests := []struct {
		name string
		sms  string
		want error
	}{
		{name: "empty", sms: "   ", want: ErrMalformed},
		{name: "confirmed without receipt header", sms: "Confirmed. Ksh40.00 sent to X on 12/9/26 at 2:53 PM.", want: ErrMalformed},
		{name: "missing amount", sms: "ABC1234567 Confirmed. sent to PERSON ONE on 12/9/26 at 2:53 PM.", want: ErrMalformed},
		{name: "amount without decimals", sms: "ABC1234567 Confirmed. Ksh40 sent to PERSON ONE on 12/9/26 at 2:53 PM.", want: ErrMalformed},
		{name: "missing timestamp", sms: "ABC1234567 Confirmed. Ksh40.00 sent to PERSON ONE.", want: ErrMalformed},
		{name: "impossible month", sms: "ABC1234567 Confirmed. Ksh40.00 sent to PERSON ONE on 12/13/26 at 2:53 PM.", want: ErrMalformed},
		{name: "impossible day", sms: "ABC1234567 Confirmed. Ksh40.00 sent to PERSON ONE on 31/2/26 at 2:53 PM.", want: ErrMalformed},
		{name: "hour over 12", sms: "ABC1234567 Confirmed. Ksh40.00 sent to PERSON ONE on 12/9/26 at 13:53 PM.", want: ErrMalformed},
		{name: "received without sender", sms: "ABC1234567 Confirmed.You have received Ksh403.00 on 13/9/26 at 4:24 PM.", want: ErrMalformed},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseMessage(tt.sms)
			if got != nil {
				t.Errorf("expected no transactions, got %+v", got)
			}
			if !errors.Is(err, tt.want) {
				t.Errorf("error = %v, want %v", err, tt.want)
			}
		})
	}
}

// TestUnsupported covers real M-Pesa message shapes with no sample-backed
// parsing rule yet: they must be refused, never half-parsed.
func TestUnsupported(t *testing.T) {
	tests := []struct {
		name string
		sms  string
	}{
		{
			name: "agent withdrawal",
			sms:  "ABCAP6ZZZ1 Confirmed. Ksh1,000.00 withdrawn from AGENT ONE on 8/9/26 at 1:00 PM. New M-PESA balance is Ksh500.00. Transaction cost, Ksh11.00.",
		},
		{
			name: "agent deposit",
			sms:  "ABCAP6ZZZ2 Confirmed. Ksh2,000.00 deposited by AGENT TWO on 8/9/26 at 1:00 PM. New M-PESA balance is Ksh2,500.00.",
		},
		{
			name: "fuliza",
			sms:  "ABCAP6ZZZ3 Confirmed. Fuliza amount repaid Ksh500.00 on 8/9/26 at 1:00 PM. New M-PESA balance is Ksh300.00.",
		},
		{
			// No real reversal sample yet; a reversal wording without a
			// supported payment structure must not be half-parsed.
			name: "reversal without payment structure",
			sms:  "ABCAP6ZZZ4 Confirmed. Reversal of Ksh40.00 on 12/9/26 at 2:53 PM. New M-PESA balance is Ksh440.49.",
		},
		{
			name: "not an m-pesa message",
			sms:  "Hey, are you coming tomorrow?",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseMessage(tt.sms)
			if got != nil {
				t.Errorf("expected no transactions, got %+v", got)
			}
			if !errors.Is(err, ErrUnsupported) {
				t.Errorf("error = %v, want %v", err, ErrUnsupported)
			}
		})
	}
}

// TestNoPanic throws junk at the parser; any panic fails the test. Every
// input must produce either transactions or an error.
func TestNoPanic(t *testing.T) {
	inputs := []string{
		"",
		"\x00\x01\x02",
		"Ksh Ksh Ksh",
		"ABC1234567 Confirmed.",
		"ABC1234567 Confirmed. Ksh",
		"ABC1234567 Confirmed. Ksh40.00 sent to on //:",
		"ABC1234567 Confirmed. Ksh999999999999999999999,999.99 sent to X on 12/9/26 at 2:53 PM.",
		strings.Repeat("ABC1234567 Confirmed. Ksh40.00 sent to X on 12/9/26 at 2:53 PM. ", 500),
		"ABC1234567 Confirmed. Ksh40.00 sent to \u4f60\u597d on 12/9/26 at 2:53 PM. \u65b0\u4f59\u989d Ksh440.49",
	}
	for i, in := range inputs {
		t.Run(quote(i), func(t *testing.T) {
			got, err := ParseMessage(in)
			if got != nil && err != nil {
				t.Errorf("both transactions and error returned")
			}
		})
	}
}

func quote(i int) string {
	return "input " + string(rune('a'+i))
}
