package recurring

import "testing"

func TestMedianOdd(t *testing.T) {
	got, ok := median([]int64{9, 1, 5})
	if !ok || got != 5 {
		t.Errorf("median([9,1,5]) = %d, %v; want 5, true", got, ok)
	}
}

func TestMedianEvenRoundsHalfUp(t *testing.T) {
	cases := []struct {
		name string
		in   []int64
		want int64
	}{
		{"two values exact", []int64{1, 3}, 2},
		{"two values .5 rounds up", []int64{2, 3}, 3},
		{"four values .5 rounds up", []int64{1, 2, 3, 4}, 3},
		{"four values exact", []int64{10, 20, 30, 40}, 25},
		{"duplicates", []int64{7, 7, 7, 7}, 7},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := median(tc.in)
			if !ok || got != tc.want {
				t.Errorf("median(%v) = %d, %v; want %d, true", tc.in, got, ok, tc.want)
			}
		})
	}
}

func TestMedianEmpty(t *testing.T) {
	if _, ok := median(nil); ok {
		t.Error("median(nil) should report !ok")
	}
}

func TestMedianDoesNotMutateInput(t *testing.T) {
	in := []int64{3, 1, 2}
	median(in)
	if in[0] != 3 || in[1] != 1 || in[2] != 2 {
		t.Errorf("median mutated its input: %v", in)
	}
}

func TestMedianAbsoluteDeviation(t *testing.T) {
	cases := []struct {
		name string
		in   []int64
		want int64
	}{
		{"one outlier among equals", []int64{0, 7, 7, 7}, 0},
		{"symmetric spread", []int64{4, 7, 10}, 3},
		{"tight", []int64{6, 8, 6, 8}, 1},
		{"single value", []int64{42}, 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := medianAbsoluteDeviation(tc.in)
			if !ok || got != tc.want {
				t.Errorf("MAD(%v) = %d, %v; want %d, true", tc.in, got, ok, tc.want)
			}
		})
	}
}

func TestMedianAbsoluteDeviationEmpty(t *testing.T) {
	if _, ok := medianAbsoluteDeviation(nil); ok {
		t.Error("MAD(nil) should report !ok")
	}
}
