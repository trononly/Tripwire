// Package plans validates and persists the recurring payments a user sets up
// themselves. The detector in internal/recurring only finds patterns already
// present in the statements; a plan covers everything it cannot see (a weekly
// token purchase, a fixed transfer to a relative) and gives the card a Play
// button and a reminder. A plan is a payment intent, never a transaction:
// paying it changes the statements only when the M-Pesa receipt arrives.
package plans

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"mpesa-analyzer/internal/phone"
	"mpesa-analyzer/internal/store"
)

// Payment targets. The names match the guided-payment flows in
// frontend/src/lib/ussd-menus.ts.
const (
	KindSend    = "send"
	KindPochi   = "pochi"
	KindPaybill = "paybill"
	KindTill    = "till"
)

// Cadences match the detector's cadence labels so a user plan and a detected
// payment read the same on the card.
const (
	CadenceWeekly   = "weekly"
	CadenceBiweekly = "bi-weekly"
	CadenceMonthly  = "monthly"
	CadenceQuarter  = "quarterly"
)

// Limits. Amount is in cents: 0 means "ask me when I press Play", so the
// upper bound is M-PESA's KES 250,000 per-transaction limit expressed in
// cents for the amount the user can pre-fill.
const (
	MaxAmountCents = 25_000_000
	MaxLeadDays    = 30
)

// Input is the editable part of a plan - exactly what the setup dialog sends.
// It deliberately has no id or createdAt: a zero time.Time cannot be
// unmarshalled from the dialog's empty string, and the store owns both fields
// anyway.
type Input struct {
	Name          string               `json:"name"`
	Kind          string               `json:"kind"`
	Number        string               `json:"number"`
	Account       string               `json:"account"`
	Amount        int64                `json:"amount"`
	Cadence       string               `json:"cadence"`
	AnchorDay     int                  `json:"anchorDay"`
	AnchorWeekday int                  `json:"anchorWeekday"`
	DueTime       string               `json:"dueTime"`
	LeadDays      int                  `json:"leadDays"`
	Reminders     []store.PlanReminder `json:"reminders"`
	Remind        bool                 `json:"remind"`
	SimID         string               `json:"simId"`
}

// Service is the validation layer between the Wails service and the store.
type Service struct {
	store *store.Store
}

func New(s *store.Store) *Service {
	return &Service{store: s}
}

// List returns every plan the user has set up.
func (s *Service) List() ([]store.RecurringPlan, error) {
	return s.store.ListRecurringPlans()
}

// Add validates a new plan and saves it. A contact may have several plans
// (different amounts, reminders or purposes), so duplicates are allowed; the
// dialog shows the existing ones instead of blocking the new one.
func (s *Service) Add(in Input) (store.RecurringPlan, error) {
	clean, err := normalize(in)
	if err != nil {
		return store.RecurringPlan{}, err
	}
	return s.store.AddRecurringPlan(clean)
}

// Update validates and replaces an existing plan.
func (s *Service) Update(id string, in Input) error {
	if strings.TrimSpace(id) == "" {
		return fmt.Errorf("missing plan id")
	}
	clean, err := normalize(in)
	if err != nil {
		return err
	}
	clean.ID = id
	return s.store.UpdateRecurringPlan(clean)
}

// SetSkipped marks one occurrence as handled without a recorded payment (paid
// in cash, or deliberately skipped), so the reminder for that cycle stops and
// the schedule moves on. An empty date undoes the skip.
func (s *Service) SetSkipped(id, due string) error {
	if strings.TrimSpace(id) == "" {
		return fmt.Errorf("missing plan id")
	}
	clean := strings.TrimSpace(due)
	if clean != "" {
		if _, err := time.Parse("2006-01-02", clean); err != nil {
			return fmt.Errorf("invalid skip date")
		}
	}
	return s.store.SetRecurringPlanSkipped(id, clean)
}

// Delete removes a plan.
func (s *Service) Delete(id string) error {
	if strings.TrimSpace(id) == "" {
		return fmt.Errorf("missing plan id")
	}
	return s.store.DeleteRecurringPlan(id)
}

