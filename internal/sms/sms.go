// Package sms parses Safaricom M-Pesa confirmation SMS messages into the
// same parser.Transaction shape the PDF statement parser produces. It is an
// adapter between Safaricom's SMS wording and the statement format: the
// descriptions it emits deliberately use the exact leading phrases the
// internal/txtype classifier already knows ("Customer Transfer to - ...",
// "Funds received from - ...", "Pay Bill Online to ...", and so on), so SMS
// transactions flow through the existing analysis pipeline unchanged.
//
// Only message shapes backed by real samples are supported. Unknown shapes
// (agent withdrawals, deposits, Fuliza, reversals, ...) are rejected with
// ErrUnsupported rather than guessed at.
package sms

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"mpesa-analyzer/internal/parser"
)

var (
	// ErrUnsupported means the text is not a confirmed M-Pesa transaction
	// SMS of a shape we have real samples for. The message is left alone
	// rather than mis-parsed.
	ErrUnsupported = errors.New("sms: unsupported message format")
	// ErrMalformed means the text looks like a confirmation SMS but is
	// missing required fields or contains invalid values.
	ErrMalformed = errors.New("sms: malformed confirmation SMS")
	// ErrNonTransactional means the SMS is an operational M-Pesa notice
	// (wrong PIN, opted out of Fuliza, cancelled transaction, ...) with no
	// financial transaction to represent. Not an error in the data — the
	// message is simply not a transaction.
	ErrNonTransactional = errors.New("sms: non-transactional M-Pesa message")
)

var (
	// Every confirmation SMS opens with the receipt number immediately
	// followed by "Confirmed." — with or without the space after it, and
	// either case ("TIQAP5NXT1 confirmed."). The receipt class stays
	// case-sensitive so a stray word before "confirmed" can never become
	// a receipt ID.
	reHeader = regexp.MustCompile(`^([A-Z0-9]{6,})\s*[Cc]onfirmed\.?\s*`)

	// Amounts always read "Ksh" (or "Ksh.", any casing: fixtures include
	// "KSH100.00") then a comma-grouped value with two decimals. The first
	// match in the body is the transaction amount; balances and costs are
	// matched by their own anchors below.
	reAmount = regexp.MustCompile(`(?i)Ksh\.?\s*([\d,]+\.\d{2})`)

	// "d/m/yy" or "d/m/yyyy" plus 12-hour time, with " at " optional
	// ("11/9/26 12:57 PM") and trailing punctuation optional
	// ("PM.New M-PESA balance ...").
	reStamp = regexp.MustCompile(`(?i)(\d{1,2})/(\d{1,2})/(\d{4}|\d{2})(?:\s+at)?\s+(\d{1,2}):(\d{2})\s*([AP])M`)

	// The M-PESA wallet balance line. Must anchor on M-PESA/MPESA (with an
	// optional "account" word) or a bare "New balance" so the M-Shwari
	// savings balance ("M-Shwari balance is ...", "New M-Shwari saving
	// account balance is ...") is never taken as the wallet balance.
	// Variants seen in real samples:
	//   "New M-PESA balance is", "M-PESA balance is",
	//   "New MPESA balance is", "M-PESA account balance is",
	//   "New balance is"
	reBalance = regexp.MustCompile(`(?i)(?:M-?PESA(?:\s+account)?\s+balance|New\s+balance)\s+is\s+Ksh\.?\s*([\d,]+\.\d{2})`)

	// "Transaction cost, Ksh5.00" and "Transaction cost Ksh.0.00" both occur.
	reCost = regexp.MustCompile(`(?i)Transaction cost,?\s*Ksh\.?\s*([\d,]+\.\d{2})`)

	// Fuliza disbursements read "Fuliza M-PESA amount is Ksh X. Access Fee
	// charged Ksh Y. ..." (any casing, "Ksh." variant). Only the access
	// fee becomes a transaction — the principal is already covered by the
	// paired send-money SMS sharing the same receipt number.
	reFulizaPrincipal = regexp.MustCompile(`(?i)Fuliza\s+M-?PESA\s+amount\s+is\s+Ksh\.?\s*([\d,]+\.\d{2})`)
	reFulizaFee       = regexp.MustCompile(`(?i)Access\s+Fee\s+charged\s+Ksh\.?\s*([\d,]+\.\d{2})`)
	// "Total Fuliza M-PESA outstanding amount is Ksh Z" — the running debt
	// after this advance, principal plus access fee included.
	reFulizaOutstanding = regexp.MustCompile(`(?i)Total\s+Fuliza\s+M-?PESA\s+outstanding\s+amount\s+is\s+Ksh\.?\s*([\d,]+\.\d{2})`)
)

