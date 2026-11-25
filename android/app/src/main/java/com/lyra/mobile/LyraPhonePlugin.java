package com.lyra.mobile;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.provider.Settings;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * The phone side of mini Lyra (2026-11-25). Everything here is limited to what the owner approves in her Settings:
 *  - apps: the launchable apps (to pick from), and opening one he approved
 *  - notifications: only from the apps he ticked (LyraNotificationService keeps nothing from any other app)
 *  - dial: opens the phone app with a number ready; he presses call himself
 *  - shared: something sent to her with Android's Share menu
 *  - openUrl: the update download, in the browser
 */
@CapacitorPlugin(name = "LyraPhone")
public class LyraPhonePlugin extends Plugin {
    static final String PREFS = "lyra_phone";

    @PluginMethod
    public void listApps(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        Intent i = new Intent(Intent.ACTION_MAIN);
        i.addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> list = pm.queryIntentActivities(i, 0);
        JSArray arr = new JSArray();
        Set<String> seen = new HashSet<>();
        for (ResolveInfo r : list) {
            String p = r.activityInfo.packageName;
            if (!seen.add(p) || p.equals(getContext().getPackageName())) continue;
            JSObject o = new JSObject();
            o.put("package", p);
            o.put("name", r.loadLabel(pm).toString());
            arr.put(o);
        }
        JSObject res = new JSObject();
        res.put("apps", arr);
        call.resolve(res);
    }

    @PluginMethod
    public void openApp(PluginCall call) {
        Intent i = getContext().getPackageManager().getLaunchIntentForPackage(call.getString("package", ""));
        if (i == null) { call.reject("That app isn't installed."); return; }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void dial(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(call.getString("number", ""))));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void openUrl(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(call.getString("url", "")));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    // ---------- notifications from approved apps only ----------
    @PluginMethod
    public void setAllowedNotificationApps(PluginCall call) {
        JSArray a = call.getArray("packages", new JSArray());
        Set<String> allowed = new HashSet<>();
        for (int k = 0; k < a.length(); k++) allowed.add(a.optString(k));
        SharedPreferences sp = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        sp.edit().putStringSet("allowed", allowed).apply();
        LyraNotificationService.forgetOthers(getContext(), allowed); // an app he unticks: its notifications are gone too
        call.resolve();
    }

    @PluginMethod
    public void notificationAccess(PluginCall call) {
        String flat = Settings.Secure.getString(getContext().getContentResolver(), "enabled_notification_listeners");
        JSObject res = new JSObject();
        res.put("granted", flat != null && flat.contains(getContext().getPackageName()));
        call.resolve(res);
    }

    @PluginMethod
    public void openNotificationAccessSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void getNotifications(PluginCall call) {
        JSObject res = new JSObject();
        try { res.put("items", new JSArray(LyraNotificationService.recent(getContext()).toString())); }
        catch (Exception e) { res.put("items", new JSArray()); }
        call.resolve(res);
    }

    @PluginMethod
    public void clearNotifications(PluginCall call) {
        LyraNotificationService.save(getContext(), new JSONArray());
        call.resolve();
    }

    // ---------- Share -> Lyra ----------
    @PluginMethod
    public void getShared(PluginCall call) {
        Intent intent = getActivity().getIntent();
        JSObject shared = parse(intent);
        if (shared != null) getActivity().setIntent(new Intent()); // taken: not handed over twice
        call.resolve(shared != null ? shared : new JSObject());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        JSObject shared = parse(intent);
        if (shared != null) notifyListeners("shared", shared, true);
    }

    private JSObject parse(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return null;
        JSObject o = new JSObject();
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text != null) o.put("text", text);
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if (subject != null) o.put("subject", subject);
        Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (uri != null) {
            try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[16384];
                int n, total = 0;
                while (in != null && (n = in.read(buf)) > 0 && total < 8_000_000) { out.write(buf, 0, n); total += n; }
                o.put("data", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
                o.put("mime", intent.getType() != null ? intent.getType() : "image/jpeg");
            } catch (Exception e) { o.put("error", e.getMessage()); }
        }
        return o;
    }
}
