package categories

import (
	"fmt"
	"math"
	"time"

	"mpesa-analyzer/internal/parser"
)

// Budget states reported to the UI. A category with no cap is "none"; a cap
// with nothing spent yet is "ok". "near" starts at 80% of the cap (and covers
// the moment the cap is reached exactly), while "over" means spending has
// passed it.
const (
	BudgetNone = "none"
	BudgetOK   = "ok"
	BudgetNear = "near"
	BudgetOver = "over"

	budgetNearPercent = 80
	minBudgetCents    = 100           // KES 1
	maxBudgetCents    = 1_000_000_000 // KES 10,000,000
	centsPerShilling  = 100
	percentScale      = 100
)

// BudgetStatus is one category's position against its monthly cap. Spent is a
// positive amount in cents and counts gross outflows only: a refund or other
// money-in row does not reduce what was spent. Remaining is Budget - Spent, so
// it goes negative when the category is over. Percent is rounded to one
// decimal and is 0 when there is no budget.
type BudgetStatus struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Icon      string  `json:"icon"`
	Budget    int64   `json:"budget"`
	Spent     int64   `json:"spent"`
	Remaining int64   `json:"remaining"`
	Count     int     `json:"count"`
	Percent   float64 `json:"percent"`
	State     string  `json:"state"`
}

// BudgetReport is the whole set of categories for one month. Month is
// "YYYY-MM" and follows the newest transaction in the dataset, because
// imported statements are often historical; Current says whether that month
// is the real current month, so a warning is never raised about a past month.
//
// Statuses includes categories without a budget (State "none") so the edit
// sheet can preview this month's spend before a cap is chosen. They stay in
// the user's display order.
type BudgetReport struct {
	Month    string         `json:"month"`
	Current  bool           `json:"current"`
	Statuses []BudgetStatus `json:"statuses"`
}

// SetBudget stores a category's monthly spending cap. A zero clears the cap.
// Budgets are whole shillings because the app's money entry is, and the cap is
// validated here rather than in the UI so every caller shares one rule.
func (s *Service) SetBudget(id string, budget int64) error {
	if err := cleanBudget(budget); err != nil {
		return err
	}
	return s.store.SetCategoryBudget(id, budget)
}

func cleanBudget(budget int64) error {
	if budget == 0 {
		return nil
	}
	if budget < minBudgetCents {
		return fmt.Errorf("set a monthly budget of at least KES 1")
	}
	if budget > maxBudgetCents {
		return fmt.Errorf("that monthly budget is too large")
	}
	if budget%centsPerShilling != 0 {
		return fmt.Errorf("monthly budgets are set in whole shillings")
	}
	return nil
}

// BudgetReport computes every category's spend for the dataset's newest month.
// It resolves categories through the same rules as the donut, so the budget
// and the chart can never disagree about which transaction belongs where.
func (s *Service) BudgetReport(txs []parser.Transaction) (BudgetReport, error) {
	ix, err := s.Load()
	if err != nil {
		return BudgetReport{}, err
	}

	month := budgetMonth(txs)
	report := BudgetReport{
		Month:    month,
		Current:  month == time.Now().Format("2006-01"),
		Statuses: make([]BudgetStatus, 0, len(ix.order)),
	}

	monthTxs := make([]parser.Transaction, 0, len(txs))
	for _, tx := range txs {
		if len(tx.Date) >= 7 && tx.Date[:7] == month {
			monthTxs = append(monthTxs, tx)
		}
	}
	assigned := ix.ResolveAll(monthTxs)

	spent := make(map[string]int64, len(ix.order))
	counts := make(map[string]int, len(ix.order))
	for _, tx := range monthTxs {
		if tx.Amount >= 0 {
			continue
		}
		c, ok := assigned[tx.ID]
		if !ok {
			continue
		}
		spent[c.ID] += -tx.Amount
		counts[c.ID]++
	}

	for _, id := range ix.order {
		c := ix.categories[id]
		st := BudgetStatus{
			ID:     c.ID,
			Name:   c.Name,
			Icon:   c.Icon,
			Budget: c.Budget,
			Spent:  spent[c.ID],
			Count:  counts[c.ID],
			State:  BudgetNone,
		}
		if c.Budget > 0 {
			st.Remaining = c.Budget - st.Spent
			st.Percent = math.Round(float64(st.Spent)/float64(c.Budget)*1000) / 10
			switch {
			case st.Spent > c.Budget:
				st.State = BudgetOver
			case st.Spent*percentScale >= c.Budget*budgetNearPercent:
				st.State = BudgetNear
			default:
				st.State = BudgetOK
			}
		}
		report.Statuses = append(report.Statuses, st)
	}
	return report, nil
}

// budgetMonth is the newest "YYYY-MM" in the dataset, or the current month
// when there is no data yet. Anchoring to the data keeps a budget honest for a
// statement that was imported months after it was issued.
func budgetMonth(txs []parser.Transaction) string {
	month := ""
	for _, tx := range txs {
		if len(tx.Date) < 7 {
			continue
		}
		if m := tx.Date[:7]; m > month {
			month = m
		}
	}
	if month == "" {
		return time.Now().Format("2006-01")
	}
	return month
}
