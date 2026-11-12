package fi.eerolehtinen.lift.resttimer

import android.content.Context

/** A rest that is counting down, or one that ended and hasn't been dismissed. */
data class Rest(val endsAt: Long, val finished: Boolean)

/**
 * The current rest, kept outside the process so the UI can show it after a
 * cold start, including when the service changed it while the WebView was gone.
 */
object RestTimerStore {
    private const val PREFS = "rest_timer"
    private const val KEY_ENDS_AT = "endsAt"
    private const val KEY_FINISHED = "finished"
    private const val KEY_VOLUME = "volume"

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun get(ctx: Context): Rest? {
        val prefs = prefs(ctx)
        if (!prefs.contains(KEY_ENDS_AT)) return null
        return Rest(prefs.getLong(KEY_ENDS_AT, 0), prefs.getBoolean(KEY_FINISHED, false))
    }

    // commit(), not apply(): the process may be killed right after the alert.
    fun set(ctx: Context, rest: Rest?) {
        val editor = prefs(ctx).edit()
        if (rest == null) {
            editor.remove(KEY_ENDS_AT).remove(KEY_FINISHED)
        } else {
            editor.putLong(KEY_ENDS_AT, rest.endsAt).putBoolean(KEY_FINISHED, rest.finished)
        }
        editor.commit()
    }

    /** The alert's volume, 0..1 of the media volume. Kept across rests. */
    fun volume(ctx: Context): Float = prefs(ctx).getFloat(KEY_VOLUME, 1f)

    fun setVolume(ctx: Context, volume: Float) {
        prefs(ctx).edit().putFloat(KEY_VOLUME, volume.coerceIn(0f, 1f)).apply()
    }
}