// Statement-style descriptions, matching the Details column of real
// M-Pesa statements (verified against test_data PDFs).
const (
	descTransfer        = "Customer Transfer to - %s"
	descReceive         = "Funds received from - %s"
	descMerchant        = "Merchant Payment to - %s"
	descPaybill         = "Pay Bill Online to %s Acc. %s"
	descBundles         = "Customer Bundle Purchase to %s"
	descMShwari         = "M-Shwari Deposit"  // moving wallet money into M-Shwari
	descMShwariOut      = "M-Shwari Withdraw" // M-Shwari money coming back (statement convention)
	descAgentWithdrawal = "Agent Withdrawal from - %s"
	descAirtime         = "Airtime Purchase for %s"
	descAirtimePlain    = "Airtime Purchase" // audit sample: no recipient in the message
	descReversal        = "Reversal of transaction %s"

	// Charge rows. The statement prints fees as their own rows with these
	// exact descriptions; real samples evidence them for customer
	// transfers, pay bill payments and agent withdrawals.
	chargeTransfer   = "Customer Transfer of Funds Charge"
	chargePaybill    = "Pay Bill Charge"
	chargeWithdrawal = "Withdrawal Charge"

	// Fuliza rows. The disbursement emits only the access fee (the
	// principal duplicates the paired send-money SMS); repayments emit the
	// amount taken from M-PESA toward the outstanding Fuliza balance.
	descFulizaFee          = "Fuliza Access Fee"
	descFulizaRepayFull    = "Fuliza Repayment - Fully Paid"
	descFulizaRepayPartial = "Fuliza Repayment - Partially Paid"
	descFulizaRepay        = "Fuliza Repayment"
)

// nonTransactional are operational M-Pesa messages with no financial
// transaction (real samples: failed PIN, Fuliza opt-out, processing
// failure, insufficient funds, incorrect till, cancelled transaction).
// They are classified before the receipt header gate because most carry no
// "Confirmed" header at all.
var nonTransactional = []struct{ phrase, reason string }{
	{"entered the wrong pin", "wrong-PIN failure notice"},
	{"opted out of fuliza", "Fuliza opt-out notice"},
	{"unable to process your request", "processing failure notice"},
	{"insufficient funds", "insufficient funds notice"},
	{"till number entered is incorrect", "incorrect till notice"},
	{"you have cancelled the transaction", "cancelled transaction notice"},
}

