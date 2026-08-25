package app.vercel.upnext;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * UpNext 홈 위젯 (트랙3 C3) — iOS UpNextWidget.swift 의 태스크 중심 체크리스트 미러.
 *
 * 데이터: WidgetBridgePlugin 이 SharedPreferences("upnext_widget")에 저장한
 * widgetState JSON (src/lib/widget.ts WidgetState 스키마).
 *
 * 신선도 게이트 (iOS 와 동일): state.date == 오늘(01:00 롤오버 = now-1h 의 날짜)
 * 이고 now-updatedAt < 30h 일 때만 데이터 표시, 아니면 빈 상태 카피.
 *
 * i18n: 기기 로케일이 아니라 페이로드 lang 으로 Configuration 컨텍스트를 만들어
 * 문자열을 해석한다 (인앱 언어 = 단일 진실원, iOS AppConfig.loc 미러).
 */
public class UpNextWidgetProvider extends AppWidgetProvider {

    private static final long FRESH_WINDOW_MS = 30L * 60 * 60 * 1000; // 30시간
    private static final int[] DOT_IDS = {
        R.id.widget_dot_1, R.id.widget_dot_2, R.id.widget_dot_3,
        R.id.widget_dot_4, R.id.widget_dot_5,
    };
    private static final int[] TASK_ROW_IDS = {
        R.id.widget_task_row_1, R.id.widget_task_row_2, R.id.widget_task_row_3,
    };
    private static final int[] TASK_DOT_IDS = {
        R.id.widget_task_dot_1, R.id.widget_task_dot_2, R.id.widget_task_dot_3,
    };
    private static final int[] TASK_TEXT_IDS = {
        R.id.widget_task_text_1, R.id.widget_task_text_2, R.id.widget_task_text_3,
    };

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        updateAll(context, manager, ids);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle newOptions) {
        updateAll(context, manager, new int[] { id });
    }

    static void updateAll(Context context, AppWidgetManager manager, int[] ids) {
        JSONObject state = loadFreshState(context);
        for (int id : ids) {
            manager.updateAppWidget(id, buildViews(context, manager, id, state));
        }
    }

    /** 저장된 페이로드를 읽고 신선도 게이트를 통과하면 반환, 아니면 null. */
    private static JSONObject loadFreshState(Context context) {
        SharedPreferences prefs =
            context.getSharedPreferences(WidgetBridgePlugin.PREFS_NAME, Context.MODE_PRIVATE);
        String raw = prefs.getString(WidgetBridgePlugin.KEY_STATE, null);
        if (raw == null) return null;
        try {
            JSONObject state = new JSONObject(raw);
            long updatedAt = state.optLong("updatedAt", 0);
            if (updatedAt <= 0 || System.currentTimeMillis() - updatedAt >= FRESH_WINDOW_MS) return null;
            String date = state.optString("date", "");
            if (!date.equals(productDayString())) return null;
            return state;
        } catch (Exception e) {
            return null;
        }
    }

    /** 제품일 문자열 — 01:00 롤오버 (now-1h 의 로컬 날짜). 웹 getTodayString 미러. */
    private static String productDayString() {
        Date shifted = new Date(System.currentTimeMillis() - 3600_000L);
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(shifted);
    }

    /** 페이로드 lang 기준 리소스 컨텍스트 (기기 로케일 무시). */
    private static Context localizedContext(Context context, JSONObject state) {
        String lang = state != null ? state.optString("lang", "ko") : "ko";
        Configuration config = new Configuration(context.getResources().getConfiguration());
        config.setLocale(Locale.forLanguageTag(lang));
        return context.createConfigurationContext(config);
    }

    private static RemoteViews buildViews(Context context, AppWidgetManager manager, int widgetId, JSONObject state) {
        // 4셀 폭(대략 250dp) 이상이면 medium 레이아웃
        Bundle options = manager.getAppWidgetOptions(widgetId);
        int minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 110);
        boolean medium = minWidth >= 220;

        Context loc = localizedContext(context, state);
        RemoteViews views = new RemoteViews(
            context.getPackageName(), medium ? R.layout.widget_medium : R.layout.widget_small);

        views.setTextViewText(R.id.widget_label, loc.getString(R.string.widget_today_challenge));

        int streak = state != null ? state.optInt("streak", 0) : 0;
        views.setViewVisibility(R.id.widget_streak_icon, streak > 0 ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.widget_streak, streak > 0 ? View.VISIBLE : View.GONE);
        views.setTextViewText(R.id.widget_streak, String.valueOf(streak));

        JSONArray tasks = state != null ? state.optJSONArray("tasks") : null;
        int total = tasks != null ? tasks.length() : 0;
        int done = 0;
        if (tasks != null) {
            for (int i = 0; i < tasks.length(); i++) {
                JSONObject t = tasks.optJSONObject(i);
                if (t != null && t.optBoolean("done", false)) done++;
            }
        }

        // 히어로 텍스트: 데이터 없음 → 빈 상태 / 선택 전 → 시작 유도 / 전부 완료 → 축하 / 그 외 다음 과제
        String title;
        if (state == null) {
            title = loc.getString(R.string.widget_daily_empty);
        } else if (total == 0) {
            title = loc.getString(R.string.widget_daily_start_prompt);
        } else if (done >= total) {
            title = loc.getString(R.string.widget_daily_complete);
        } else {
            String main = state.optString("mainChallengeTitle", "");
            title = main.isEmpty() ? loc.getString(R.string.widget_daily_start_prompt) : main;
        }
        views.setTextViewText(R.id.widget_title, title);

        // 도트 진행 + X/Y (과제가 있을 때만)
        boolean showProgress = total > 0;
        views.setViewVisibility(R.id.widget_progress_row, showProgress ? View.VISIBLE : View.GONE);
        if (showProgress) {
            for (int i = 0; i < DOT_IDS.length; i++) {
                if (i < Math.min(total, DOT_IDS.length)) {
                    views.setViewVisibility(DOT_IDS[i], View.VISIBLE);
                    views.setImageViewResource(
                        DOT_IDS[i], i < done ? R.drawable.widget_dot_filled : R.drawable.widget_dot_empty);
                } else {
                    views.setViewVisibility(DOT_IDS[i], View.GONE);
                }
            }
            views.setTextViewText(R.id.widget_progress, done + "/" + total);
            views.setTextColor(R.id.widget_progress, context.getColor(
                done >= total ? R.color.widgetAccent : R.color.widgetTextPrimary));
        }

        // medium 우측: 히어로(다음 미완료)를 제외한 미니 과제 행 최대 3개 + "+N"
        if (medium && tasks != null && total > 0) {
            int heroIndex = -1;
            for (int i = 0; i < tasks.length(); i++) {
                JSONObject t = tasks.optJSONObject(i);
                if (t != null && !t.optBoolean("done", false)) { heroIndex = i; break; }
            }
            int row = 0;
            int shown = 0;
            for (int i = 0; i < tasks.length() && row < TASK_ROW_IDS.length; i++) {
                if (i == heroIndex) continue;
                JSONObject t = tasks.optJSONObject(i);
                if (t == null) continue;
                boolean taskDone = t.optBoolean("done", false);
                views.setViewVisibility(TASK_ROW_IDS[row], View.VISIBLE);
                views.setImageViewResource(
                    TASK_DOT_IDS[row], taskDone ? R.drawable.widget_dot_filled : R.drawable.widget_dot_empty);
                views.setTextViewText(TASK_TEXT_IDS[row], t.optString("title", ""));
                // RemoteViews 는 취소선 span 을 직접 지원하지 않으므로 완료는 도트+감쇠 색으로 표현
                views.setTextColor(TASK_TEXT_IDS[row], context.getColor(
                    taskDone ? R.color.widgetDotEmpty : R.color.widgetTextSecondary));
                row++;
                shown++;
            }
            int hidden = total - (heroIndex >= 0 ? 1 : 0) - shown;
            if (hidden > 0) {
                views.setViewVisibility(R.id.widget_more, View.VISIBLE);
                views.setTextViewText(R.id.widget_more, loc.getString(R.string.widget_more_count, hidden));
            }
        }

        // 탭 → 앱 열기
        Intent launch = new Intent(context, MainActivity.class);
        launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(
            context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, pending);

        return views;
    }
}
