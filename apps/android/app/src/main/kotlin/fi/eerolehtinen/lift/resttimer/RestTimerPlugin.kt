package fi.eerolehtinen.lift.resttimer

import android.Manifest
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * The JS side of the rest timer (apps/web/src/lib/rest-alarm-native.ts).
 * The service owns the countdown; this starts and stops it and reports what
 * the service did while the UI wasn't looking.
 */
@CapacitorPlugin(
    name = "RestTimer",
    permissions = [Permission(alias = "notifications", strings = [Manifest.permission.POST_NOTIFICATIONS])],
)
class RestTimerPlugin : Plugin() {
    companion object {
        const val EVENT_FINISHED = "finished"
        const val EVENT_ADJUSTED = "adjusted"
        const val EVENT_CANCELLED = "cancelled"
        private const val TAG = "RestTimer"

        @Volatile
        private var instance: RestTimerPlugin? = null

        /** Tells the UI, if it is alive. If not, it asks `getState` when it starts. */
        fun emit(event: String, endsAt: Long) {
            instance?.notifyListeners(event, JSObject().put("endsAt", endsAt))
        }
    }

    override fun load() {
        instance = this
    }

    override fun handleOnDestroy() {
        if (instance === this) instance = null
    }

    /**
     * Starts a rest ending at `endsAt` (epoch ms), or moves the running one
     * there. `volume` (0..1 of the media volume) is remembered for later rests.
     */
    @PluginMethod
    fun start(call: PluginCall) {
        val endsAt = call.data.optDouble("endsAt")
        if (endsAt.isNaN()) return call.reject("endsAt is required")
        // Before the service starts: a rest that is already over alerts at once.
        call.getFloat("volume")?.let { RestTimerStore.setVolume(context, it) }
        try {
            RestTimerService.start(context, endsAt.toLong())
        } catch (e: Exception) {
            // ForegroundServiceStartNotAllowedException: the app isn't visible.
            Log.w(TAG, "rest timer start refused", e)
            return call.reject("The rest timer can only start while the app is open", "START_FAILED", e)
        }
        RestTimerStore.set(context, Rest(endsAt.toLong(), finished = false))
        call.resolve()
    }

    /** Stops the countdown or dismisses a finished rest. */
    @PluginMethod
    fun cancel(call: PluginCall) {
        RestTimerService.stop(context)
        RestAlert.dismiss(context)
        RestTimerStore.set(context, null)
        call.resolve()
    }

    /** Plays the alert sound once at `volume`, without starting a rest. */
    @PluginMethod
    fun preview(call: PluginCall) {
        // Not while the service owns the player: it would cut a real alert short.
        if (!RestTimerService.running) RestAlert.preview(context, call.getFloat("volume") ?: 1f)
        call.resolve()
    }

    @PluginMethod
    fun getState(call: PluginCall) {
        val rest = current()
        val result = JSObject()
        if (rest != null) result.put("endsAt", rest.endsAt).put("finished", rest.finished)
        call.resolve(result)
    }

    private fun current(): Rest? {
        val rest = RestTimerStore.get(context) ?: return null
        if (rest.finished || RestTimerService.running) return rest
        // The process died mid-rest and took the service with it.
        if (rest.endsAt <= System.currentTimeMillis()) {
            return rest.copy(finished = true).also { RestTimerStore.set(context, it) }
        }
        try {
            RestTimerService.start(context, rest.endsAt)
        } catch (e: Exception) {
            Log.w(TAG, "rest timer revival refused", e)
        }
        return rest
    }

    @PluginMethod
    fun notificationPermission(call: PluginCall) {
        call.resolve(permissionResult())
    }

    @PluginMethod
    fun requestNotificationPermission(call: PluginCall) {
        // Below Android 13 notifications need no runtime permission.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return call.resolve(permissionResult())
        requestPermissionForAlias("notifications", call, "notificationPermissionResult")
    }

    @PermissionCallback
    private fun notificationPermissionResult(call: PluginCall) {
        call.resolve(permissionResult())
    }

    private fun permissionResult(): JSObject {
        val state = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getPermissionState("notifications").toString()
        } else if (NotificationManagerCompat.from(context).areNotificationsEnabled()) {
            "granted"
        } else {
            "denied"
        }
        return JSObject().put("state", state)
    }
}
