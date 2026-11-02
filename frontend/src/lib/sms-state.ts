/**
 * Local keys shared by the silent SMS engine and the reset flow. Resetting
 * the app pauses automatic full-inbox reads so the phone's history is not
 * poured straight back into the empty store; new messages caught by the
 * receiver still merge. A manual import lifts the pause.
 */
export const SMS_SEEDED_KEY = "mpesa-analyzer.sms-seeded";
export const SMS_FULL_READ_KEY = "mpesa-analyzer.sms-full-read";
export const SMS_AUTO_PAUSED_KEY = "mpesa-analyzer.sms-auto-paused";
