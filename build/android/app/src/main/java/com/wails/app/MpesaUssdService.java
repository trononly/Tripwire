package com.wails.app;

import android.accessibilityservice.AccessibilityService;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import org.json.JSONObject;

/**
 * Steps through Safaricom *334# USSD menus on the user's behalf.
 *
 * <p>How it works: the app dials plain {@code *334#}; this service watches
 * the system phone dialog, matches each prompt against the armed
 * {@link UssdSession} (one step at a time, in order), types the value and
 * taps Send - phone number, amounts, paybill details, and the final
 * "1 = Yes" confirmation. The receipt still arrives via the SMS catcher.
 *
 * <p>Hard rules (non-negotiable):
 * <ul>
 *   <li>PIN is never touched: a PIN/secret prompt stops the service (no
 *       setText, no scraping). It stays armed and silent until the next
 *       non-PIN prompt - the user types the PIN manually in the phone
 *       dialog - or the session times out.</li>
 *   <li>User-initiated only: acts solely while a session is armed by an
 *       in-app tap, and disarms on completion, abort, or timeout (~90s).</li>
 *   <li>Least privilege: only touches phone/dialer windows; every other
 *       package (including this app) is ignored. No notification or web
 *       content is ever read.</li>
 *   <li>Abort on unknown: a prompt matching neither the PIN indicators nor
 *       the current step (repeatedly) aborts instead of guessing.</li>
 * </ul>
 *
 * <p>Progress is reported to the frontend as {@code common:ussd-auto}
 * events: {state:"step"|"awaiting-pin"|"awaiting-confirm"|"complete"|"aborted",
 * step?, steps?, reason?}. "awaiting-confirm" means the script asked us to
 * stop at the final "1 = Yes" prompt so the user confirms it manually;
 * "complete" means every value (including that confirmation) was entered.
 * The payment itself is only confirmed by the SMS receipt, never by us.
 *
 * <p>Note on filtering: the service config intentionally lists no packages
 * so OEM dialers are not silently excluded; the hard package filter below
 * (plus never touching our own package) is what enforces least privilege.
 */
public class MpesaUssdService extends AccessibilityService {
    private static final String TAG = "MpesaUssd";
    private static final boolean DEBUG = BuildConfig.DEBUG;

    /** Substrings identifying system phone/dialer windows (any OEM). */
    private static final String[] PHONE_HINTS = {
        "phone", "dialer", "incallui", "telephony"
    };
    /** PIN prompt indicators (English + Kiswahili "siri" = secret). */
    private static final String[] PIN_WORDS = {
        "pin", "secret", "password", "siri"
    };
    /** Labels of the dialog's Send/OK button (English + Kiswahili). */
    private static final String[] SEND_WORDS = {
        "send", "ok", "tuma", "submit", "confirm", "thibitisha", "sawa",
        "endelea", "next"
    };
    /** Words on a dialog that is still loading (English + Kiswahili). */
    private static final String[] LOADING_WORDS = {
        "loading", "please wait", "inapakia", "subira",
        // The phone app says this while the gateway is still replying.
        "code running", "ussd code running"
    };
    /** Distinct unknown prompts in a row before giving up. */
    private static final int ABORT_AFTER_UNKNOWN = 4;
    /** Minimum gap between two performed actions. */
    private static final long ACTION_DEBOUNCE_MS = 600;
    /**
     * While armed, re-check the screen this often instead of waiting for the
     * OS to deliver an event: a settled menu that fires nothing must still
     * be acted on the moment it is ready. Bounded (armed window only).
     */
    private static final long POLL_MS = 400;
    /**
     * Acted-on prompt still showing after this long: the input was likely
     * wiped by a dialog refresh, so the step gets one retry. Time-based (not
     * event-count-based) so polling cannot trigger a premature re-send.
     */
    private static final long RETRY_AFTER_MS = 4000;

    private static final Object LOCK = new Object();
    private static volatile UssdSession armed = null;
    /** The live service instance, so arm() can start polling immediately. */
    private static volatile MpesaUssdService instance = null;

