package com.wails.app;

import android.util.Log;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.wails.app.BuildConfig;

/**
 * WailsJSBridge provides the JavaScript interface that allows the web frontend
 * to communicate with the Go backend. This is exposed to JavaScript as the
 * `window.wails` object.
 *
 * Similar to iOS's WKScriptMessageHandler but using Android's addJavascriptInterface.
 */
public class WailsJSBridge {
    private static final String TAG = "WailsJSBridge";
    private static final boolean DEBUG = BuildConfig.DEBUG;
    // Pooled threads avoid unbounded thread creation under high call volume.
    private static final ExecutorService executor = Executors.newCachedThreadPool();

    private final WailsBridge bridge;
    private final WebView webView;

    public WailsJSBridge(WailsBridge bridge, WebView webView) {
        this.bridge = bridge;
        this.webView = webView;
    }

    /**
     * Send a message to Go and return the response synchronously.
     * Called from JavaScript: wails.invoke(message)
     *
     * @param message The message to send (JSON string)
     * @return The response from Go (JSON string)
     */
    @JavascriptInterface
    public String invoke(String message) {
        if (DEBUG) Log.d(TAG, "Invoke called: " + message);
        return bridge.handleMessage(message);
    }

    /**
     * Send a message to Go asynchronously.
     * The response will be sent back via a callback.
     * Called from JavaScript: wails.invokeAsync(callbackId, message)
     *
     * @param callbackId The callback ID to use for the response
     * @param message The message to send (JSON string)
     */
    @JavascriptInterface
    public void invokeAsync(final String callbackId, final String payload) {
        if (DEBUG) Log.d(TAG, "InvokeAsync called: " + payload);

        // Handle off the JS thread so we don't block the WebView.
        executor.execute(() -> {
            try {
                String response = bridge.handleRuntimeCall(payload);
                sendCallback(callbackId, response, null);
            } catch (Exception e) {
                Log.e(TAG, "Error in async invoke", e);
                sendCallback(callbackId, null, e.getMessage());
            }
        });
    }

    /**
     * Log a message from JavaScript to Android's logcat
     * Called from JavaScript: wails.log(level, message)
     *
     * @param level The log level (debug, info, warn, error)
     * @param message The message to log
     */
    @JavascriptInterface
    public void log(String level, String message) {
        switch (level.toLowerCase()) {
            case "debug":
                Log.d(TAG + "/JS", message);
                break;
            case "info":
                Log.i(TAG + "/JS", message);
                break;
            case "warn":
                Log.w(TAG + "/JS", message);
                break;
            case "error":
                Log.e(TAG + "/JS", message);
                break;
            default:
                Log.v(TAG + "/JS", message);
                break;
        }
    }

    /**
     * Get the platform name
     * Called from JavaScript: wails.platform()
     *
     * @return "android"
     */
    @JavascriptInterface
    public String platform() {
        return "android";
    }

    /**
     * Check if we're running in debug mode
     * Called from JavaScript: wails.isDebug()
     *
     * @return true if debug build, false otherwise
     */
    @JavascriptInterface
    public boolean isDebug() {
        return BuildConfig.DEBUG;
    }

    /**
     * Check READ_SMS without prompting.
     * Called from JavaScript: wails.hasSmsPermission()
     *
     * @return true when the SMS inbox can be read right now
     */
    @JavascriptInterface
    public boolean hasSmsPermission() {
        return bridge.hasSmsPermission();
    }

    /**
     * Read the M-Pesa SMS inbox, requesting READ_SMS at runtime when
     * missing. The raw result (no parsing) is delivered asynchronously as a
     * "common:sms" event: {ok, count, skipped, messages|error}, where each
     * message is {id, address, dateMs, body}.
     * Called from JavaScript: wails.getSms()
     */
    @JavascriptInterface
    public void getSms() {
        executor.execute(bridge::getSms);
    }

    /**
     * Start a payment session (USSD call + confirmation listening, asking
     * for CALL_PHONE/RECEIVE_SMS together when missing).
     * Called from JavaScript: wails.startUssdSession(code)
     */
    @JavascriptInterface
    public void startUssdSession(String code) {
        final String ussd = code;
        executor.execute(() -> bridge.startUssdSession(ussd));
    }

    /**
     * Read and clear the catcher queue of incoming M-Pesa SMS.
     * Called from JavaScript: wails.drainPendingSms()
     *
     * @return JSON array of {id, address, dateMs, body}, "[]" when empty.
     */
    @JavascriptInterface
    public String drainPendingSms() {
        return bridge.drainPendingSms();
    }

    /**
     * Check RECEIVE_SMS without prompting.
     * Called from JavaScript: wails.hasSmsReceivePermission()
     */
    @JavascriptInterface
    public boolean hasSmsReceivePermission() {
        return bridge.hasSmsReceivePermission();
    }

    /**
     * Check CALL_PHONE without prompting.
     * Called from JavaScript: wails.hasCallPermission()
     *
     * @return true when a USSD call can be placed right now
     */
    @JavascriptInterface
    public boolean hasCallPermission() {
        return bridge.hasCallPermission();
    }

    /**
     * System-bar safe area as JSON {"top","bottom","left","right"} in CSS px.
     * Called from JavaScript: wails.getSafeArea()
     */
    @JavascriptInterface
    public String getSafeArea() {
        return bridge.getSafeAreaJson();
    }

    /**
     * Match the Android system bars to the app theme.
     * Called from JavaScript: wails.setSystemBars(JSON.stringify({dark}))
     */
    @JavascriptInterface
    public void setSystemBars(String json) {
        bridge.setSystemBars(json);
    }

