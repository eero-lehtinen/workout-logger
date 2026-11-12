package fi.eerolehtinen.lift.resttimer

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import fi.eerolehtinen.lift.R

/**
 * The end-of-rest alert: a short sound with music ducked, an alarm
 * vibration, and a notification. Call from a foreground service: on
 * Android 15+ a background app gets no audio focus, so music isn't ducked.
 */
object RestAlert {
    private const val TAG = "RestTimer"
    const val NOTIFICATION_ID = 1
    private const val CHANNEL_ID = "rest_over"

    /** Mirrors how long the UI shows "Rest over" (FINISHED_VISIBLE_MS in rest-timer.ts). */
    private const val NOTIFICATION_TIMEOUT_MS = 60_000L

    // The sound is 0.75 s; this bounds the service's life if playback stalls.
    private const val MAX_RUN_MS = 8_000L
    private val VIBRATION_PATTERN = longArrayOf(0, 400, 200, 400, 200, 600)

    // Navigation guidance routes like media: headphones only when connected,
    // at the media volume. USAGE_ALARM would also play on the speaker, and
    // the audio policy mutes music for a speaker+headphones pair instead of
    // ducking it.
    private val SOUND_AUDIO: AudioAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()

    // Alarm vibration ignores the ringer mode.
    private val ALARM_VIBRATION_AUDIO: AudioAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ALARM)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()

    private val main = Handler(Looper.getMainLooper())

    // Held here because a MediaPlayer stops when garbage collected mid-playback.
    private var player: MediaPlayer? = null
    private var focusRequest: AudioFocusRequest? = null
    private var timeout: Runnable? = null

    /** Runs on the main thread. `onDone` is called once, after the sound ends or fails. */
    fun play(ctx: Context, onDone: () -> Unit) {
        stop(ctx)
        var done = false
        val finish = Runnable {
            if (!done) {
                done = true
                stop(ctx)
                onDone()
            }
        }
        timeout = finish
        main.postDelayed(finish, MAX_RUN_MS)
        try {
            playSound(ctx, RestTimerStore.volume(ctx), finish)
        } catch (e: Exception) {
            Log.w(TAG, "rest alert sound failed", e)
            main.post(finish)
        }
        try {
            vibrate(ctx)
        } catch (e: Exception) {
            Log.w(TAG, "rest alert vibration failed", e)
        }
        postNotification(ctx)
    }

    /** Cuts the sound short; the notification stays until `dismiss`. */
    fun stop(ctx: Context) {
        timeout?.let { main.removeCallbacks(it) }
        timeout = null
        player?.release()
        player = null
        focusRequest?.let { ctx.getSystemService(AudioManager::class.java).abandonAudioFocusRequest(it) }
        focusRequest = null
    }

    fun dismiss(ctx: Context) {
        NotificationManagerCompat.from(ctx).cancel(NOTIFICATION_ID)
    }

    /** Only the sound, at `volume`, for trying a volume setting. The app must be visible. */
    fun preview(ctx: Context, volume: Float) {
        main.post {
            stop(ctx)
            try {
                playSound(ctx, volume) { stop(ctx) }
            } catch (e: Exception) {
                Log.w(TAG, "rest alert preview failed", e)
            }
        }
    }

    private fun playSound(ctx: Context, volume: Float, finish: Runnable) {
        val audio = ctx.getSystemService(AudioManager::class.java)
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            .setAudioAttributes(SOUND_AUDIO)
            .build()
        focusRequest = request
        audio.requestAudioFocus(request)
        val mp = MediaPlayer.create(ctx, R.raw.rest_beep, SOUND_AUDIO, audio.generateAudioSessionId())
            ?: throw IllegalStateException("MediaPlayer.create returned null")
        mp.setOnCompletionListener { finish.run() }
        mp.setOnErrorListener { _, what, extra ->
            Log.w(TAG, "rest alert player error $what/$extra")
            finish.run()
            true
        }
        mp.setVolume(volume, volume)
        player = mp
        mp.start()
    }

    private fun vibrate(ctx: Context) {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ctx.getSystemService(VibratorManager::class.java).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            ctx.getSystemService(Vibrator::class.java)
        }
        if (!vibrator.hasVibrator()) return
        val effect = VibrationEffect.createWaveform(VIBRATION_PATTERN, -1)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            vibrator.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(effect, ALARM_VIBRATION_AUDIO)
        }
    }

    @SuppressLint("MissingPermission")
    private fun postNotification(ctx: Context) {
        val manager = NotificationManagerCompat.from(ctx)
        if (!manager.areNotificationsEnabled()) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            ctx.getString(R.string.rest_channel_alert),
            // High importance would show a heads-up banner over the app. The
            // sound and vibration already announce the end of rest. Lowering
            // an existing channel's importance takes effect unless the user
            // has changed the channel's settings.
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            // The alert plays its own sound and vibration; the channel's
            // would double them and obey the ringer mode and DND.
            setSound(null, null)
            enableVibration(false)
        }
        ctx.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        val notification = NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_rest)
            .setContentTitle(ctx.getString(R.string.rest_over_title))
            .setContentText(ctx.getString(R.string.rest_over_text))
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setContentIntent(RestTimerService.openAppIntent(ctx))
            .setAutoCancel(true)
            .setTimeoutAfter(NOTIFICATION_TIMEOUT_MS)
            .build()
        try {
            manager.notify(NOTIFICATION_ID, notification)
        } catch (e: SecurityException) {
            Log.w(TAG, "rest over notification refused", e)
        }
    }
}
