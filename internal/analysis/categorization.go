package analysis

import (
	"regexp"
	"sort"
	"strings"

	"mpesa-analyzer/internal/counterparty"
	"mpesa-analyzer/internal/parser"
	"mpesa-analyzer/internal/txtype"
)

// CategoryOf maps a description to a category display name (the labels
// the donut chart and category filter aggregate under). Same deterministic
// classification as TypeOf; only the presentation differs. The
// implementation lives in internal/txtype (shared with the recurring-
// payment detector); this wrapper keeps the analysis package's public
// surface stable.
func CategoryOf(description string) string {
	return txtype.CategoryOf(description)
}

// Categorize returns totals per category, sorted by volume descending.
// Amounts are signed cents; each category total is the sum of signed
// amounts (outflows negative).
func Categorize(transactions []parser.Transaction) []CategoryTotal {
	totals := make(map[string]*CategoryTotal)

	for _, tx := range transactions {
		cat := CategoryOf(tx.Description)
		c, ok := totals[cat]
		if !ok {
			c = &CategoryTotal{Name: cat}
			totals[cat] = c
		}
		c.Amount += tx.Amount
		c.Count++
	}

	out := make([]CategoryTotal, 0, len(totals))
	var abs int64
	for _, c := range totals {
		out = append(out, *c)
		a := c.Amount
		if a < 0 {
			a = -a
		}
		abs += a
	}
	for i := range out {
		if abs > 0 {
			a := out[i].Amount
			if a < 0 {
				a = -a
			}
			out[i].Percent = float64(a) / float64(abs) * 100
		}
	}
	sort.Slice(out, func(i, j int) bool { return absOf(out[i].Amount) > absOf(out[j].Amount) })
	return out
}

func absOf(n int64) int64 {
	if n < 0 {
		return -n
	}
	return n
}

// CategoryTotal aggregates one category.
type CategoryTotal struct {
	Name    string  `json:"name"`
	Amount  int64   `json:"amount"` // signed cents
	Count   int     `json:"count"`
	Percent float64 `json:"percent"`
}

// Counterparty is an aggregated person/business the user transacted with.
type Counterparty struct {
	Name   string `json:"name"`
	Number string `json:"number"` // till/paybill/phone reference, "" if unknown
	Count  int    `json:"count"`
	Amount int64  `json:"amount"` // signed cents, sum of signed amounts
	In     int64  `json:"in"`     // cents, positive sum of money received
	Out    int64  `json:"out"`    // cents, positive sum of money sent
}

// CounterpartyOf extracts the counterparty name from a description.
// The implementation lives in internal/counterparty (shared with the
// recurring-payment detector); this wrapper keeps the analysis package's
// public surface stable.
func CounterpartyOf(description string) string {
	return counterparty.CounterpartyOf(description)
}

// CounterpartyLabel is the display name shown for the counterparty of a
// description: cleaned of boilerplate, and - when the row is a person-to-
// person transfer rather than a paybill, till or bank - title-cased and
// shortened to a first and last name. Businesses keep the casing the
// statement used, so "NCBA BANK" and "KPLC" read as written while
// "JOHN DOE" reads as "John Doe". Returns "" when the row names none.
func CounterpartyLabel(description string) string {
	name := CounterpartyName(description)
	if name == "" {
		return ""
	}
	if isPersonCounterparty(description, name) {
		return personName(name)
	}
	return name
}

// isPersonType reports whether a transaction type's counterparty is usually an
// individual. Paybill, till, bank, salary and savings counterparties are
// organisations; send-money, received-funds and reversals are people.
func isPersonType(t txtype.TransactionType) bool {
	switch t {
	case txtype.TypeSendMoney, txtype.TypeReceive, txtype.TypeReversal:
		return true
	default:
		return false
	}
}

// businessNameRE matches organisation wording. It guards the person rule on
// the receive type, which covers both "Funds received from JOHN DOE" and
// "Business Payment from Absa Bank Kenya PLC".
var businessNameRE = regexp.MustCompile(`(?i)\b(bank|plc|ltd|limited|sacco|enterprises?|traders?|supermarkets?|company|holdings?|group|agencies|agency|services?|stores?|hotels?|hospitals?|schools?|colleges?|universit(?:y|ies)|insurance|capital|investments?|fund|trust|microfinance|butchery|pharmacy|hardware|distributors?|suppliers?|wholesalers?|retailers?|caf[eé]|restaurants?|salons?|academy|institute|authority|commission|ministry|county|government|kra|nhif|sha)\b`)