    // Connection diagnostics. These are deliberately process-local: after a
    // process death there is no connection to claim, so zero/empty values are
    // the honest answer until Android binds the service again.
    private static volatile long lastConnectedAtMs = 0L;
    private static volatile long lastDisconnectedAtMs = 0L;
    private static volatile long lastInterruptedAtMs = 0L;
    private static volatile String lastStateReason = "";

    // Per-attempt state (this service is effectively single-threaded: all
    // callbacks arrive on the main thread).
    private UssdSession lastSession = null;
    private String lastActedPrompt = null;
    private String lastSeenPrompt = null;
    private int unknownStreak = 0;
    /** Step index already granted its one retry (see RETRY_AFTER_MS). */
    private int lastRetriedStep = -1;
    private long lastActionAt = 0;
    private boolean pinAnnounced = false;

    private final Handler pollHandler = new Handler(Looper.getMainLooper());
    private boolean polling = false;
    private final Runnable pollTask = new Runnable() {
        @Override
        public void run() {
            polling = false;
            UssdSession session;
            synchronized (LOCK) {
                session = armed;
            }
            if (session == null) return;
            try {
                handleSession(session);
            } catch (Exception e) {
                Log.e(TAG, "poll failed", e);
            }
            synchronized (LOCK) {
                if (armed != null && !polling) {
                    polling = true;
                    pollHandler.postDelayed(this, POLL_MS);
                }
            }
        }
    };

    /** Start the armed-window poll loop unless already running. */
    private void ensurePolling() {
        if (!polling) {
            polling = true;
            pollHandler.postDelayed(pollTask, POLL_MS);
        }
    }

    private void stopPolling() {
        polling = false;
        pollHandler.removeCallbacks(pollTask);
    }

    /** True once the system has actually bound this service. */
    public static boolean isConnected() {
        return instance != null;
    }

    /**
     * Arm a session (replaces any previous one). Called by WailsBridge.
     *
     * @return false when Android has not bound the service. Callers must not
     * dial in that case: arming a payment while disconnected would let a
     * later reconnection execute a stale action.
     */
    public static boolean arm(UssdSession session) {
        MpesaUssdService svc = instance;
        if (svc == null) {
            Log.w(TAG, "cannot arm: service is not connected");
            return false;
        }
        synchronized (LOCK) {
            armed = session;
        }
        if (DEBUG) Log.d(TAG, "session armed: kind=" + session.kind
                + " steps=" + session.steps.size());
        // Do not wait for an accessibility event: the system USSD dialog is
        // a TYPE_SYSTEM window and often produces no event the service sees.
        // Poll from the moment the session is armed.
        svc.ensurePolling();
        return true;
    }

    /** Disarm silently (timeout/complete/abort paths emit first). */
    public static void disarm() {
        synchronized (LOCK) {
            armed = null;
        }
    }

    private static void emit(String state, UssdSession s, String reason) {
        emit(state, s, reason, null);
    }

    private static void emit(String state, UssdSession s, String reason,
            String code) {
        WailsBridge bridge = WailsBridge.getInstance();
        if (bridge == null) {
            if (DEBUG) Log.d(TAG, "no bridge, dropping event: " + state);
            return;
        }
        try {
            JSONObject o = new JSONObject()
                    .put("state", state);
            if (s != null) {
                o.put("kind", s.kind)
                 .put("step", Math.min(s.stepIndex + 1, s.steps.size()))
                 .put("steps", s.steps.size());
            }
            if (reason != null) o.put("reason", reason);
            if (code != null) o.put("code", code);
            bridge.emitEvent("common:ussd-auto", o.toString());
        } catch (Exception e) {
            Log.e(TAG, "emit failed", e);
        }
    }

    /** Tell the WebView that Android bound or released the service. */
    private static void emitConnectionState(boolean connected, String reason) {
        WailsBridge bridge = WailsBridge.getInstance();
        if (bridge == null) return;
        try {
            bridge.emitEvent("common:automation", new JSONObject()
                    .put("connected", connected)
                    .put("reason", reason)
                    .put("at", System.currentTimeMillis())
                    .toString());
        } catch (Exception e) {
            Log.e(TAG, "could not emit connection state", e);
        }
    }