// ParseMessage converts one confirmation SMS into one or two transactions:
// the main transaction, plus a charge transaction when the SMS reports a
// non-zero transaction cost on a supported charge kind. It returns an error
// (never a panic) for anything it cannot represent.
func ParseMessage(text string) ([]parser.Transaction, error) {
	t := strings.TrimSpace(text)
	if t == "" {
		return nil, fmt.Errorf("%w: empty message", ErrMalformed)
	}
	lower := strings.ToLower(t)
	for _, nt := range nonTransactional {
		if strings.Contains(lower, nt.phrase) {
			return nil, fmt.Errorf("%w: %s", ErrNonTransactional, nt.reason)
		}
	}

	hdr := reHeader.FindStringSubmatchIndex(t)
	if hdr == nil {
		// A "Confirmed" without the receipt header is a broken
		// confirmation; anything else is simply not our format.
		if strings.Contains(strings.ToLower(t), "confirmed") {
			return nil, fmt.Errorf("%w: missing receipt number header", ErrMalformed)
		}
		return nil, ErrUnsupported
	}
	id := t[hdr[2]:hdr[3]]
	body := t[hdr[1]:]

	// Fuliza messages carry no d/m/yy transaction timestamp (only a "due
	// on DD/MM/YY" date, or none at all), so they are handled before the
	// mandatory timestamp check below. Date is left empty: ImportSms
	// overwrites it with the SMS received time.
	if strings.Contains(lower, "fuliza") {
		if fulizaTxs, ok, err := parseFuliza(id, body); ok || err != nil {
			return fulizaTxs, err
		}
		// "Fuliza" mentioned but neither a disbursement nor a repayment
		// shape — fall through to the normal path.
	}

	// Required: transaction amount (first Ksh value in the body).
	amountMatch := reAmount.FindStringSubmatch(body)
	if amountMatch == nil {
		return nil, fmt.Errorf("%w: missing amount", ErrMalformed)
	}
	amount, err := parser.ParseMoney(amountMatch[1])
	if err != nil {
		return nil, fmt.Errorf("%w: bad amount: %v", ErrMalformed, err)
	}

	// Required: transaction timestamp.
	stamp := reStamp.FindStringSubmatch(body)
	if stamp == nil {
		return nil, fmt.Errorf("%w: missing transaction timestamp", ErrMalformed)
	}
	stampStart := reStamp.FindStringSubmatchIndex(body)[0]
	date, err := parseStamp(stamp)
	if err != nil {
		return nil, err
	}
	// Some real formats (agent withdrawal) put the timestamp before the
	// amount, so structure markers are searched over the whole body; party
	// extraction stays anchored on the timestamp position.
	fullLower := strings.ToLower(body)

	// Optional: wallet balance. Zero when absent — the model has no
	// unknown marker, and inventing a value would corrupt balance charts.
	var balance int64
	if m := reBalance.FindStringSubmatch(body); m != nil {
		balance, err = parser.ParseMoney(m[1])
		if err != nil {
			return nil, fmt.Errorf("%w: bad balance: %v", ErrMalformed, err)
		}
	}

	// Optional: transaction cost.
	var cost int64
	if m := reCost.FindStringSubmatch(body); m != nil {
		cost, err = parser.ParseMoney(m[1])
		if err != nil {
			return nil, fmt.Errorf("%w: bad transaction cost: %v", ErrMalformed, err)
		}
	}

	// Classify by complete message structure, not single keywords.
	var desc string
	var chargeDesc string
	isIn := false
	switch {
	case strings.Contains(fullLower, "you have received"):
		sender, ok := partyAfter(body, stampStart, " from ")
		if !ok {
			return nil, fmt.Errorf("%w: received message missing sender", ErrMalformed)
		}
		desc = fmt.Sprintf(descReceive, sender)
		isIn = true

	case strings.Contains(fullLower, "transferred from m-shwari account"):
		desc = descMShwariOut
		isIn = true

	case strings.Contains(fullLower, "transferred to m-shwari account"):
		desc = descMShwari

	case strings.Contains(fullLower, "reversal of transaction"):
		ref, ok := reversalReference(body)
		if !ok {
			return nil, fmt.Errorf("%w: reversal missing original receipt", ErrMalformed)
		}
		desc = fmt.Sprintf(descReversal, ref)
		isIn = true

	case strings.Contains(fullLower, "of airtime"):
		// Real samples come both with a recipient ("...of airtime for
		// 2547...") and without one ("You bought Ksh20.00 of airtime on
		// ..."). When no recipient is present, none is invented.
		if phone, ok := airtimeRecipient(body, stampStart); ok {
			desc = fmt.Sprintf(descAirtime, phone)
		} else {
			desc = descAirtimePlain
		}

	case indexFold(body, "withdraw") >= 0 && indexFold(body, " from ") >= 0:
		agent, ok := agentFrom(body, stampStart)
		if !ok {
			return nil, fmt.Errorf("%w: withdrawal missing agent", ErrMalformed)
		}
		desc = fmt.Sprintf(descAgentWithdrawal, agent)
		chargeDesc = chargeWithdrawal

	case strings.Contains(fullLower, "you have sent"):
		// "You have sent Ksh31.38 to Hustler Fund on ..." — the inverted
		// send wording (no "sent to").
		recipient, ok := partyAfter(body, stampStart, " to ")
		if !ok {
			return nil, fmt.Errorf("%w: sent message missing recipient", ErrMalformed)
		}
		desc = fmt.Sprintf(descTransfer, recipient)

	default:
		recipient, account, verb, ok := payee(body, stampStart)
		if !ok {
			return nil, fmt.Errorf("%w: no supported transaction structure", ErrUnsupported)
		}
		switch verb {
		case "paid to":
			// "Ksh599.00 paid to SHOP ONE TRM 24." — a till (Buy Goods).
			desc = fmt.Sprintf(descMerchant, recipient)
		case "sent to":
			if strings.Contains(strings.ToLower(recipient), "bundle") ||
				strings.Contains(strings.ToLower(recipient), "safaricom offers") {
				// Real statements print Safaricom product payments as
				// bundle purchases ("Customer Bundle Purchase to
				// 826915Safaricom Offers by - ..."), not pay bill rows.
				desc = fmt.Sprintf(descBundles, recipient)
				if account != "" {
					desc += " - " + account
				}
			} else if account != "" {
				// "sent to X for account Y" is an account/payment bill.
				desc = fmt.Sprintf(descPaybill, recipient, account)
				chargeDesc = chargePaybill
			} else {
				// Plain "sent to" with no account is a person-to-person send.
				desc = fmt.Sprintf(descTransfer, recipient)
				chargeDesc = chargeTransfer
			}
		}
	}

	if !isIn {
		// Everything but received money is paid out of the wallet.
		amount = -amount
	}

	main := parser.Transaction{
		ID:          id,
		Date:        date,
		Description: desc,
		Status:      "Completed",
		Amount:      amount,
		Balance:     balance,
	}
	txs := []parser.Transaction{main}

	// A charge is emitted only where real statements evidence the charge
	// description (customer transfers, pay bill). Merchant, bundle and
	// M-Shwari charges have no sample yet; adding a guessed description
	// would pollute the fee analysis with an invented category.
	if cost > 0 && chargeDesc != "" {
		txs = append(txs, parser.Transaction{
			// "-C" suffix keeps the pair deterministic and unique while
			// staying tied to the SMS's one receipt number.
			ID:          id + "-C",
			Date:        date,
			Description: chargeDesc,
			Status:      "Completed",
			Amount:      -cost,
			// The SMS shows one balance after both movements; that final
			// value is the only honest balance either row can carry.
			Balance: balance,
		})
	}
	return txs, nil
}