// isPersonCounterparty reports whether a counterparty row should be presented
// as an individual's name. It starts from the transaction type, then vetoes
// organisations that share a person type ("Business Payment from Absa Bank
// Kenya PLC" is a receive, but a bank, not a person).
func isPersonCounterparty(description, name string) bool {
	if !isPersonType(TypeOf(description)) {
		return false
	}
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(description)), "business payment") {
		return false
	}
	return !businessNameRE.MatchString(name)
}

// counterpartyAcronyms are tokens kept upper-case when title-casing a person
// name, so a payment to someone at a business does not read "Kcb" or "M-Pesa".
var counterpartyAcronyms = map[string]bool{
	"M-PESA": true, "MPESA": true, "ATM": true, "KCB": true, "KPLC": true,
	"NCBA": true, "MMF": true, "PLC": true, "CBK": true, "KRA": true,
	"NHIF": true, "SHA": true, "SACCO": true,
}

// personName presents an individual's counterparty as a first and last name,
// dropping middle names, phone/account tokens and "Acc." noise:
// "FAITH NJOKI BACHIA 0712***341" -> "Faith Bachia". Falls back to the input
// when nothing name-like remains.
func personName(name string) string {
	words := strings.Fields(name)
	core := make([]string, 0, len(words))
	for _, w := range words {
		if strings.ContainsAny(w, "0123456789*") || strings.EqualFold(w, "acc.") {
			continue
		}
		core = append(core, w)
	}
	if len(core) == 0 {
		return name
	}
	if len(core) > 2 {
		core = []string{core[0], core[len(core)-1]}
	}
	for i, w := range core {
		core[i] = titleCaseWord(w)
	}
	return strings.Join(core, " ")
}

// titleCaseWord upper-cases the first letter and lower-cases the rest:
// "JOHN" -> "John", "MARY-JANE" -> "Mary-Jane". An apostrophe joins parts of
// one name rather than starting a new word, so "NANCY MUNG'ARA" keeps the
// common Kenyan spelling "Nancy Mung'ara" instead of "Nancy Mung'Ara".
// Known acronyms pass through intact.
func titleCaseWord(w string) string {
	if counterpartyAcronyms[strings.ToUpper(w)] {
		return strings.ToUpper(w)
	}
	runes := []rune(strings.ToLower(w))
	capitalize := true
	for i, r := range runes {
		if capitalize && r >= 'a' && r <= 'z' {
			runes[i] = r - 'a' + 'A'
		}
		capitalize = r == '-'
	}
	return string(runes)
}

// systemCounterpartyRE matches Safaricom's own products, which are plumbing
// rather than people or businesses the user chose to transact with:
// M-Shwari, Ziidi MMF, Fuliza, Safaricom Offers/bundles. Matching rows are
// excluded from TopCounterparties (they still count everywhere else).
var systemCounterpartyRE = regexp.MustCompile(`(?i)safaricom|m[-\s]?pesa|m[-\s]?shwari|ziidi|fuliza`)

// isSystemCounterparty reports whether a transaction is with a Safaricom
// product rather than a real counterparty. Both the extracted name and the
// business segment before the " - " separator are checked: statement rows
// like "Unit Trust Invest To 4145555 - ZIIDI MMF by M-PESA" match on the
// name, while SMS rows like "Customer Bundle Purchase to Safaricom Offers
// - Tunukiwa" extract only the account name ("Tunukiwa") and match on the
// business segment instead.
func isSystemCounterparty(description, name string) bool {
	if systemCounterpartyRE.MatchString(name) {
		return true
	}
	business := description
	if i := strings.Index(business, " - "); i >= 0 {
		business = business[:i]
	}
	return systemCounterpartyRE.MatchString(business)
}

