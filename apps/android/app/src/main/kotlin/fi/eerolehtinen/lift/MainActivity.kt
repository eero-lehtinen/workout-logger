package fi.eerolehtinen.lift

import android.os.Bundle
import com.getcapacitor.BridgeActivity
import fi.eerolehtinen.lift.resttimer.RestTimerPlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // The bridge is built in super.onCreate, from the plugins registered by then.
        registerPlugin(RestTimerPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