// normalize trims, canonicalises and validates every field. It returns a
// store row (without id/createdAt): the store only ever sees validated rows.
func normalize(in Input) (store.RecurringPlan, error) {
	out := store.RecurringPlan{
		Name:          strings.TrimSpace(in.Name),
		Kind:          strings.ToLower(strings.TrimSpace(in.Kind)),
		Account:       strings.TrimSpace(in.Account),
		Amount:        in.Amount,
		Cadence:       strings.ToLower(strings.TrimSpace(in.Cadence)),
		AnchorDay:     in.AnchorDay,
		AnchorWeekday: in.AnchorWeekday,
		DueTime:       strings.TrimSpace(in.DueTime),
		LeadDays:      in.LeadDays,
		Remind:        in.Remind,
		SimID:         strings.TrimSpace(in.SimID),
	}

	switch out.Kind {
	case KindSend, KindPochi:
		number := phone.Normalize(in.Number)
		if number == "" {
			return out, fmt.Errorf("enter a valid Kenyan phone number")
		}
		out.Number = number
		out.Account = ""
		if out.Name == "" {
			out.Name = number
		}
	case KindPaybill, KindTill:
		number := digitsOnly(in.Number)
		if out.Kind == KindPaybill && (len(number) < 4 || len(number) > 7) {
			return out, fmt.Errorf("paybill numbers are 4 to 7 digits")
		}
		if out.Kind == KindTill && (len(number) < 5 || len(number) > 7) {
			return out, fmt.Errorf("till numbers are 5 to 7 digits")
		}
		out.Number = number
		if out.Kind == KindPaybill {
			if out.Account == "" {
				return out, fmt.Errorf("enter the paybill account")
			}
			if len(out.Account) > 20 || strings.ContainsAny(out.Account, "*#") {
				return out, fmt.Errorf("the account must be 20 characters or fewer and contain no * or #")
			}
		} else {
			out.Account = ""
		}
		if out.Name == "" {
			out.Name = number
		}
	default:
		return out, fmt.Errorf("choose a payment type")
	}

	if len([]rune(out.Name)) > 60 {
		return out, fmt.Errorf("the name is too long")
	}
	if out.Amount < 0 || out.Amount > MaxAmountCents {
		return out, fmt.Errorf("the amount must be between KES 1 and KES 250,000")
	}

	switch out.Cadence {
	case CadenceWeekly, CadenceBiweekly:
		if out.AnchorWeekday < 0 || out.AnchorWeekday > 6 {
			return out, fmt.Errorf("choose a day of the week")
		}
	case CadenceMonthly, CadenceQuarter:
		if out.AnchorDay < 1 || out.AnchorDay > 31 {
			return out, fmt.Errorf("choose a day of the month")
		}
	default:
		return out, fmt.Errorf("choose how often you pay")
	}

	if out.DueTime == "" {
		out.DueTime = "09:00"
	}
	if _, err := time.Parse("15:04", out.DueTime); err != nil {
		return out, fmt.Errorf("choose a valid reminder time")
	}
	reminders := in.Reminders
	if len(reminders) == 0 {
		reminders = []store.PlanReminder{{Days: in.LeadDays, Time: out.DueTime}}
	}
	if len(reminders) > 5 {
		return out, fmt.Errorf("use up to five reminders")
	}
	seen := make(map[string]bool, len(reminders))
	clean := make([]store.PlanReminder, 0, len(reminders))
	for _, reminder := range reminders {
		if reminder.Days < -MaxLeadDays || reminder.Days > MaxLeadDays {
			return out, fmt.Errorf("remind up to %d days before or after", MaxLeadDays)
		}
		if reminder.Time == "" {
			reminder.Time = out.DueTime
		}
		if _, err := time.Parse("15:04", reminder.Time); err != nil {
			return out, fmt.Errorf("choose a valid reminder time")
		}
		key := fmt.Sprintf("%d|%s", reminder.Days, reminder.Time)
		if seen[key] {
			continue
		}
		seen[key] = true
		clean = append(clean, reminder)
	}
	// Earliest first: 7 days before, 1 day before, on the day, then after.
	sort.SliceStable(clean, func(i, j int) bool {
		if clean[i].Days != clean[j].Days {
			return clean[i].Days > clean[j].Days
		}
		return clean[i].Time < clean[j].Time
	})
	out.Reminders = clean
	out.LeadDays = clean[0].Days
	if len(out.SimID) > 64 {
		return out, fmt.Errorf("invalid wallet")
	}
	return out, nil
}

func digitsOnly(raw string) string {
	var b strings.Builder
	for _, r := range raw {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}
