package phone

import "testing"

func TestNormalize(t *testing.T) {
	cases := map[string]string{
		"0712 345 678":         "0712345678",
		"0712345678":           "0712345678",
		"0112 345 678":         "0112345678",
		"+254 712 345 678":     "0712345678",
		"254712345678":         "0712345678",
		"00254 712 345 678":    "0712345678",
		"712345678":            "0712345678",
		"0712-345-678":         "0712345678",
		"(0712) 345 678":       "0712345678",
		"+254 (0) 712 345 678": "0712345678",
	}
	for raw, want := range cases {
		if got := Normalize(raw); got != want {
			t.Errorf("Normalize(%q) = %q, want %q", raw, got, want)
		}
	}
}

func TestNormalizeRejectsNonMobile(t *testing.T) {
	for _, raw := range []string{
		"",
		"12345",
		"020 123 4567", // Nairobi landline
		"+44 7700 900123",
		"071234567",   // too short
		"07123456789", // too long
		"0812345678",  // not a mobile prefix
	} {
		if got := Normalize(raw); got != "" {
			t.Errorf("Normalize(%q) = %q, want empty", raw, got)
		}
	}
}
