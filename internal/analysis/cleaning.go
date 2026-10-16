package analysis

import (
	"regexp"
	"strings"

	"mpesa-analyzer/internal/counterparty"
	"mpesa-analyzer/internal/parser"
)

// Server-side name cleaning. M-Pesa descriptions wrap the useful detail in
// boilerplate ("Merchant Payment to 5525368 - SAMOSA WORLD KENYA LIMITED").
// SplitTransaction reduces one row to a short display name plus the
// till/paybill/payer reference number, so the frontend never has to parse
// descriptions or truncate long IDs itself.

const (
	MaxNameLen = 40
	MaxRefLen  = 24
)

// toFromRE matches the standard shapes "to|from <till> - <payload>" and
// "to|from - <payload>". Group 1 is the till/paybill number when present,
// group 2 the payload after the separator. For "from|to - <masked> <name>"
// the masked number rides inside the payload and is peeled off afterwards.
var toFromRE = regexp.MustCompile(`(?i)\b(?:to|from)\s*(?:([\d*]+)\s+)?-\s+(.+)$`)

// bundleByRE matches the "… by - <masked> <name>" tail that Safaricom data
// bundle purchases use instead of the "to <till> - <name>" shape.
var bundleByRE = regexp.MustCompile(`(?i)\bby\s*-\s*(?:[\d*]+\s+)?(.+)$`)

// tillRE finds the till/paybill number in a "to <number>" fragment. The
// trailing boundary is intentionally absent: real bundle descriptions glue
// the till to the merchant name ("to 826915Safaricom Offers"), and \b
// between the digits and the name would fail to match.
var tillRE = regexp.MustCompile(`(?i)\bto\s+([\d]{3,})`)

// tailCutRE strips known boilerplate tails from extracted names, e.g.
// " via API. Original conversation ID is FTC260330HEOX.", " Acc. 01450540651"
// or " Money Transfer Acc. 0180291641400". "money transfer acc." is matched
// before the bare "acc." so a bank's "…Money Transfer Acc. 0180…" collapses
// to the bank name, while a merchant merely called "Quick Money Transfer" is
// left intact.
var tailCutRE = regexp.MustCompile(`(?i)\s*(?:via api|app to customer|money transfer acc\.|by m-|acc\.).*$`)

// shortNames maps whole boilerplate-only descriptions to a short label.
var shortNames = map[string]string{
	"customer transfer of funds charge":  "Transfer charge",
	"pay bill charge":                    "Paybill charge",
	"airtime purchase":                   "Airtime",
	"m-shwari deposit":                   "M-Shwari",
	"m-shwari withdraw":                  "M-Shwari",
	"agent withdrawal":                   "Withdrawal",
	"atm withdrawal":                     "Withdrawal",
	"agent deposit":                      "Deposit",
	"atm deposit":                        "Deposit",
	"fuliza m-pesa":                      "Fuliza",
	"fuliza remittance to mobile wallet": "Fuliza",
	"fuliza access fee":                  "Fuliza fee",
	"fuliza repayment - fully paid":      "Fuliza repaid",
	"fuliza repayment - partially paid":  "Fuliza partial",
	"fuliza repayment":                   "Fuliza",
}

// boilerPrefixes are leading phrases dropped when no counterparty shape
// matched and the description is not a known short name.
var boilerPrefixes = []string{
	"merchant payment online to ", "merchant payment to ",
	"pay bill online to ", "pay bill to ",
	"customer payment to small business to ", "customer transfer to ",
	"customer bundle purchase to ",
	"funds received from ", "salary payment from ", "business payment from ",
	"send money reversal via api from ",
	"unit trust invest to ", "unit trust withdraw from ",
	"transfer from bank ", "bank transfer to ", "bank transfer from ",
}

// truncate caps s at max characters (runes, not bytes, so multibyte text
// is never split), appending an ellipsis when cut.
func truncate(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	if max <= 1 {
		return string(r[:1])
	}
	return string(r[:max-1]) + "…"
}

// cutTails strips known boilerplate tails plus the stray punctuation the
// cut can leave behind ("IM BANK LIMITED- " -> "IM BANK LIMITED").
func cutTails(name string) string {
	name = tailCutRE.ReplaceAllString(name, "")
	for {
		n := strings.TrimSpace(name)
		n = strings.TrimSuffix(n, "-")
		n = strings.TrimSuffix(n, ".")
		n = strings.TrimSuffix(n, ",")
		if n == name {
			break
		}
		name = n
	}
	return name
}

// stripMaskedLead removes leading masked phone numbers ("07******752 Calvin
// Kamara" -> "Calvin Kamara") and returns the first one as masked.
func stripMaskedLead(name string) (rest, masked string) {
	for {
		fields := strings.Fields(name)
		if len(fields) < 2 || !counterparty.IsMaskedNumber(fields[0]) {
			break
		}
		if masked == "" {
			masked = fields[0]
		}
		name = strings.TrimSpace(strings.TrimPrefix(name, fields[0]))
	}
	return name, masked
}

// leadingRefRE matches a bare reference number directly after a boilerplate
// prefix, e.g. "Transfer from Bank 517819 - IM BANK LIMITED" -> ref 517819.
var leadingRefRE = regexp.MustCompile(`^([\d*]+)\s+-\s+(.+)$`)