// aggregateCounterparties folds every transaction into one Counterparty per
// normalized identity, returning them sorted by transaction count (the
// display-name and -number winners are resolved here). Entries with empty
// or Safaricom-owned names are skipped.
func aggregateCounterparties(transactions []parser.Transaction) []Counterparty {
	index := make(map[string]*Counterparty)
	votes := make(map[string]map[string]int)
	numVotes := make(map[string]map[string]int)
	for _, tx := range transactions {
		name := CounterpartyName(tx.Description)
		if name == "" || isSystemCounterparty(tx.Description, name) {
			continue
		}
		key := counterparty.GroupKey(name)
		c, ok := index[key]
		if !ok {
			c = &Counterparty{Name: name}
			index[key] = c
			votes[key] = map[string]int{}
			numVotes[key] = map[string]int{}
		}
		// Vote on the presented form so individuals read "John Doe"; the
		// grouping key stays the cleaned name so casing never splits a group.
		display := name
		if isPersonCounterparty(tx.Description, name) {
			display = personName(name)
		}
		votes[key][display]++
		if number := counterpartyNumber(tx, name); number != "" {
			numVotes[key][number]++
		}
		c.Count++
		c.Amount += tx.Amount
		if tx.Amount < 0 {
			c.Out += -tx.Amount
		} else {
			c.In += tx.Amount
		}
	}
	out := make([]Counterparty, 0, len(index))
	for key, c := range index {
		// Display the most common original spelling/numbering.
		best, bestN := c.Name, -1
		for form, count := range votes[key] {
			if count > bestN {
				best, bestN = form, count
			}
		}
		c.Name = best
		c.Number = bestNumber(numVotes[key])
		out = append(out, *c)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Count > out[j].Count })
	return out
}

// TopCounterparties returns the counterparties the money moved to or from
// most: the union of the n largest receivers (money in) and the n largest
// senders (money out), deduplicated. Names are grouped by normalized
// identity (case and phone-number formatting ignored) and displayed under
// the most common original form; Number carries the most common
// till/paybill/phone reference seen for that identity (unmasked preferred on
// a tie). The dashboard's In/Out leaderboard re-ranks this set by either
// direction, so both extremes have to be present in the result. Entries with
// empty names are skipped.
func TopCounterparties(transactions []parser.Transaction, n int) []Counterparty {
	if n <= 0 {
		return nil
	}
	all := aggregateCounterparties(transactions)
	if len(all) == 0 {
		return all
	}

	byFlow := func(value func(Counterparty) int64) []Counterparty {
		sorted := make([]Counterparty, len(all))
		copy(sorted, all)
		sort.SliceStable(sorted, func(i, j int) bool {
			return value(sorted[i]) > value(sorted[j])
		})
		return sorted
	}
	byIn, byOut := byFlow(func(c Counterparty) int64 { return c.In }),
		byFlow(func(c Counterparty) int64 { return c.Out })

	// Take the top n of each direction, keeping the first sighting of an
	// identity that appears in both.
	seen := make(map[string]bool, 2*n)
	out := make([]Counterparty, 0, 2*n)
	for _, list := range [][]Counterparty{byIn, byOut} {
		for i := 0; i < len(list) && i < n; i++ {
			c := list[i]
			if seen[c.Name] {
				continue
			}
			seen[c.Name] = true
			out = append(out, c)
		}
	}
	// Count order keeps the payload stable across direction-independent
	// renders; the dashboard re-sorts per direction anyway.
	sort.Slice(out, func(i, j int) bool { return out[i].Count > out[j].Count })
	return out
}

// counterpartyNumber finds the reference number for one transaction: the
// till/paybill/payer number in the description, or a trailing phone number
// left on the extracted name.
func counterpartyNumber(tx parser.Transaction, name string) string {
	if ref := ReferenceNumber(tx); ref != "" {
		return ref
	}
	_, number := counterparty.SplitTrailingNumber(name)
	return number
}

// bestNumber picks the most frequently seen reference, preferring an
// unmasked spelling on a tie so the dashboard shows the fuller number
// whenever one was ever recorded.
func bestNumber(votes map[string]int) string {
	best, bestN := "", -1
	for form, count := range votes {
		masked, bestMasked := strings.Contains(form, "*"), strings.Contains(best, "*")
		switch {
		case count > bestN, count == bestN && bestMasked && !masked:
			best, bestN = form, count
		}
	}
	return best
}

// TypeOf classifies a description into its semantic transaction type. The
// implementation lives in internal/txtype (shared with the recurring-
// payment detector); this wrapper keeps the analysis package's public
// surface stable.
func TypeOf(description string) txtype.TransactionType {
	return txtype.TypeOf(description)
}
