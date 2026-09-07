package main

import (
	"encoding/json"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// MobileInfoService exposes mobile device metrics to the frontend.
// On Android the values come from the native window insets via the Wails
// bridge; on desktop builds application.Mobile is a no-op stub, so all
// values are zero. See pkg/application/mobile.go in Wails v3.
type MobileInfoService struct{}

// SafeAreaInsets are system-bar insets in physical pixels.
type SafeAreaInsets struct {
	Top    float64 `json:"top"`
	Bottom float64 `json:"bottom"`
	Left   float64 `json:"left"`
	Right  float64 `json:"right"`
}

// SafeArea returns the current system-bar insets in physical pixels.
// The frontend divides by window.devicePixelRatio to get CSS pixels.
func (s *MobileInfoService) SafeArea() SafeAreaInsets {
	var out SafeAreaInsets
	if raw := application.Mobile.SafeAreaJSON(); raw != "" {
		_ = json.Unmarshal([]byte(raw), &out)
	}
	return out
}