    /**
     * The system has released this binding. Drop any armed payment first:
     * reconnecting must never resume an old action. The frontend also gets an
     * "interrupted" result so it can ask the user to verify the transaction.
     */
    private static void markDisconnected(String reason) {
        MpesaUssdService svc = instance;
        if (svc == null) return;
        instance = null;
        svc.stopPolling();

        UssdSession interrupted;
        synchronized (LOCK) {
            interrupted = armed;
            armed = null;
        }
        lastDisconnectedAtMs = System.currentTimeMillis();
        lastStateReason = reason == null ? "" : reason;
        emitConnectionState(false, lastStateReason);
        if (interrupted != null) {
            emit("aborted", interrupted, "accessibility disconnected",
                    "accessibility-disconnected");
            Log.i(TAG, "armed session interrupted by disconnect: " + reason);
        }
    }

    @Override
    public void onServiceConnected() {
        Log.i(TAG, "connected");
        instance = this;
        lastConnectedAtMs = System.currentTimeMillis();
        lastStateReason = "connected";
        // A binding is never permission to resume a payment that was armed
        // before the disconnect. Disarm defensively and report it.
        UssdSession stale;
        synchronized (LOCK) {
            stale = armed;
            armed = null;
        }
        if (stale != null) {
            emit("aborted", stale, "accessibility reconnected",
                    "accessibility-reconnected");
        }
        emitConnectionState(true, "connected");
    }

    @Override
    public void onInterrupt() {
        lastInterruptedAtMs = System.currentTimeMillis();
        lastStateReason = "interrupted";
        Log.i(TAG, "interrupted");
        // The service can remain bound after onInterrupt; report the live
        // state rather than pretending it disconnected.
        emitConnectionState(instance != null, "interrupted");
    }

    @Override
    public boolean onUnbind(android.content.Intent intent) {
        markDisconnected("unbound");
        return super.onUnbind(intent);
    }

    @Override
    public void onDestroy() {
        markDisconnected("destroyed");
        super.onDestroy();
    }

    /** Diagnostics for the Settings troubleshooting panel (no payment data). */
    public static JSONObject diagnostics() {
        JSONObject o = new JSONObject();
        try {
            o.put("connected", isConnected());
            o.put("lastConnectedAt", lastConnectedAtMs);
            o.put("lastDisconnectedAt", lastDisconnectedAtMs);
            o.put("lastInterruptedAt", lastInterruptedAtMs);
            o.put("lastReason", lastStateReason);
            UssdSession s;
            synchronized (LOCK) {
                s = armed;
            }
            o.put("armed", s != null);
            if (s != null) {
                o.put("kind", s.kind);
                o.put("step", Math.min(s.stepIndex + 1, s.steps.size()));
                o.put("steps", s.steps.size());
            }
        } catch (Exception e) {
            Log.e(TAG, "diagnostics failed", e);
        }
        return o;
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;
        int type = event.getEventType();
        if (type != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                && type != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) {
            return;
        }
        UssdSession session;
        synchronized (LOCK) {
            session = armed;
        }
        if (session == null) return;
        ensurePolling();
        handleSession(session);
    }

