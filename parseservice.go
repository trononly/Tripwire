package main

import (
	"errors"
	"fmt"
	"log"
	"mpesa-analyzer/internal/analysis"
	"mpesa-analyzer/internal/categories"
	"mpesa-analyzer/internal/favourites"
	"mpesa-analyzer/internal/parser"
	"mpesa-analyzer/internal/pdf"
	"mpesa-analyzer/internal/sms"
	"mpesa-analyzer/internal/store"
	"mpesa-analyzer/internal/txtype"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type ParseService struct {
	mu    sync.Mutex
	store *store.Store
}

// statements lazily creates the store the first time a history method
// runs. The database lives in an app-private directory: getFilesDir() on
// Android (via the Wails bridge - xdg has no Android support and $HOME is
// unset there, which resolves to a read-only /.local), the xdg data home
// on desktop.
func (p *ParseService) statements() (*store.Store, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.store == nil {
		base := application.Mobile.StoragePath()
		if base == "" {
			if runtime.GOOS == "android" {
				log.Println("statement store: Android storage path unavailable (bridge not ready?), falling back to xdg data home")
			}
			base = application.Path(application.PathDataHome)
		}
		s, err := store.New(filepath.Join(base, "mpesa-analyzer", "statements.db"))
		if err != nil {
			return nil, err
		}
		p.store = s
	}
	return p.store, nil
}

// categoryService wraps the same store for the user-category layer.
func (p *ParseService) categoryService() (*categories.Service, error) {
	s, err := p.statements()
	if err != nil {
		return nil, err
	}
	return categories.New(s), nil
}

// SmsMessage is one raw SMS record from the Android bridge: metadata only.
// The body is parsed in Go (internal/sms), never in Java or TypeScript.
type SmsMessage struct {
	ID      string `json:"id"`
	Address string `json:"address"`
	DateMs  int64  `json:"dateMs"`
	Body    string `json:"body"`
	// SubID/Slot/SimLabel identify the SIM that received the message: the
	// subscription id and logical slot from Android's telephony layer, plus
	// the carrier's display name for the SIM. Slot is -1 (and SubID -1)
	// when the bridge could not resolve them (pre-API-22, missing
	// READ_PHONE_STATE, or a non-Android source). They are never parsed out
	// of the SMS body - an M-Pesa message is identical on every SIM.
	SubID    int    `json:"subId,omitempty"`
	Slot     int    `json:"slot,omitempty"`
	SimLabel string `json:"simLabel,omitempty"`
	// TzOffsetMinutes renders the received time in the device timezone,
	// following the JS Date.getTimezoneOffset convention (minutes behind
	// UTC: Nairobi is -180). The Go runtime on Android has no reliable
	// local timezone database, so the frontend always sends the offset;
	// nil falls back to time.Local for desktop/test convenience only.
	TzOffsetMinutes *int `json:"tzOffsetMinutes,omitempty"`
}

// simKeyOf derives a record key and human label for a message's SIM. The
// key prefers the physical slot (stable across reboots, unlike a sub id)
// and falls back to the subscription id when the bridge could not resolve
// a slot. Minutes precision is irrelevant here; this is grouping only.
func simKeyOf(m SmsMessage) (key, label string) {
	label = strings.TrimSpace(m.SimLabel)
	switch {
	case m.Slot >= 0:
		key = fmt.Sprintf("sim-%d", m.Slot)
		if label == "" {
			label = fmt.Sprintf("SIM %d", m.Slot+1)
		}
	case m.SubID >= 0:
		key = fmt.Sprintf("sub-%d", m.SubID)
		if label == "" {
			// No carrier name (READ_PHONE_STATE denied): the sub id is the
			// only identity left. Kept distinct so two SIMs never merge.
			label = fmt.Sprintf("SIM %d", m.SubID)
		}
	default:
		key = "sim-unknown"
		if label == "" {
			label = "SIM"
		}
	}
	return key, label
}

// Per-message outcome kinds. Unsupported (no sample-backed format) is
// deliberately distinct from malformed (confirmation-shaped but broken):
// unsupported messages may become parseable later, malformed ones never.
const (
	smsKindImported         = "imported"
	smsKindInvalid          = "invalid"           // metadata unusable: no body, or bad timestamp
	smsKindMalformed        = "malformed"         // looked like a confirmation but missing/invalid fields
	smsKindUnsupported      = "unsupported"       // a real shape we have no parsing rule for
	smsKindNonTransactional = "non_transactional" // operational notice, no financial transaction
)

// SmsParseResult is one message's outcome, keeping the original record so
// every generated transaction stays auditable against the SMS that produced
// it. SourceID echoes the Android provider row ID for UI correlation only -
// it is never the transaction identity; that stays the parser's M-Pesa
// receipt number.
type SmsParseResult struct {
	SourceID string               `json:"sourceId"`
	Address  string               `json:"address,omitempty"`
	DateMs   int64                `json:"dateMs,omitempty"`
	Body     string               `json:"body,omitempty"`
	SimID    string               `json:"simId,omitempty"`
	SimLabel string               `json:"simLabel,omitempty"`
	Kind     string               `json:"kind"`
	Error    string               `json:"error,omitempty"`
	Txs      []parser.Transaction `json:"txs,omitempty"`
}

// SmsImportResult is a batch outcome: per-message results plus the
// successful transactions flattened in SMS received-time order. Nothing is
// persisted and no record is activated by this call.
type SmsImportResult struct {
	Txs              []parser.Transaction `json:"txs"`
	Imported         int                  `json:"imported"`
	Invalid          int                  `json:"invalid"`
	Malformed        int                  `json:"malformed"`
	Unsupported      int                  `json:"unsupported"`
	NonTransactional int                  `json:"nonTransactional"`
	Results          []SmsParseResult     `json:"results"`
}

// smsMaxDateMs is 2100-01-01 UTC: anything beyond is a corrupt timestamp,
// not a message someone received.
const smsMaxDateMs = int64(4102444800000)

// TransactionView is a single prepared row for the frontend transaction
// list: type, category and counterparty are pre-classified here so the UI
// never re-runs classification and never infers semantics from an amount's
// sign or a name. CustomCategory* is the user's own label for this row
// (empty when unassigned); CounterpartyKey is the normalized identity that
// "apply to similar" matches on, so the UI's preview and the backend's rule
// agree.
type TransactionView struct {
	ID                  string `json:"id"`
	Date                string `json:"date"`
	Description         string `json:"description"`
	Status              string `json:"status"`
	Amount              int64  `json:"amount"`
	Balance             int64  `json:"balance"`
	Category            string `json:"category"`
	Type                string `json:"type"`
	Counterparty        string `json:"counterparty"`
	CounterpartyKey     string `json:"counterpartyKey"`
	CustomCategoryID    string `json:"customCategoryId"`
	CustomCategoryName  string `json:"customCategoryName"`
	CustomCategoryEmoji string `json:"customCategoryEmoji"`
}

// DayGroup is one calendar day of transactions, newest first. EndBalance is
// the net M-Pesa position (wallet cash minus Fuliza debt) after the day's
// latest transaction, and EndOwed is the Fuliza debt owed at that point
// (positive cents, zero when debt-free) - true end-of-day values,
// independent of any frontend filtering.
type DayGroup struct {
	DayKey     string            `json:"dayKey"` // "2006-01-02"
	EndBalance int64             `json:"endBalance"`
	EndOwed    int64             `json:"endOwed"`
	Txs        []TransactionView `json:"txs"`
}

// TransactionGroups prepares the frontend's transaction list in one call:
// sorts newest-first, categorizes, and groups by calendar day. Sorting and
// grouping run here (once per dataset) instead of in JS on every render.
// Ties on the second-precision timestamp break by transaction ID
// descending, so a paired Fuliza fee ("<receipt>-F") or charge
// ("<receipt>-C") sorts before its base row. Day headers come from the
// net-position ledger (wallet minus debt, computed in ascending order),
// never from a single row's Balance: fee rows carry debt while every other
// row carries wallet cash, so the latest row alone flip-flops ledgers.
//
// User categories resolve here too, at read time: assignments live in their
// own rules table, so a re-imported statement or a refreshed SMS feed picks
// them up without rewriting transactions.
func (p *ParseService) TransactionGroups(txs []parser.Transaction) ([]DayGroup, error) {
	svc, err := p.categoryService()
	if err != nil {
		return nil, err
	}
	ix, err := svc.Load()
	if err != nil {
		return nil, err
	}
	assigned := ix.ResolveAll(txs)

	sorted := make([]parser.Transaction, len(txs))
	copy(sorted, txs)
	sort.SliceStable(sorted, func(i, j int) bool {
		if sorted[i].Date != sorted[j].Date {
			return sorted[i].Date > sorted[j].Date
		}
		return sorted[i].ID > sorted[j].ID
	})
	dayNet, dayOwed := analysis.DayLedger(txs)

	out := make([]DayGroup, 0, 16)
	for _, tx := range sorted {
		var day string
		if len(tx.Date) >= 10 {
			day = tx.Date[:10]
		}
		if len(out) == 0 || out[len(out)-1].DayKey != day {
			out = append(out, DayGroup{
				DayKey:     day,
				EndBalance: dayNet[day], // net position after the day's latest tx
				EndOwed:    dayOwed[day],
				Txs:        []TransactionView{},
			})
		}
		view := TransactionView{
			ID:              tx.ID,
			Date:            tx.Date,
			Description:     tx.Description,
			Status:          tx.Status,
			Amount:          tx.Amount,
			Balance:         tx.Balance,
			Category:        analysis.CategoryOf(tx.Description),
			Type:            string(analysis.TypeOf(tx.Description)),
			Counterparty:    analysis.CounterpartyLabel(tx.Description),
			CounterpartyKey: categories.CounterpartyKey(tx.Description),
		}
		if c, ok := assigned[tx.ID]; ok {
			view.CustomCategoryID = c.ID
			view.CustomCategoryName = c.Name
			view.CustomCategoryEmoji = c.Emoji
		}
		g := &out[len(out)-1]
		g.Txs = append(g.Txs, view)
	}
	return out, nil
}

// AnalyzeTransactions computes all dashboard analytics for the given
// transactions in a single call.
func (p *ParseService) AnalyzeTransactions(txs []parser.Transaction) (*analysis.AnalysisResult, error) {
	result, err := analysis.Analyze(txs)
	if err != nil {
		return nil, fmt.Errorf("Failed to analyze transactions: %w", err)
	}
	return result, nil
}

// TransactionCategories maps each transaction ID to its category so the
// transactions table can filter by category.
func (p *ParseService) TransactionCategories(txs []parser.Transaction) map[string]string {
	out := make(map[string]string, len(txs))
	for _, tx := range txs {
		out[tx.ID] = analysis.CategoryOf(tx.Description)
	}
	return out
}

// ListCategories returns the user's own spending labels in display order.
func (p *ParseService) ListCategories() ([]store.Category, error) {
	svc, err := p.categoryService()
	if err != nil {
		return nil, err
	}
	return svc.List()
}

// CreateCategory adds a user category. The picker calls this inline when the
// user labels a transaction with a category that does not exist yet.
func (p *ParseService) CreateCategory(name, emoji string) (store.Category, error) {
	svc, err := p.categoryService()
	if err != nil {
		return store.Category{}, err
	}
	return svc.Create(name, emoji)
}

// AssignCategory applies one choice from the category picker. applyToSimilar
// scopes the assignment to the transaction's counterparty (or, when the row
// names none, its transaction type); categoryID may be empty for "Automatic".
func (p *ParseService) AssignCategory(txID, txType, counterpartyKey, categoryID string, applyToSimilar bool) error {
	svc, err := p.categoryService()
	if err != nil {
		return err
	}
	return svc.Assign(txID, txType, counterpartyKey, categoryID, applyToSimilar)
}

func (p *ParseService) PickFile() (string, error) {
	return application.Get().Dialog.OpenFileWithOptions(&application.OpenFileDialogOptions{
		Title:          "Select a PDF file",
		CanChooseFiles: true,
		Filters: []application.FileFilter{
			{
				DisplayName: "Select an M-Pesa Statement",
				Pattern:     "*.pdf",
			},
		},
	}).PromptForSingleSelection()
}

// ImportStatement parses a PDF and stores the transactions under the given
// name (derived from the date range when the name is blank), returning the
// new record with its transactions.
func (p *ParseService) ImportStatement(filePath, password, name string) (*store.StatementRecord, error) {
	txs, err := pdf.ReadPDFTX(filePath, password)
	if err != nil {
		return nil, fmt.Errorf("Failed to parse transactions: %w", err)
	}
	rangeOf := store.DateRangeOf(txs)
	name = strings.TrimSpace(name)
	if name == "" {
		name = store.NameOf(rangeOf)
	}
	rec := store.StatementRecord{
		ID:         store.NewID(),
		Name:       name,
		Source:     store.SourceStatement,
		DateRange:  rangeOf,
		TxCount:    len(txs),
		ImportedAt: time.Now().UTC(),
		Txs:        txs,
	}

	s, err := p.statements()
	if err != nil {
		return nil, err
	}
	if err := s.Add(rec); err != nil {
		return nil, err
	}
	return &rec, nil
}

// ImportSms converts raw SMS records from the Android bridge into
// transactions via internal/sms.ParseMessage. Per-message results are
// returned with success/failure classification; one bad message never
// discards the good ones. The batch and its transactions are ordered by
// SMS received time (ascending, stable on ties). Nothing is persisted and
// no statement record is activated.
func (p *ParseService) ImportSms(messages []SmsMessage) SmsImportResult {
	type stamped struct {
		ms  int64
		res SmsParseResult
	}
	parsed := make([]stamped, 0, len(messages))
	out := SmsImportResult{
		Txs:     []parser.Transaction{},
		Results: make([]SmsParseResult, 0, len(messages)),
	}

	for _, msg := range messages {
		res := p.parseSmsMessage(msg)
		switch res.Kind {
		case smsKindImported:
			out.Imported++
		case smsKindInvalid:
			out.Invalid++
		case smsKindMalformed:
			out.Malformed++
		case smsKindUnsupported:
			out.Unsupported++
		case smsKindNonTransactional:
			out.NonTransactional++
		}
		parsed = append(parsed, stamped{ms: msg.DateMs, res: res})
	}

	sort.SliceStable(parsed, func(i, j int) bool { return parsed[i].ms < parsed[j].ms })
	for _, s := range parsed {
		out.Results = append(out.Results, s.res)
		out.Txs = append(out.Txs, s.res.Txs...)
	}
	return out
}

// parseSmsMessage converts one raw SMS record. Metadata problems are
// "invalid"; parser problems come back classified as "malformed" or
// "unsupported" exactly as internal/sms distinguishes them.
func (p *ParseService) parseSmsMessage(msg SmsMessage) SmsParseResult {
	simKey, simLabel := simKeyOf(msg)
	res := SmsParseResult{
		SourceID: msg.ID,
		Address:  msg.Address,
		DateMs:   msg.DateMs,
		Body:     msg.Body,
		SimID:    simKey,
		SimLabel: simLabel,
	}
	if strings.TrimSpace(msg.Body) == "" {
		res.Kind, res.Error = smsKindInvalid, "missing message body"
		return res
	}
	if msg.DateMs <= 0 || msg.DateMs >= smsMaxDateMs {
		res.Kind, res.Error = smsKindInvalid, "missing or invalid received timestamp"
		return res
	}

	// The Android receive time (millisecond precision) is the canonical
	// transaction date; the SMS text's own minute-precision stamp stays a
	// validation-only field inside the parser.
	t := time.UnixMilli(msg.DateMs)
	if msg.TzOffsetMinutes != nil {
		t = t.In(time.FixedZone("sms", -*msg.TzOffsetMinutes*60))
	} else {
		t = t.In(time.Local)
	}
	date := t.Format("2006-01-02 15:04:05")

	txs, err := sms.ParseMessage(msg.Body)
	if err != nil {
		switch {
		case errors.Is(err, sms.ErrUnsupported):
			res.Kind = smsKindUnsupported
		case errors.Is(err, sms.ErrNonTransactional):
			res.Kind = smsKindNonTransactional
		default:
			// ParseMessage only ever returns ErrUnsupported or
			// ErrMalformed; treat anything else as malformed so an
			// unexpected error can never be silently dropped.
			res.Kind = smsKindMalformed
		}
		res.Error = err.Error()
		return res
	}
	for i := range txs {
		txs[i].Date = date
	}
	res.Kind = smsKindImported
	res.Txs = txs
	return res
}

// SaveSmsImport persists a confirmed SMS import as a record in the same
// store as PDF statements, using the same normalized parser.Transaction
// model. The preview batch stays exactly what
// ImportSms returned; nothing here re-parses or re-classifies.
func (p *ParseService) SaveSmsImport(txs []parser.Transaction) (*store.StatementRecord, error) {
	if len(txs) == 0 {
		return nil, fmt.Errorf("no SMS transactions to save")
	}
	rec := newSmsRecord(txs, "", "")

	s, err := p.statements()
	if err != nil {
		return nil, err
	}
	if err := s.Add(rec); err != nil {
		return nil, err
	}
	return &rec, nil
}

// newSmsRecord wraps parsed SMS transactions as a store record. Shared by
// the manual save path and the refresh path. simID/simLabel identify the
// source SIM; the manual path leaves them empty.
func newSmsRecord(txs []parser.Transaction, simID, simLabel string) store.StatementRecord {
	rangeOf := store.DateRangeOf(txs)
	return store.StatementRecord{
		ID:         store.NewID(),
		Name:       store.NameOf(rangeOf),
		Source:     store.SourceSms,
		SimID:      simID,
		SimLabel:   simLabel,
		DateRange:  rangeOf,
		TxCount:    len(txs),
		ImportedAt: time.Now().UTC(),
		Txs:        txs,
	}
}

// SmsSimRefresh is one SIM's slice of an inbox snapshot: the SMS record
// holding that SIM's merged dataset, how many transactions were actually
// new, the new transactions themselves (for arrival previews), and whether
// any of them is a user-initiated spend (till, paybill, send-money) worth
// popping a receipt for. Record is nil and NewTxs empty when nothing new
// came from this SIM.
type SmsSimRefresh struct {
	SimID    string                 `json:"simId"`
	SimLabel string                 `json:"simLabel"`
	Record   *store.StatementRecord `json:"record,omitempty"`
	NewCount int                    `json:"newCount"`
	NewTxs   []parser.Transaction   `json:"newTxns"`
	Receipt  bool                   `json:"receipt"`
}

// SmsRefreshResult is one inbox snapshot merged into the store: the full
// per-message audit (same shape as ImportSms, so the manual dialog keeps
// its breakdown UI on this single import path) plus one entry per SIM that
// the snapshot touched. SMS records are stored one per SIM, so a dual-SIM
// inbox yields two Sim entries and each wallet keeps its own balance
// series.
type SmsRefreshResult struct {
	Result SmsImportResult `json:"result"`
	Sims   []SmsSimRefresh `json:"sims"`
}

// RefreshSmsImport parses an inbox snapshot and merges each SIM's messages
// into that SIM's latest SMS record - creating one when there is none -
// keyed by the parser's M-Pesa receipt number. Re-running it over an
// unchanged inbox adds nothing and writes nothing, so the launch-time
// auto-import is safe to run on every start. Older SMS records are left
// alone as snapshots.
func (p *ParseService) RefreshSmsImport(messages []SmsMessage) (*SmsRefreshResult, error) {
	res := p.ImportSms(messages)
	out := &SmsRefreshResult{Result: res}
	if len(res.Txs) == 0 {
		return out, nil
	}

	// Partition the audit by SIM. Each parse result carries its SIM key, so
	// this is a single pass over the already-parsed batch rather than a
	// second parse. Results arrive in received-time order, so each SIM's
	// transactions stay in order too.
	type simAgg struct {
		label string
		txs   []parser.Transaction
	}
	aggs := make(map[string]*simAgg, 2)
	order := make([]string, 0, 2)
	for _, r := range res.Results {
		key := r.SimID
		if key == "" {
			key = "sim-unknown"
		}
		a := aggs[key]
		if a == nil {
			a = &simAgg{label: r.SimLabel}
			aggs[key] = a
			order = append(order, key)
		}
		a.txs = append(a.txs, r.Txs...)
	}

	s, err := p.statements()
	if err != nil {
		return nil, err
	}
	metas, err := s.List()
	if err != nil {
		return nil, err
	}

	for _, key := range order {
		txs := aggs[key].txs
		if len(txs) == 0 {
			continue
		}
		sim := SmsSimRefresh{SimID: key, SimLabel: aggs[key].label}

		latest, err := latestSmsRecord(s, metas, key)
		if err != nil {
			return nil, err
		}
		if latest == nil {
			rec := newSmsRecord(txs, key, sim.SimLabel)
			if err := s.Add(rec); err != nil {
				return nil, err
			}
			sim.Record = &rec
			sim.NewCount = len(txs)
			sim.NewTxs = txs
		} else {
			seen := make(map[string]bool, len(latest.Txs))
			for _, tx := range latest.Txs {
				seen[tx.ID] = true
			}
			fresh := make([]parser.Transaction, 0, len(txs))
			for _, tx := range txs {
				if !seen[tx.ID] {
					seen[tx.ID] = true
					fresh = append(fresh, tx)
				}
			}
			if len(fresh) > 0 {
				merged := append(append([]parser.Transaction{}, latest.Txs...), fresh...)
				sort.SliceStable(merged, func(i, j int) bool { return merged[i].Date < merged[j].Date })
				latest.Txs = merged
				latest.DateRange = store.DateRangeOf(merged)
				latest.Name = store.NameOf(latest.DateRange)
				latest.TxCount = len(merged)
				latest.SimLabel = sim.SimLabel
				latest.ImportedAt = time.Now().UTC()
				// Append only the fresh rows: the SMS feed grows by
				// adding messages, so rewriting its whole history on
				// every merge would get slower without bound.
				if err := s.AppendFresh(*latest, fresh); err != nil {
					return nil, err
				}
				sim.NewCount = len(fresh)
				sim.NewTxs = fresh
			}
			sim.Record = latest
		}
		sim.Receipt = receiptWorthy(sim.NewTxs)
		out.Sims = append(out.Sims, sim)
	}
	return out, nil
}

// latestSmsRecord returns the newest SMS record for one SIM key, or nil
// when that SIM has none yet. metas is already newest-import-first.
func latestSmsRecord(s *store.Store, metas []store.StatementMeta, simKey string) (*store.StatementRecord, error) {
	for _, m := range metas {
		if m.Source != store.SourceSms || m.SimID != simKey {
			continue
		}
		rec, err := s.Get(m.ID)
		if err != nil {
			return nil, err
		}
		return &rec, nil
	}
	return nil, nil
}

// receiptWorthy reports whether any new transaction is a user-initiated
// spend - till/buy-goods, paybill or send-money. Only those pop the
// arrival receipt; inbound money, airtime, fees and the rest merge
// silently into history.
func receiptWorthy(txs []parser.Transaction) bool {
	for _, tx := range txs {
		switch txtype.TypeOf(tx.Description) {
		case txtype.TypeTill, txtype.TypePaybill, txtype.TypeSendMoney:
			return true
		}
	}
	return false
}

// SimCard is one SIM as currently seen by the phone: the subscription id
// and slot from the telephony layer plus the carrier's display name. It
// carries no messages - it only re-resolves names for wallets imported
// while READ_PHONE_STATE was unavailable.
type SimCard struct {
	SubID    int    `json:"subId"`
	Slot     int    `json:"slot"`
	SimLabel string `json:"simLabel"`
}

// RefreshSimLabels upgrades stored SMS wallets' display names from the
// phone's current SIM list, and moves subscription-keyed records onto
// their slot key once the slot is known - without the move, imports after
// the phone-state grant would open a second record for the same physical
// SIM. A card matches by slot key first, then subscription key; cards with
// no carrier name and records that already carry the name are skipped for
// renaming, and a move is skipped when another record already claims the
// slot key (the older record stays as a snapshot). Returns how many
// records changed. Transactions, counts and date ranges are untouched.
func (p *ParseService) RefreshSimLabels(cards []SimCard) (int, error) {
	s, err := p.statements()
	if err != nil {
		return 0, err
	}
	metas, err := s.List()
	if err != nil {
		return 0, err
	}
	claimed := make(map[string]bool, len(metas))
	for _, m := range metas {
		if m.Source == store.SourceSms {
			claimed[m.SimID] = true
		}
	}
	updated := 0
	for _, c := range cards {
		label := strings.TrimSpace(c.SimLabel)
		var slotKey, subKey string
		if c.Slot >= 0 {
			slotKey = fmt.Sprintf("sim-%d", c.Slot)
		}
		if c.SubID >= 0 {
			subKey = fmt.Sprintf("sub-%d", c.SubID)
		}
		if slotKey == "" && subKey == "" {
			continue
		}
		for i := range metas {
			m := &metas[i]
			if m.Source != store.SourceSms {
				continue
			}
			if m.SimID != slotKey && m.SimID != subKey {
				continue
			}
			changed := false
			if slotKey != "" && m.SimID == subKey && !claimed[slotKey] {
				if err := s.SetSimID(m.ID, slotKey); err != nil {
					return updated, err
				}
				delete(claimed, subKey)
				claimed[slotKey] = true
				m.SimID = slotKey
				changed = true
			}
			if label != "" && m.SimLabel != label {
				if err := s.SetSimLabel(m.ID, label); err != nil {
					return updated, err
				}
				m.SimLabel = label
				changed = true
			}
			if changed {
				updated++
			}
		}
	}
	return updated, nil
}

// ListStatements returns the stored statements' metadata, newest import
// first.
func (p *ParseService) ListStatements() ([]store.StatementMeta, error) {
	s, err := p.statements()
	if err != nil {
		return nil, err
	}
	return s.List()
}

// ActivateStatement loads one stored statement's transactions for viewing.
// Activation is a load, not a state: the service keeps no active record.
func (p *ParseService) ActivateStatement(id string) ([]parser.Transaction, error) {
	s, err := p.statements()
	if err != nil {
		return nil, err
	}
	rec, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	return rec.Txs, nil
}

// DeleteStatement removes a stored statement and its transactions.
func (p *ParseService) DeleteStatement(id string) error {
	s, err := p.statements()
	if err != nil {
		return err
	}
	return s.Delete(id)
}

// RenameStatement sets a new name for a stored statement.
func (p *ParseService) RenameStatement(id, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("statement name cannot be empty")
	}
	s, err := p.statements()
	if err != nil {
		return err
	}
	return s.Rename(id, name)
}

