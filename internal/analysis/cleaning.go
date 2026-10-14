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
	maxNameLen = 40
	maxRefLen  = 24
)

// toFromRE matches the standard shapes "to|from <till> - <payload>" and
// "to|from - <payload>". Group 1 is the till/paybill number when present,
// group 2 the payload after the separator. For "from|to - <masked> <name>"
// the masked number rides inside the payload and is peeled off afterwards.
var toFromRE = regexp.MustCompile(`(?i)\b(?:to|from)\s*(?:([\d*]+)\s+)?-\s+(.+)$`)

// bundleByRE matches the "… by - <masked> <name>" tail that Safaricom data
// bundle purchases use instead of the "to <till> - <name>" shape.
var bundleByRE = regexp.MustCompile(`(?i)\bby\s*-\s*(?:[\d*]+\s+)?(.+)$`)

// tillRE finds the till/paybill number in a "to <number>" fragment.
var tillRE = regexp.MustCompile(`(?i)\bto\s+([\d]{3,})\b`)

// tailCutRE strips known boilerplate tails from extracted names, e.g.
// " via API. Original conversation ID is FTC260330HEOX." or " Acc. 01450540651".
var tailCutRE = regexp.MustCompile(`(?i)\s*(?:via api|app to customer|by m-|acc\.).*$`)

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

// truncate caps s at max characters, appending an ellipsis when cut.
func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	if max <= 1 {
		return s[:1]
	}
	return s[:max-1] + "…"
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

// stripBoiler drops a leading boilerplate phrase and returns the remainder.
func stripBoiler(desc string) string {
	lower := strings.ToLower(desc)
	for _, prefix := range boilerPrefixes {
		if strings.HasPrefix(lower, prefix) {
			return truncate(strings.TrimSpace(desc[len(prefix):]), maxNameLen)
		}
	}
	return truncate(desc, maxNameLen)
}

// SplitTransaction cleans one transaction into the display name and
// reference number for the transaction list. reference is the
// till/paybill/payer number when the description carries one, falling back
// to the transaction's receipt number.
func SplitTransaction(tx parser.Transaction) (name, reference string) {
	desc := strings.TrimSpace(tx.Description)
	ref, payload := "", ""

	m := toFromRE.FindStringSubmatch(desc)
	if m != nil {
		ref = strings.TrimSpace(m[1])
		payload = strings.TrimSpace(m[2])
		cleaned, lead := stripMaskedLead(payload)
		payload = cleaned
		if ref == "" {
			ref = lead
		}
	} else {
		m = bundleByRE.FindStringSubmatch(desc)
		if m != nil {
			cleaned, lead := stripMaskedLead(strings.TrimSpace(m[1]))
			payload = cleaned
			if lead != "" {
				ref = lead
			} else {
				t := tillRE.FindStringSubmatch(desc)
				if t != nil {
					ref = t[1]
				}
			}
		}
	}

	if payload != "" {
		name = cutTails(payload)
	} else {
		// No counterparty shape: known short labels, else stripped boilerplate.
		if short, ok := shortNames[strings.ToLower(desc)]; ok {
			name = short
		} else {
			name = stripBoiler(desc)
		}
	}
	if name == "" {
		name = truncate(desc, maxNameLen)
	}

	if ref == "" {
		reference = truncate(tx.ID, maxRefLen)
	} else {
		reference = truncate(ref, maxRefLen)
	}
	return truncate(name, maxNameLen), reference
}