    /** One look at the live screen: match → act, PIN → wait, else count. */
    private void handleSession(UssdSession session) {
        if (session.isExpired()) {
            disarm();
            emit("aborted", session, "timeout", "timeout");
            Log.i(TAG, "session timed out");
            return;
        }
        if (session != lastSession) {
            lastSession = session;
            lastActedPrompt = null;
            lastSeenPrompt = null;
            unknownStreak = 0;
            lastRetriedStep = -1;
            lastActionAt = 0;
            pinAnnounced = false;
        }
        AccessibilityNodeInfo root = findPhoneRoot();
        if (root == null) {
            if (DEBUG) Log.d(TAG, "no phone window in " + describeWindows());
            return;
        }
        try {
            CharSequence pkgSeq = root.getPackageName();
            String pkg = pkgSeq != null ? pkgSeq.toString() : "";
            // Never touch our own UI (or anything that is not the phone app).
            if (pkg.equals(getPackageName()) || !isPhonePackage(pkg)) {
                if (DEBUG) Log.d(TAG, "ignoring package=" + pkg);
                return;
            }

            String prompt = collectText(root, new StringBuilder(), 0);
            if (prompt.isEmpty()) {
                if (DEBUG) Log.d(TAG, "empty prompt pkg=" + pkg);
                return;
            }
            String norm = prompt.toLowerCase();
            if (DEBUG && !prompt.equals(lastSeenPrompt)) {
                String flat = prompt.replace('\n', ' ').trim();
                if (flat.length() > 160) flat = flat.substring(0, 160);
                Log.d(TAG, "prompt pkg=" + pkg + " text=" + flat);
            }

            // Dialog still loading (spinner / "please wait", common on weak
            // networks): wait for the real prompt. Not an error, and not an
            // unknown prompt - leave the streak alone.
            if (isLoading(norm, root)) return;

            // PIN screen: stop. Stay armed for the post-PIN confirmation
            // prompt, take no action, scrape nothing.
            if (isPinPrompt(norm, root)) {
                if (!pinAnnounced) {
                    pinAnnounced = true;
                    emit("awaiting-pin", session, null);
                    Log.i(TAG, "PIN prompt, waiting for user");
                }
                return;
            }

            if (session.stepIndex >= session.steps.size()) return;
            UssdSession.Step step = session.steps.get(session.stepIndex);
            if (matches(step, norm)) {
                unknownStreak = 0;
                if (prompt.equals(lastActedPrompt)) {
                    // Same prompt still showing after we acted: on a slow
                    // network the dialog may have refreshed and wiped our
                    // input, or the Send tap may not have registered. After
                    // RETRY_AFTER_MS the step gets exactly one retry; then
                    // we wait out the session rather than spamming Send.
                    if (System.currentTimeMillis() - lastActionAt
                            > RETRY_AFTER_MS
                            && lastRetriedStep != session.stepIndex) {
                        lastRetriedStep = session.stepIndex;
                        lastActedPrompt = null;
                        if (DEBUG) {
                            Log.d(TAG, "prompt persisted, retrying step "
                                    + (session.stepIndex + 1));
                        }
                    }
                    return;
                }
                if (System.currentTimeMillis() - lastActionAt
                        < ACTION_DEBOUNCE_MS) {
                    return;
                }
                // The final "1 = Yes" prompt is the user's confirmation
                // unless they explicitly opted into auto-confirm. Leave the
                // dialog on screen and hand control back.
                if (step.confirm && !session.confirmAfterPin) {
                    disarm();
                    emit("awaiting-confirm", session, null);
                    Log.i(TAG, "confirmation left to user");
                    return;
                }
                if (doStep(root, step.input)) {
                    lastActedPrompt = prompt;
                    lastActionAt = System.currentTimeMillis();
                    session.stepIndex++;
                    if (session.stepIndex >= session.steps.size()) {
                        disarm();
                        emit("complete", session, null);
                        Log.i(TAG, "all steps entered");
                    } else {
                        emit("step", session, null);
                    }
                } else if (DEBUG) {
                    Log.d(TAG, "prompt matched but no input/send node yet");
                }
                return;
            }

            // Unknown prompt: count distinct ones, abort instead of guessing.
            if (!prompt.equals(lastSeenPrompt)) {
                lastSeenPrompt = prompt;
                unknownStreak++;
                if (DEBUG) Log.d(TAG, "unknown prompt (" + unknownStreak + ")");
                if (unknownStreak >= ABORT_AFTER_UNKNOWN) {
                    disarm();
                    emit("aborted", session, "unexpected prompt",
                            "unexpected-prompt");
                    Log.i(TAG, "aborting on unexpected prompt");
                }
            }
        } finally {
            root.recycle();
        }
    }

