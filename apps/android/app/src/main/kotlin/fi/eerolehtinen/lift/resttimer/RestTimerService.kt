package fi.eerolehtinen.lift.resttimer

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import fi.eerolehtinen.lift.R

/**
 * Counts a rest down in-process, like FitNotes: a foreground service with a
 * partial wake lock, a live countdown notification, and the alert at the end
 * (docs/architecture.md#rest-timer). No alarm is involved, so if the process
 * dies mid-rest the alert is lost.
 */
class RestTimerService : Service() {
    companion object {
        private const val ACTION_START = "start"
        private const val ACTION_ADD = "add"
        private const val ACTION_SKIP = "skip"
        private const val ACTION_CANCEL = "cancel"
        private const val EXTRA_ENDS_AT = "endsAt"
        private const val NOTIFICATION_ID = 2
        private const val CHANNEL_ID = "rest_countdown"
        private const val ADD_MS = 15_000L

        /** How long the wake lock outlives the countdown, to cover the alert. */
        private const val ALERT_MARGIN_MS = 30_000L

        /** Whether a countdown or its alert is running in this process. */
        @Volatile
        var running = false
            private set

        /**
         * Starts the countdown, or moves a running one to `endsAt`. Android
         * allows it only while the app is visible; otherwise this throws
         * ForegroundServiceStartNotAllowedException.
         */
        fun start(ctx: Context, endsAt: Long) {
            starting = true
            try {
                ctx.startForegroundService(
                    Intent(ctx, RestTimerService::class.java).setAction(ACTION_START).putExtra(EXTRA_ENDS_AT, endsAt),
                )
            } catch (e: Exception) {
                starting = false
                throw e
            }
        }

        /** A start was requested and its command hasn't reached the service yet. */
        @Volatile
        private var starting = false

        /**
         * Stops the countdown as a command queued behind any pending start.
         * stopService would crash the app if it overtook a start whose
         * service hasn't called startForeground yet.
         */
        fun stop(ctx: Context) {
            if (!running && !starting) return
            val intent = Intent(ctx, RestTimerService::class.java)
            try {
                ctx.startService(intent.setAction(ACTION_CANCEL))
            } catch (_: IllegalStateException) {
                // Not allowed from the background without a running service.
                ctx.stopService(intent)
            }
        }

        fun openAppIntent(ctx: Context): PendingIntent = PendingIntent.getActivity(
            ctx,
            0,
            ctx.packageManager.getLaunchIntentForPackage(ctx.packageName),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }

    private enum class Phase { IDLE, COUNTING, ALERTING }

    private val handler = Handler(Looper.getMainLooper())
    private val endRunnable = Runnable { end() }
    private var phase = Phase.IDLE
    private var endsAt = 0L
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                starting = false
                endsAt = intent.getLongExtra(EXTRA_ENDS_AT, System.currentTimeMillis())
                // A set logged while the previous rest's alert still plays.
                RestAlert.stop(this)
                RestAlert.dismiss(this)
                ServiceCompat.startForeground(
                    this,
                    NOTIFICATION_ID,
                    buildNotification(),
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
                )
                RestTimerStore.set(this, Rest(endsAt, finished = false))
                arm()
            }
            // The notification's actions. One pressed after the countdown
            // ended, or after the process died, finds nothing to change.
            ACTION_ADD -> if (phase == Phase.COUNTING) {
                endsAt += ADD_MS
                RestTimerStore.set(this, Rest(endsAt, finished = false))
                notifyCountdown()
                arm()
                RestTimerPlugin.emit(RestTimerPlugin.EVENT_ADJUSTED, endsAt)
            }
            ACTION_SKIP -> if (phase == Phase.COUNTING) {
                RestTimerStore.set(this, null)
                RestTimerPlugin.emit(RestTimerPlugin.EVENT_CANCELLED, endsAt)
                finish()
            }
            // From the UI, which has already cleared the stored rest.
            ACTION_CANCEL -> if (phase != Phase.IDLE) finish()
        }
        if (phase == Phase.IDLE) stopSelf()
        // Not sticky: a restarted service couldn't know the rest, and the
        // UI treats a rest without a service as lost.
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        running = false
        phase = Phase.IDLE
        handler.removeCallbacks(endRunnable)
        RestAlert.stop(this)
        wakeLock?.let { if (it.isHeld) it.release() }
        super.onDestroy()
    }

    private fun arm() {
        phase = Phase.COUNTING
        running = true
        val remaining = (endsAt - System.currentTimeMillis()).coerceAtLeast(0)
        // The wake lock keeps the CPU running in Doze, so the handler fires
        // on time. Not reference counted: each acquire replaces the timeout.
        val lock = wakeLock ?: getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "WorkoutLogger:restTimer")
            .apply { setReferenceCounted(false) }
        wakeLock = lock
        lock.acquire(remaining + ALERT_MARGIN_MS)
        handler.removeCallbacks(endRunnable)
        handler.postDelayed(endRunnable, remaining)
    }

    private fun end() {
        phase = Phase.ALERTING
        RestTimerStore.set(this, Rest(endsAt, finished = true))
        RestTimerPlugin.emit(RestTimerPlugin.EVENT_FINISHED, endsAt)
        RestAlert.play(this) { finish() }
    }

    private fun finish() {
        phase = Phase.IDLE
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun notifyCountdown() {
        val manager = NotificationManagerCompat.from(this)
        if (!manager.areNotificationsEnabled()) return
        try {
            manager.notify(NOTIFICATION_ID, buildNotification())
        } catch (_: SecurityException) {
            // Permission revoked since the check; the countdown runs without it.
        }
    }

    private fun buildNotification(): Notification {
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.rest_channel_countdown),
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            setSound(null, null)
            enableVibration(false)
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_rest)
            .setContentTitle(getString(R.string.rest_countdown_title))
            // A Live Update (the status bar chip, Android 16 QPR1+) needs a
            // title, an ongoing notification, and one of a few styles.
            .setStyle(NotificationCompat.BigTextStyle())
            .setRequestPromotedOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            // The system draws the countdown itself, without reposts.
            .setWhen(endsAt)
            .setShowWhen(true)
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(openAppIntent(this))
            .addAction(0, getString(R.string.rest_action_add), actionIntent(ACTION_ADD, 1))
            .addAction(0, getString(R.string.rest_action_skip), actionIntent(ACTION_SKIP, 2))
            .build()
    }

    private fun actionIntent(action: String, requestCode: Int): PendingIntent = PendingIntent.getService(
        this,
        requestCode,
        Intent(this, RestTimerService::class.java).setAction(action),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
}
