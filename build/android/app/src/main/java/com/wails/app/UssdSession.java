package com.wails.app;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * An armed M-Pesa quick-entry session: an ordered list of USSD steps supplied
 * by the frontend (phone number, amounts, paybill details collected in-app).
 * Immutable after parse; the service advances {@link #stepIndex} as prompts
 * match. Armed only by an explicit in-app tap, expires automatically.
 *
 * <p>JSON shape (frontend-owned, versioned):
 * <pre>
 * {"version":1,"kind":"send","timeoutSec":90,
 *  "steps":[{"match":["send money"],"input":"1"}, ...]}
 * </pre>
 * A step matches when the live USSD prompt contains ANY of its keywords
 * (case-insensitive); the service then types {@code input} and taps Send.
 * The PIN screen is never a step: it is detected separately and the service
 * always stops there (see {@link MpesaUssdService}).
 */
public final class UssdSession {
    static final int MAX_STEPS = 8;
    static final int MAX_INPUT_LEN = 24;
    static final int MIN_TIMEOUT_SEC = 30;
    static final int MAX_TIMEOUT_SEC = 180;

    public static final class Step {
        public final List<String> match;
        public final String input;

        Step(List<String> match, String input) {
            this.match = Collections.unmodifiableList(match);
            this.input = input;
        }
    }

    public final String kind;
    public final List<Step> steps;
    public final long timeoutMs;
    public final long createdAtMs;
    /** Index of the step currently waiting for its prompt. Service-owned. */
    public volatile int stepIndex = 0;

    private UssdSession(String kind, List<Step> steps, long timeoutMs) {
        this.kind = kind;
        this.steps = Collections.unmodifiableList(steps);
        this.timeoutMs = timeoutMs;
        this.createdAtMs = System.currentTimeMillis();
    }

    public boolean isExpired() {
        return System.currentTimeMillis() - createdAtMs > timeoutMs;
    }

    /** Parse and defensively validate a frontend script. Null when invalid. */
    public static UssdSession parse(String json) {
        if (json == null || json.length() > 4096) return null;
        try {
            JSONObject o = new JSONObject(json);
            if (o.optInt("version", -1) != 1) return null;
            String kind = o.optString("kind", "");
            if (!kind.equals("send") && !kind.equals("pochi")
                    && !kind.equals("paybill") && !kind.equals("till")) {
                return null;
            }
            JSONArray arr = o.optJSONArray("steps");
            if (arr == null || arr.length() == 0 || arr.length() > MAX_STEPS) {
                return null;
            }
            List<Step> steps = new ArrayList<>(arr.length());
            for (int i = 0; i < arr.length(); i++) {
                JSONObject s = arr.optJSONObject(i);
                if (s == null) return null;
                JSONArray matchArr = s.optJSONArray("match");
                if (matchArr == null || matchArr.length() == 0
                        || matchArr.length() > 5) {
                    return null;
                }
                List<String> match = new ArrayList<>(matchArr.length());
                for (int j = 0; j < matchArr.length(); j++) {
                    String kw = matchArr.optString(j, "").trim().toLowerCase();
                    if (kw.isEmpty() || kw.length() > 32) return null;
                    match.add(kw);
                }
                String input = s.optString("input", "");
                if (input.isEmpty() || input.length() > MAX_INPUT_LEN) {
                    return null;
                }
                // Control chars would navigate USSD menus in surprising ways.
                for (int k = 0; k < input.length(); k++) {
                    char c = input.charAt(k);
                    if (c < 0x20 || c == '*' || c == '#') return null;
                }
                steps.add(new Step(match, input));
            }
            int timeoutSec = o.optInt("timeoutSec", 90);
            if (timeoutSec < MIN_TIMEOUT_SEC || timeoutSec > MAX_TIMEOUT_SEC) {
                timeoutSec = 90;
            }
            return new UssdSession(kind, steps, timeoutSec * 1000L);
        } catch (Exception e) {
            return null;
        }
    }
}
