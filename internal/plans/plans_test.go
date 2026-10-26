package plans

import (
	"path/filepath"
	"testing"

	"mpesa-analyzer/internal/store"
)

func newStore(t *testing.T) *store.Store {
	t.Helper()
	s, err := store.New(filepath.Join(t.TempDir(), "plans.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func sendPlan() Input {
	return Input{
		Name:          "Agnes Muiruri",
		Kind:          KindSend,
		Number:        "+254 712 345 678",
		Amount:        25_000,
		Cadence:       CadenceMonthly,
		AnchorDay:     5,
		DueTime:       "09:00",
		LeadDays:      1,
		Remind:        true,
		AnchorWeekday: 0,
	}
}

func TestAddNormalizesAndPersists(t *testing.T) {
	svc := New(newStore(t))

	got, err := svc.Add(sendPlan())
	if err != nil {
		t.Fatalf("add: %v", err)
	}
	if got.Number != "0712345678" {
		t.Fatalf("number = %q, want normalized 0712345678", got.Number)
	}
	if got.ID == "" || got.CreatedAt.IsZero() {
		t.Fatalf("missing generated id/createdAt: %+v", got)
	}

	all, err := svc.List()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(all) != 1 || all[0].Name != "Agnes Muiruri" {
		t.Fatalf("list = %+v", all)
	}
}

func TestPaybillNeedsAccount(t *testing.T) {
	svc := New(newStore(t))

	plan := Input{
		Name: "KPLC", Kind: KindPaybill, Number: "888880",
		Cadence: CadenceMonthly, AnchorDay: 3, DueTime: "09:00",
	}
	if _, err := svc.Add(plan); err == nil {
		t.Fatal("expected a missing-account error")
	}

	plan.Account = "01450540651"
	got, err := svc.Add(plan)
	if err != nil {
		t.Fatalf("add paybill: %v", err)
	}
	if got.Amount != 0 {
		t.Fatalf("amount = %d, want 0 (ask each time)", got.Amount)
	}
}

func TestSameContactCanHaveSeveralPlans(t *testing.T) {
	svc := New(newStore(t))

	first := sendPlan()
	first.Name = "Walter — bundles"
	first.Amount = 10_000
	second := sendPlan()
	second.Name = "Walter — rent"
	second.Amount = 1_500_000

	if _, err := svc.Add(first); err != nil {
		t.Fatalf("first add: %v", err)
	}
	if _, err := svc.Add(second); err != nil {
		t.Fatalf("second add for the same contact: %v", err)
	}
	// Even the exact same target and amount is allowed: the user may keep two
	// reminders for one payment (for example a weekly and a monthly one).
	if _, err := svc.Add(first); err != nil {
		t.Fatalf("duplicate add: %v", err)
	}

	all, err := svc.List()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(all) != 3 {
		t.Fatalf("want 3 plans, got %d: %+v", len(all), all)
	}
}

func TestUpdateKeepsSameRow(t *testing.T) {
	svc := New(newStore(t))

	added, err := svc.Add(sendPlan())
	if err != nil {
		t.Fatalf("add: %v", err)
	}
	updated := sendPlan()
	updated.Amount = 30_000
	updated.Name = "Mum"
	if err := svc.Update(added.ID, updated); err != nil {
		t.Fatalf("update: %v", err)
	}

	all, err := svc.List()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(all) != 1 || all[0].Amount != 30_000 || all[0].Name != "Mum" {
		t.Fatalf("after update: %+v", all)
	}
	if err := svc.Delete(added.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if all, _ := svc.List(); len(all) != 0 {
		t.Fatalf("after delete: %+v", all)
	}
}

func TestInvalidFields(t *testing.T) {
	svc := New(newStore(t))

	cases := map[string]func(*Input){
		"bad kind":      func(p *Input) { p.Kind = "airtime" },
		"bad phone":     func(p *Input) { p.Number = "123" },
		"bad cadence":   func(p *Input) { p.Cadence = "daily" },
		"bad anchor":    func(p *Input) { p.AnchorDay = 32 },
		"bad time":      func(p *Input) { p.DueTime = "9 am" },
		"bad amount":    func(p *Input) { p.Amount = -1 },
		"bad lead time": func(p *Input) { p.LeadDays = 15 },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			plan := sendPlan()
			mutate(&plan)
			if _, err := svc.Add(plan); err == nil {
				t.Fatalf("%s: expected error", name)
			}
		})
	}
}