// parseFuliza handles the three sample-backed Fuliza shapes, none of which
// carries a transaction timestamp. It returns ok=false when the body is not
// a recognized Fuliza shape (the caller falls through to the normal path).
// A recognized shape with missing fields is malformed, never guessed at.
//
//   - Disbursement ("Fuliza M-PESA amount is Ksh X. Access Fee charged Ksh
//     Y. Total ... outstanding ... Ksh Z"): one fee transaction, ID
//     "<receipt>-F" (the paired send-money SMS owns the base receipt ID),
//     balance -Z (the debt owed, fee included).
//   - Repayment ("Ksh X ... has been used to fully/partially pay your
//     outstanding Fuliza M-PESA. ... M-PESA balance is Ksh Z"): one
//     transaction for the amount taken, ID "<receipt>", balance Z (the
//     wallet after the sweep; a full repayment clears the debt, a partial
//     leaves the wallet at ~0 with the remainder unstated in the SMS).
func parseFuliza(id, body string) (txs []parser.Transaction, ok bool, err error) {
	lower := strings.ToLower(body)

	// Repayments: "... has been used to fully/partially pay your
	// outstanding Fuliza M-PESA. ..."
	if strings.Contains(lower, "pay your outstanding fuliza") ||
		strings.Contains(lower, "pay your fuliza") {
		var desc string
		switch {
		case strings.Contains(lower, "fully pay") || strings.Contains(lower, "full pay"):
			desc = descFulizaRepayFull
		case strings.Contains(lower, "partially pay") || strings.Contains(lower, "partial pay"):
			desc = descFulizaRepayPartial
		default:
			desc = descFulizaRepay
		}
		m := reAmount.FindStringSubmatch(body)
		if m == nil {
			return nil, true, fmt.Errorf("%w: fuliza repayment missing paid amount", ErrMalformed)
		}
		paid, err := parser.ParseMoney(m[1])
		if err != nil {
			return nil, true, fmt.Errorf("%w: bad fuliza repayment amount: %v", ErrMalformed, err)
		}
		balance, err := fulizaBalance(body)
		if err != nil {
			return nil, true, err
		}
		return []parser.Transaction{{
			ID:          id,
			Date:        "",
			Description: desc,
			Status:      "Completed",
			Amount:      -paid,
			Balance:     balance,
		}}, true, nil
	}

	// Disbursement: "Fuliza M-PESA amount is Ksh X. Access Fee charged
	// Ksh Y. Total Fuliza M-PESA outstanding amount is Ksh Z. ..."
	// One fee transaction for the access fee. Its balance is the NEGATED
	// outstanding (-Z): using Fuliza puts the wallet in debt to M-Pesa,
	// and the outstanding already includes the access fee — that is the
	// amount owed. (No wallet balance line exists on disbursements; the
	// wallet sits at ~0 after the paired send.)
	if strings.Contains(lower, "access fee") || reFulizaPrincipal.MatchString(body) {
		if !reFulizaPrincipal.MatchString(body) {
			return nil, true, fmt.Errorf("%w: fuliza disbursement missing principal amount", ErrMalformed)
		}
		m := reFulizaFee.FindStringSubmatch(body)
		if m == nil {
			return nil, true, fmt.Errorf("%w: fuliza disbursement missing access fee", ErrMalformed)
		}
		fee, err := parser.ParseMoney(m[1])
		if err != nil {
			return nil, true, fmt.Errorf("%w: bad fuliza access fee: %v", ErrMalformed, err)
		}
		o := reFulizaOutstanding.FindStringSubmatch(body)
		if o == nil {
			return nil, true, fmt.Errorf("%w: fuliza disbursement missing outstanding amount", ErrMalformed)
		}
		outstanding, err := parser.ParseMoney(o[1])
		if err != nil {
			return nil, true, fmt.Errorf("%w: bad fuliza outstanding amount: %v", ErrMalformed, err)
		}
		return []parser.Transaction{{
			ID:          id + "-F",
			Date:        "",
			Description: descFulizaFee,
			Status:      "Completed",
			Amount:      -fee,
			Balance:     -outstanding,
		}}, true, nil
	}

	return nil, false, nil
}