    /**
     * Root of the window showing the USSD dialog.
     *
     * <p>The dialog is a {@code TYPE_SYSTEM_DIALOG} owned by the phone app
     * that sits on top of whatever is underneath. On several OEM builds it
     * does not become the "active" window, so {@link #getRootInActiveWindow()}
     * hands back our own WebView and the phone dialog is never seen. Prefer a
     * window whose package is a phone package, and fall back to the active
     * window only when no phone window is present.
     */
    private AccessibilityNodeInfo findPhoneRoot() {
        try {
            java.util.List<AccessibilityWindowInfo> windows = getWindows();
            if (windows != null) {
                AccessibilityNodeInfo best = null;
                for (AccessibilityWindowInfo w : windows) {
                    AccessibilityNodeInfo r = w.getRoot();
                    if (r == null) continue;
                    CharSequence p = r.getPackageName();
                    String pkg = p != null ? p.toString() : "";
                    if (!pkg.equals(getPackageName()) && isPhonePackage(pkg)) {
                        // Later windows are higher up; keep the topmost.
                        if (best != null) best.recycle();
                        best = r;
                    } else {
                        r.recycle();
                    }
                }
                if (best != null) return best;
            }
        } catch (Exception e) {
            if (DEBUG) Log.d(TAG, "getWindows failed: " + e);
        }
        return getRootInActiveWindow();
    }

    /** Debug helper: packages of every retrievable window, topmost last. */
    private String describeWindows() {
        StringBuilder sb = new StringBuilder();
        try {
            java.util.List<AccessibilityWindowInfo> windows = getWindows();
            if (windows == null) return "(none)";
            for (AccessibilityWindowInfo w : windows) {
                AccessibilityNodeInfo r = w.getRoot();
                if (r == null) continue;
                try {
                    CharSequence p = r.getPackageName();
                    sb.append(p != null ? p.toString() : "?")
                      .append(":t").append(w.getType()).append(' ');
                } finally {
                    r.recycle();
                }
            }
        } catch (Exception e) {
            return "(error " + e + ")";
        }
        return sb.length() == 0 ? "(none)" : sb.toString().trim();
    }

    private static boolean isPhonePackage(String pkg) {
        String lower = pkg.toLowerCase();
        for (String hint : PHONE_HINTS) {
            if (lower.contains(hint)) return true;
        }
        return false;
    }

    private static boolean matches(UssdSession.Step step, String normPrompt) {
        for (String kw : step.match) {
            if (normPrompt.contains(kw)) return true;
        }
        return false;
    }

    /** PIN indicators in text, or a password-style input field. */
    private static boolean isPinPrompt(String normPrompt,
            AccessibilityNodeInfo root) {
        for (String w : PIN_WORDS) {
            if (normPrompt.contains(w)) return true;
        }
        AccessibilityNodeInfo input = findEditable(root);
        try {
            if (input != null) {
                int variation = input.getInputType()
                        & InputType.TYPE_MASK_VARIATION;
                if (variation == InputType.TYPE_TEXT_VARIATION_PASSWORD
                        || variation
                                == InputType.TYPE_NUMBER_VARIATION_PASSWORD) {
                    return true;
                }
            }
        } catch (Exception e) {
            // getInputType unavailable on this device; keyword check stands.
        } finally {
            if (input != null) input.recycle();
        }
        return false;
    }

    /** True while the dialog is still loading (spinner / "please wait"). */
    private static boolean isLoading(String normPrompt,
            AccessibilityNodeInfo root) {
        for (String w : LOADING_WORDS) {
            if (normPrompt.contains(w)) return true;
        }
        AccessibilityNodeInfo bar = bfs(root, (n) -> {
            CharSequence cls = n.getClassName();
            return cls != null && cls.toString().endsWith("ProgressBar");
        });
        if (bar != null) {
            bar.recycle();
            return true;
        }
        return false;
    }

    /** Type the value, then tap the dialog's Send button. */
    private boolean doStep(AccessibilityNodeInfo root, String value) {
        AccessibilityNodeInfo input = findEditable(root);
        if (input == null) return false;
        try {
            Bundle args = new Bundle();
            args.putCharSequence(
                    AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                    value);
            if (!input.performAction(
                    AccessibilityNodeInfo.ACTION_SET_TEXT, args)) {
                return false;
            }
        } finally {
            input.recycle();
        }
        // Re-resolve: the tree may have changed after typing.
        AccessibilityNodeInfo fresh = findPhoneRoot();
        if (fresh == null) return false;
        try {
            AccessibilityNodeInfo send = findSendButton(fresh);
            if (send == null) return false;
            try {
                return send.performAction(AccessibilityNodeInfo.ACTION_CLICK);
            } finally {
                send.recycle();
            }
        } finally {
            fresh.recycle();
        }
    }