    /**
     * Installed app version as JSON
     * {"versionName","versionCode","packageName"}.
     * Called from JavaScript: wails.getAppVersion()
     */
    @JavascriptInterface
    public String getAppVersion() {
        return bridge.getAppVersionJson();
    }

    /**
     * Whether the system currently allows APK installs from this app.
     * Called from JavaScript: wails.canInstallPackages()
     */
    @JavascriptInterface
    public boolean canInstallPackages() {
        return bridge.canInstallPackages();
    }

    /**
     * Open the "Install unknown apps" settings page for this app.
     * Called from JavaScript: wails.openInstallPermissionSettings()
     */
    @JavascriptInterface
    public void openInstallPermissionSettings() {
        bridge.openInstallPermissionSettings();
    }

    /**
     * Open the system App info page for this app.
     * Called from JavaScript: wails.openAppSettings()
     */
    @JavascriptInterface
    public void openAppSettings() {
        bridge.openAppSettings();
    }

    /**
     * Download an APK and hand it to the system installer. Progress arrives
     * as "common:update" events. Never blocks the caller.
     * Called from JavaScript: wails.downloadAndInstallApk(url, fileName)
     */
    @JavascriptInterface
    public void downloadAndInstallApk(String url, String fileName) {
        bridge.downloadAndInstallApk(url, fileName);
    }

    /**
     * Open a URL in the system browser.
     * Called from JavaScript: wails.openUrl(url)
     */
    @JavascriptInterface
    public void openUrl(String url) {
        bridge.openURL(url);
    }

    /**
     * Open the system contact picker for a phone number. No contacts
     * permission is requested: ACTION_PICK hands the app a one-off URI it
     * may read for the duration of the grant. The result arrives as a
     * "common:contact" event.
     * Called from JavaScript: wails.pickContact()
     */
    @JavascriptInterface
    public void pickContact() {
        executor.execute(bridge::pickContact);
    }

    /**
     * Check READ_PHONE_STATE without prompting (never requests it).
     * Called from JavaScript: wails.hasPhoneStatePermission()
     *
     * @return true when carrier names can be resolved right now
     */
    @JavascriptInterface
    public boolean hasPhoneStatePermission() {
        return bridge.hasPhoneStatePermission();
    }

    /**
     * Ask for READ_PHONE_STATE on demand (Settings opt-in). The outcome
     * arrives as a "common:simstate" event {granted}.
     * Called from JavaScript: wails.requestPhoneStatePermission()
     */
    @JavascriptInterface
    public void requestPhoneStatePermission() {
        executor.execute(bridge::requestPhoneStatePermission);
    }

    /**
     * Current SIM list as a JSON array of {subId, slot, simLabel, number}.
     * Called from JavaScript: wails.getSimCards()
     */
    @JavascriptInterface
    public String getSimCards() {
        return bridge.getSimCards();
    }

    /**
     * True when the M-Pesa automation service is enabled in system Settings.
     * Called from JavaScript: wails.isUssdAutomationEnabled()
     */
    @JavascriptInterface
    public boolean isUssdAutomationEnabled() {
        return bridge.isUssdAutomationEnabled();
    }

    /**
     * Open system Settings at the accessibility page so the user can enable
     * the automation service after reading the in-app disclosure.
     * Called from JavaScript: wails.openUssdAutomationSettings()
     */
    @JavascriptInterface
    public void openUssdAutomationSettings() {
        executor.execute(bridge::openUssdAutomationSettings);
    }

    /**
     * Start a guided payment: the automation service fills the *334# menus
     * from the step script (JSON, see UssdSession) and stops at the PIN.
     * Progress arrives as "common:ussd-auto" events.
     * Called from JavaScript: wails.startUssdQuickEntry(scriptJson, simKey)
     * simKey is the active wallet's SIM ("sim-0" / "sub-12"); null or ""
     * lets the bridge choose a line itself.
     */
    @JavascriptInterface
    public void startUssdQuickEntry(String scriptJson, String simKey) {
        final String script = scriptJson;
        final String sim = simKey;
        executor.execute(() -> bridge.startUssdQuickEntry(script, sim));
    }

    /**
     * Open a URL in the system browser (never inside the app WebView).
     * Called from JavaScript: wails.openURL(url)
     */
    @JavascriptInterface
    public void openURL(String url) {
        final String target = url;
        executor.execute(() -> bridge.openURL(target));
    }

    /**
     * Send a callback response to JavaScript
     */
    private void sendCallback(String callbackId, String result, String error) {
        final String js;
        if (error != null) {
            js = String.format(
                    "window._wailsAndroidCallback && window._wailsAndroidCallback('%s', null, '%s');",
                    escapeJsString(callbackId),
                    escapeJsString(error)
            );
        } else {
            js = String.format(
                    "window._wailsAndroidCallback && window._wailsAndroidCallback('%s', '%s', null);",
                    escapeJsString(callbackId),
                    escapeJsString(result != null ? result : "")
            );
        }

        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    private String escapeJsString(String str) {
        if (str == null) return "";
        return str.replace("\\", "\\\\")
                .replace("'", "\\'")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                // JS line terminators (U+2028/U+2029) must be escaped too; built via
                // (char) casts so the Java lexer does not reinterpret them as newlines.
                .replace(String.valueOf((char) 0x2028), "\\u2028")
                .replace(String.valueOf((char) 0x2029), "\\u2029");
    }
}