// boilerPayload splits a description that opens with one of the known
// counterparty-bearing phrases but carries no "to <num> - <name>" shape:
// "Transfer from Bank 517819 - IM BANK LIMITED- APP to Customer via API"
// yields the reference "517819" and the raw payload "IM BANK LIMITED- APP
// to Customer via API". ok is false when no prefix matches.
func boilerPayload(desc string) (ref, payload string, ok bool) {
	lower := strings.ToLower(desc)
	for _, prefix := range boilerPrefixes {
		if !strings.HasPrefix(lower, prefix) {
			continue
		}
		rest := strings.TrimSpace(desc[len(prefix):])
		if m := leadingRefRE.FindStringSubmatch(rest); m != nil {
			return strings.TrimSpace(m[1]), strings.TrimSpace(m[2]), true
		}
		return "", rest, true
	}
	return "", "", false
}

// stripBoiler drops a leading boilerplate phrase and returns the remainder.
func stripBoiler(desc string) string {
	if _, payload, ok := boilerPayload(desc); ok {
		return counterpartyTail(payload)
	}
	return truncate(desc, MaxNameLen)
}

// counterpartyTail cleans a raw counterparty payload: trims boilerplate
// tails, a dangling separator and stray punctuation.
func counterpartyTail(payload string) string {
	name := cutTails(strings.TrimSpace(payload))
	name = strings.TrimLeft(name, "- ")
	return truncate(strings.TrimSpace(name), MaxNameLen)
}

// CounterpartyName is the cleaned display name of the counterparty behind a
// description, or "" when the row names none (charges, airtime, Fuliza).
// Unlike CounterpartyOf it also copes with the tail-heavy descriptions and
// the bank shapes that carry no "to <num> - <name>" separator:
//
//	"Salary Payment from 504900 - NCBA BANK via API. ..."      -> "NCBA BANK"
//	"Bank Transfer to Co-operative Bank Money Transfer Acc. …" -> "Co-operative Bank"
//	"Transfer from Bank 517819 - IM BANK LIMITED- APP ..."     -> "IM BANK LIMITED"
//	"Merchant Payment to 8526277 - JUMIA . Acc. zAWQDz"        -> "JUMIA"
//
// Statement boilerplate ("via API", "Acc.", "by M-PESA", "Money Transfer")
// is trimmed here, so the same bank or merchant reads the same in the list
// rows, in the search index and in the dashboard aggregations.
func CounterpartyName(description string) string {
	desc := strings.TrimSpace(description)
	if _, payload := shapedPayload(desc); payload != "" {
		return counterpartyTail(payload)
	}
	if _, payload, ok := boilerPayload(desc); ok {
		return counterpartyTail(payload)
	}
	return ""
}

// shapedPayload splits a description into its till/paybill/payer number and
// the payload after the separator, for the shapes "to|from <till> - <payload>"
// and "to|from - <masked> <name>". The masked number of the second shape is
// peeled off the payload and returned as the reference instead. Both return
// values are "" when the description matches no counterparty shape.
func shapedPayload(desc string) (ref, payload string) {
	if m := toFromRE.FindStringSubmatch(desc); m != nil {
		ref = strings.TrimSpace(m[1])
		payload = strings.TrimSpace(m[2])
		cleaned, lead := stripMaskedLead(payload)
		payload = cleaned
		if ref == "" {
			ref = lead
		}
		return ref, payload
	}
	if m := bundleByRE.FindStringSubmatch(desc); m != nil {
		cleaned, lead := stripMaskedLead(strings.TrimSpace(m[1]))
		payload = cleaned
		if lead != "" {
			ref = lead
		} else if t := tillRE.FindStringSubmatch(desc); t != nil {
			ref = t[1]
		}
	}
	return ref, payload
}

// ReferenceNumber returns the till/paybill/payer number carried by a
// description, or "" when it names none. Unlike SplitTransaction's reference
// it never falls back to the receipt number, so aggregation callers can tell
// "no number in the description" from "no transaction at all".
func ReferenceNumber(tx parser.Transaction) string {
	desc := strings.TrimSpace(tx.Description)
	if ref, _ := shapedPayload(desc); ref != "" {
		return ref
	}
	if ref, _, ok := boilerPayload(desc); ok {
		return ref
	}
	return ""
}

// SplitTransaction cleans one transaction into the display name and
// reference number for the transaction list. reference is the
// till/paybill/payer number when the description carries one, falling back
// to the transaction's receipt number.
func SplitTransaction(tx parser.Transaction) (name, reference string) {
	desc := strings.TrimSpace(tx.Description)

	if _, payload := shapedPayload(desc); payload != "" {
		name = counterpartyTail(payload)
	} else if short, ok := shortNames[strings.ToLower(desc)]; ok {
		// No counterparty shape: known short labels, else stripped boilerplate.
		name = short
	} else {
		name = stripBoiler(desc)
	}
	if name == "" {
		name = truncate(desc, MaxNameLen)
	}

	if ref := ReferenceNumber(tx); ref != "" {
		reference = truncate(ref, MaxRefLen)
	} else {
		reference = truncate(tx.ID, MaxRefLen)
	}
	return truncate(name, MaxNameLen), reference
}