// ListFavourites returns the saved recipients for one Send flow: "send" for
// Send Money or "pochi" for Pochi La Biashara.
func (p *ParseService) ListFavourites(kind string) ([]store.Favourite, error) {
	s, err := p.statements()
	if err != nil {
		return nil, err
	}
	return favourites.New(s).List(kind)
}

// AddFavourite saves a recipient in the given Send flow. The phone is
// normalized to the local 07…/01… form; the name is optional and falls back
// to the number. The frontend normally sends the picker's raw number, so
// normalization lives in Go rather than Java.
func (p *ParseService) AddFavourite(name, phone, kind string) (store.Favourite, error) {
	s, err := p.statements()
	if err != nil {
		return store.Favourite{}, err
	}
	return favourites.New(s).Add(name, phone, kind)
}

// RenameFavourite changes a saved recipient's display name.
func (p *ParseService) RenameFavourite(id, name string) error {
	s, err := p.statements()
	if err != nil {
		return err
	}
	return favourites.New(s).Rename(id, name)
}

// DeleteFavourite removes a saved recipient.
func (p *ParseService) DeleteFavourite(id string) error {
	s, err := p.statements()
	if err != nil {
		return err
	}
	return favourites.New(s).Delete(id)
}

// ReorderFavourites persists a new manual order for saved Send recipients.
func (p *ParseService) ReorderFavourites(ids []string) error {
	s, err := p.statements()
	if err != nil {
		return err
	}
	return favourites.New(s).Reorder(ids)
}