// fulizaBalance extracts the wallet balance from a Fuliza message. Zero when
// absent (disbursements carry no balance line) — the model has no unknown
// marker, and inventing a value would corrupt balance charts.
func fulizaBalance(body string) (int64, error) {
	if m := reBalance.FindStringSubmatch(body); m != nil {
		balance, err := parser.ParseMoney(m[1])
		if err != nil {
			return 0, fmt.Errorf("%w: bad balance: %v", ErrMalformed, err)
		}
		return balance, nil
	}
	return 0, nil
}

// parseStamp converts a reStamp match into the application date format
// "2006-01-02 15:04:05". Two-digit years read as 20yy; four-digit years
// ("05/06/2026 at 07:20 PM") are taken as given.
func parseStamp(m []string) (string, error) {
	day, _ := strconv.Atoi(m[1])
	month, _ := strconv.Atoi(m[2])
	year := atoi(m[3])
	if len(m[3]) == 2 {
		year += 2000
	}
	hour, _ := strconv.Atoi(m[4])
	minute, _ := strconv.Atoi(m[5])

	if hour > 12 {
		return "", fmt.Errorf("%w: invalid hour %q", ErrMalformed, m[4])
	}
	if strings.EqualFold(m[6], "P") {
		if hour < 12 {
			hour += 12
		}
	} else if hour == 12 {
		hour = 0
	}

	tm := time.Date(year, time.Month(month), day, hour, minute, 0, 0, time.UTC)
	if tm.Day() != day || int(tm.Month()) != month {
		return "", fmt.Errorf("%w: invalid calendar date %s/%s/%s", ErrMalformed, m[1], m[2], m[3])
	}
	return fmt.Sprintf("%04d-%02d-%02d %02d:%02d:00", year, month, day, hour, minute), nil
}

// partyAfter extracts the counterparty named between marker and the
// timestamp (e.g. "You have received Ksh403.00 from COMPANY ONE 4072221 on
// <date>" → "COMPANY ONE 4072221").
func partyAfter(body string, stampStart int, marker string) (string, bool) {
	lead := body[:stampStart]
	idx := indexFold(lead, marker)
	if idx < 0 {
		return "", false
	}
	return cleanParty(lead[idx+len(marker):]), true
}

