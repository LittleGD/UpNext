package app.vercel.upnext;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.Intent;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 웹(src/lib/widget.ts)의 WidgetBridge 인터페이스 안드로이드 구현 (트랙3 C2).
 *
 * updateWidget: 페이로드 JSON 을 SharedPreferences 에 저장하고 홈 위젯을 갱신한다.
 * Live Activity 계열(startChallengeActivity 등)은 안드로이드에 대응 개념이 없어
 * { supported: false } 로 응답한다 (호출측은 이 값을 보고 조용히 넘어간다).
 * Android 16 Live Updates(ProgressStyle) 대응은 후속 버전(versionCode 4) 후보.
 */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {

    static final String PREFS_NAME = "upnext_widget";
    static final String KEY_STATE = "widgetState";

    @PluginMethod
    public void getSetupState(PluginCall call) {
        AppWidgetManager manager = AppWidgetManager.getInstance(getContext());
        JSObject result = new JSObject();
        result.put("installed", manager.getAppWidgetIds(
            new ComponentName(getContext(), UpNextWidgetProvider.class)).length > 0);
        result.put("canPin", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && manager.isRequestPinAppWidgetSupported());
        call.resolve(result);
    }

    @PluginMethod
    public void requestPinWidget(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            AppWidgetManager manager = AppWidgetManager.getInstance(getContext());
            JSObject result = new JSObject();
            boolean supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && manager.isRequestPinAppWidgetSupported();
            // Acceptance only means the launcher received the request. Installation
            // is confirmed separately through getAppWidgetIds after the user adds it.
            result.put("requested", supported && manager.requestPinAppWidget(
                new ComponentName(getContext(), UpNextWidgetProvider.class), null, null));
            call.resolve(result);
        });
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startActivity(intent);
                call.resolve();
            } catch (Exception exception) {
                call.reject("Unable to open notification settings", exception);
            }
        });
    }

    @Override
    protected void handleOnResume() {
        notifyListeners("setupResumed", new JSObject());
    }

    @PluginMethod
    public void updateWidget(PluginCall call) {
        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_STATE, call.getData().toString()).apply();

        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, UpNextWidgetProvider.class));
        if (ids.length > 0) {
            UpNextWidgetProvider.updateAll(context, manager, ids);
        }

        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void startChallengeActivity(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("supported", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void endChallengeActivity(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("supported", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void endAllActivities(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("supported", false);
        call.resolve(ret);
    }
}
