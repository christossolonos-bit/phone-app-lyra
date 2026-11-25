package com.lyra.mobile;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LyraPhonePlugin.class); // her phone side: approved apps, notifications, dial, share, updates
        super.onCreate(savedInstanceState);
        // her voice plays as soon as the reply arrives, not only after another tap
        getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
    }
}
