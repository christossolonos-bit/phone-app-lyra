package com.lyra.mobile;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/**
 * Notifications for mini Lyra (2026-11-25): Android shows her every notification once he grants access, but she
 * keeps only those from the apps he ticked in her Settings. Anything else is dropped on the spot and never stored.
 * Kept: the last 100 from approved apps, at most 2 days old, on the phone only.
 */
public class LyraNotificationService extends NotificationListenerService {
    static final String KEY = "recent";
    static final long KEEP_MS = 2L * 24 * 3600 * 1000;

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            SharedPreferences sp = getSharedPreferences(LyraPhonePlugin.PREFS, Context.MODE_PRIVATE);
            Set<String> allowed = sp.getStringSet("allowed", new HashSet<>());
            if (!allowed.contains(sbn.getPackageName())) return; // not approved: not read, not kept
            Notification n = sbn.getNotification();
            if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return; // "3 new messages" summaries repeat the rest
            Bundle x = n.extras;
            CharSequence title = x.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence text = x.getCharSequence(Notification.EXTRA_BIG_TEXT);
            if (text == null) text = x.getCharSequence(Notification.EXTRA_TEXT);
            if (title == null && text == null) return;
            String app = sbn.getPackageName();
            try {
                PackageManager pm = getPackageManager();
                app = pm.getApplicationLabel(pm.getApplicationInfo(sbn.getPackageName(), 0)).toString();
            } catch (Exception ignored) {}
            JSONObject o = new JSONObject();
            o.put("package", sbn.getPackageName());
            o.put("app", app);
            o.put("title", title != null ? title.toString() : "");
            o.put("text", text != null ? text.toString() : "");
            o.put("at", sbn.getPostTime());
            JSONArray list = recent(this);
            JSONArray keep = new JSONArray();
            long now = System.currentTimeMillis();
            for (int i = 0; i < list.length(); i++) {
                JSONObject e = list.getJSONObject(i);
                if (now - e.optLong("at") > KEEP_MS) continue;
                if (e.optString("package").equals(o.optString("package")) && e.optString("title").equals(o.optString("title"))
                        && e.optString("text").equals(o.optString("text"))) continue; // the same one updated
                keep.put(e);
            }
            keep.put(o);
            while (keep.length() > 100) keep.remove(0);
            save(this, keep);
        } catch (Exception ignored) {}
    }

    static JSONArray recent(Context c) {
        try { return new JSONArray(c.getSharedPreferences(LyraPhonePlugin.PREFS, Context.MODE_PRIVATE).getString(KEY, "[]")); }
        catch (Exception e) { return new JSONArray(); }
    }

    static void save(Context c, JSONArray list) {
        c.getSharedPreferences(LyraPhonePlugin.PREFS, Context.MODE_PRIVATE).edit().putString(KEY, list.toString()).apply();
    }

    static void forgetOthers(Context c, Set<String> allowed) {
        try {
            JSONArray list = recent(c), keep = new JSONArray();
            for (int i = 0; i < list.length(); i++) if (allowed.contains(list.getJSONObject(i).optString("package"))) keep.put(list.getJSONObject(i));
            save(c, keep);
        } catch (Exception ignored) {}
    }
}