// ListLipaFavourites returns the saved destinations for one Lipa flow:
// "paybill" or "till".
func (p *ParseService) ListLipaFavourites(kind string) ([]store.LipaFavourite, error) {
	s, err := p.statements()
	if err != nil {
		return nil, err
	}
	return favourites.New(s).ListLipa(kind)
}

// AddLipaFavourite saves a manually entered paybill or till. The kind,
// number and account are validated in Go; the name is optional and falls
// back to the account or the number.
func (p *ParseService) AddLipaFavourite(name, kind, number, account string) (store.LipaFavourite, error) {
	s, err := p.statements()
	if err != nil {
		return store.LipaFavourite{}, err
	}
	return favourites.New(s).AddLipa(name, kind, number, account)
}

// RenameLipaFavourite changes a saved Lipa destination's display name.
func (p *ParseService) RenameLipaFavourite(id, name string) error {
	s, err := p.statements()
	if err != nil {
		return err
	}
	return favourites.New(s).RenameLipa(id, name)
}

// DeleteLipaFavourite removes a saved Lipa destination.
func (p *ParseService) DeleteLipaFavourite(id string) error {
	s, err := p.statements()
	if err != nil {
		return err
	}
	return favourites.New(s).DeleteLipa(id)
}

// ReorderLipaFavourites persists a new manual order for saved Lipa
// destinations.
func (p *ParseService) ReorderLipaFavourites(ids []string) error {
	s, err := p.statements()
	if err != nil {
		return err
	}
	return favourites.New(s).ReorderLipa(ids)
}