    private static AccessibilityNodeInfo findEditable(
            AccessibilityNodeInfo root) {
        return bfs(root, (n) -> {
            CharSequence cls = n.getClassName();
            return cls != null && cls.toString().endsWith("EditText");
        });
    }

    private static AccessibilityNodeInfo findSendButton(
            AccessibilityNodeInfo root) {
        // Prefer a real Button with a Send-like label…
        AccessibilityNodeInfo btn = bfs(root, (n) -> {
            CharSequence cls = n.getClassName();
            return n.isClickable() && cls != null
                    && cls.toString().endsWith("Button")
                    && labelMatches(n, SEND_WORDS);
        });
        if (btn != null) return btn;
        // …fall back to any clickable node with a Send-like label.
        return bfs(root, (n) -> n.isClickable() && labelMatches(n, SEND_WORDS));
    }

    /** Labels that must never be tapped, matched as whole words. */
    private static final String[] NEVER_TAP = {
        "cancel", "back", "dismiss", "close", "no", "hapana", "ghairi"
    };

    private static boolean labelMatches(AccessibilityNodeInfo n,
            String[] words) {
        StringBuilder sb = new StringBuilder();
        if (n.getText() != null) sb.append(n.getText()).append(' ');
        if (n.getContentDescription() != null) {
            sb.append(n.getContentDescription());
        }
        String label = sb.toString().toLowerCase();
        if (label.isEmpty()) return false;
        for (String neg : NEVER_TAP) {
            for (String token : label.split("[^a-z]+")) {
                if (token.equals(neg)) return false;
            }
        }
        for (String w : words) {
            if (label.contains(w)) return true;
        }
        return false;
    }

    /** All visible text + descriptions, lowercased by the caller. */
    private static String collectText(AccessibilityNodeInfo node,
            StringBuilder sb, int depth) {
        if (node == null || depth > 24 || sb.length() > 4096) return "";
        if (node.getText() != null) sb.append(node.getText()).append('\n');
        if (node.getContentDescription() != null) {
            sb.append(node.getContentDescription()).append('\n');
        }
        int kids = node.getChildCount();
        for (int i = 0; i < kids; i++) {
            AccessibilityNodeInfo kid = null;
            try {
                kid = node.getChild(i);
                collectText(kid, sb, depth + 1);
            } catch (Exception e) {
                // Dead node mid-walk; skip it.
            } finally {
                if (kid != null) kid.recycle();
            }
        }
        return sb.toString();
    }

    private interface NodeTest {
        boolean test(AccessibilityNodeInfo n);
    }

    /** BFS returning the first matching node (caller recycles it). */
    private static AccessibilityNodeInfo bfs(AccessibilityNodeInfo root,
            NodeTest test) {
        java.util.ArrayDeque<AccessibilityNodeInfo> q =
                new java.util.ArrayDeque<>();
        q.add(AccessibilityNodeInfo.obtain(root));
        try {
            while (!q.isEmpty()) {
                AccessibilityNodeInfo n = q.poll();
                boolean hit = false;
                try {
                    hit = test.test(n);
                } catch (Exception e) {
                    hit = false;
                }
                if (hit) {
                    while (!q.isEmpty()) q.poll().recycle();
                    return n; // ownership transfers to caller
                }
                int kids = n.getChildCount();
                for (int i = 0; i < kids; i++) {
                    try {
                        AccessibilityNodeInfo kid = n.getChild(i);
                        if (kid != null) q.add(kid);
                    } catch (Exception e) {
                        // skip
                    }
                }
                n.recycle();
            }
        } catch (Exception e) {
            while (!q.isEmpty()) q.poll().recycle();
        }
        return null;
    }
}
