package app.vercel.upnext;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;

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