// payee classifies an outflow by its payment verb and, when present, the
// "for account" clause. It returns the recipient, the account (empty when
// absent), the verb found, and whether any supported structure was found.
func payee(body string, stampStart int) (recipient, account, verb string, ok bool) {
	lead := body[:stampStart]

	best := -1
	for _, v := range []string{" paid to ", " sent to "} {
		if i := indexFold(lead, v); i >= 0 && (best < 0 || i < best) {
			best, verb = i, strings.TrimSpace(v)
		}
	}
	if best < 0 {
		return "", "", "", false
	}
	// Skip past "<verb> " (the trimmed verb plus one separating space).
	segment := cleanParty(lead[best+len(verb)+1:])
	if segment == "" {
		return "", "", "", false
	}

	if i := indexFold(segment, " for account "); i >= 0 {
		return cleanParty(segment[:i]), cleanParty(segment[i+len(" for account "):]), verb, true
	}
	return segment, "", verb, true
}

// reversalReference extracts the original receipt number from "Reversal of
// transaction <REF> has been ...". The reversal SMS carries its own receipt
// number in the header; this is the transaction being undone — the two must
// never be confused.
func reversalReference(body string) (string, bool) {
	i := indexFold(body, "reversal of transaction ")
	if i < 0 {
		return "", false
	}
	start := i + len("reversal of transaction ")
	rel := indexFold(body[start:], " has been")
	if rel <= 0 {
		return "", false
	}
	ref := strings.TrimSpace(body[start : start+rel])
	if ref == "" {
		return "", false
	}
	return ref, true
}

// airtimeRecipient extracts the airtime recipient phone number: the text
// between "of airtime for" and the timestamp.
func airtimeRecipient(body string, stampStart int) (string, bool) {
	i := indexFold(body, "of airtime for")
	if i < 0 {
		return "", false
	}
	phone := cleanParty(body[i+len("of airtime for") : stampStart])
	if phone == "" {
		return "", false
	}
	return phone, true
}

// agentFrom extracts the agent/till/reference text of a withdrawal: the
// text after " from " up to the timestamp (when it follows) or the wallet
// balance line, whichever comes first. The real withdrawal sample puts the
// timestamp before the amount ("...at 8:38 PMWithdraw Ksh700.00 from
// AGENT ... New M-PESA balance is ..."), so there the balance line is the
// boundary and its lead ("New M-PESA") is trimmed off the agent text.
func agentFrom(body string, stampStart int) (string, bool) {
	fromIdx := indexFold(body, " from ")
	if fromIdx < 0 {
		return "", false
	}
	start := fromIdx + len(" from ")
	end := len(body)
	if stampStart > fromIdx {
		end = stampStart
	}
	if b := indexFold(body, " balance is"); b > start && b < end {
		end = b
	}
	seg := cleanParty(body[start:end])
	if seg == "" {
		return "", false
	}
	lowerSeg := strings.ToLower(seg)
	for _, suffix := range []string{"new m-pesa", "new mpesa", "m-pesa", "mpesa", "new"} {
		if strings.HasSuffix(lowerSeg, suffix) {
			seg = strings.TrimSpace(seg[:len(seg)-len(suffix)])
			lowerSeg = strings.ToLower(seg)
		}
	}
	if seg == "" {
		return "", false
	}
	return seg, true
}

// indexFold finds needle in s case-insensitively, returning a byte index
// valid for s itself. Searching a strings.ToLower copy and reusing its
// indexes on the original is wrong for non-ASCII text: ToLower can change
// byte length (İ lowers to two runes), shifting every later index and
// corrupting the slice bounds.
func indexFold(s, needle string) int {
	n := len(needle)
	for i := 0; i+n <= len(s); i++ {
		if strings.EqualFold(s[i:i+n], needle) {
			return i
		}
	}
	return -1
}

// cleanParty normalizes a counterparty. Every parsed party sits directly
// before the timestamp, so it may carry the trailing " on" preposition and
// sentence periods from the SMS wording ("SHOP ONE TRM 24. on ...").
func cleanParty(s string) string {
	s = strings.Join(strings.Fields(s), " ")
	if strings.HasSuffix(strings.ToLower(s), " on") {
		s = s[:len(s)-3]
	}
	return strings.TrimRight(s, ". ")
}

func atoi(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}
