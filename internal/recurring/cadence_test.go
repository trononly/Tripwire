package recurring

import "testing"

func TestClassifyCadence(t *testing.T) {
	cases := []struct {
		medianGap int64
		want      string
		wantOK    bool
	}{
		{0, "", false},
		{4, "", false},
		{5, "weekly", true},
		{7, "weekly", true},
		{9, "weekly", true},
		{10, "", false}, // dead zone: 10-day pattern is not "close enough" to weekly
		{11, "bi-weekly", true},
		{14, "bi-weekly", true},
		{17, "bi-weekly", true},
		{18, "", false},
		{23, "monthly", true},
		{30, "monthly", true},
		{37, "monthly", true},
		{38, "", false},
		{76, "quarterly", true},
		{90, "quarterly", true},
		{104, "quarterly", true},
		{105, "", false},
		{365, "", false},
	}
	for _, tc := range cases {
		rule, ok := classifyCadence(tc.medianGap)
		if ok != tc.wantOK || (ok && rule.name != tc.want) {
			t.Errorf("classifyCadence(%d) = %q, %v; want %q, %v", tc.medianGap, rule.name, ok, tc.want, tc.wantOK)
		}
	}
}

func TestCadenceToleranceGrowsWithCadence(t *testing.T) {
	// The same absolute deviation is less significant for longer cycles,
	// so the MAD allowance must be non-decreasing across the table.
	for i := 1; i < len(cadenceRules); i++ {
		if cadenceRules[i].maxMAD < cadenceRules[i-1].maxMAD {
			t.Errorf("cadence %q maxMAD %d < %q maxMAD %d",
				cadenceRules[i].name, cadenceRules[i].maxMAD,
				cadenceRules[i-1].name, cadenceRules[i-1].maxMAD)
		}
		if cadenceRules[i].minGap <= cadenceRules[i-1].maxGap {
			t.Errorf("cadence windows overlap: %q and %q", cadenceRules[i-1].name, cadenceRules[i].name)
		}
	}
	for _, r := range cadenceRules {
		if r.minCount < minOccurrences {
			t.Errorf("cadence %q minCount %d below absolute floor %d", r.name, r.minCount, minOccurrences)
		}
	}
}
