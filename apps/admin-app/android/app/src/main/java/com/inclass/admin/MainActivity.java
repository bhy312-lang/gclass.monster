package com.inclass.admin;

import android.os.Bundle;
import android.graphics.Color;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;
import android.os.Handler;
import android.os.Looper;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.graphics.Insets;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // WebView textZoom 100% 강제 설정 (텍스트 점프 방지)
        applyTextZoomSafely();

        // 상태바 색상 설정
        getWindow().setStatusBarColor(Color.parseColor("#1e3a8a"));

        // 시스템 UI 인셋 처리 (키보드 대응을 위해)
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);

        // 키보드가 올라올 때 WebView가 리사이즈되도록 처리
        View rootView = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(rootView, (view, windowInsets) -> {
            Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            Insets imeInsets = windowInsets.getInsets(WindowInsetsCompat.Type.ime());

            // 상태바/네비게이션바 인셋만 적용 (IME 인셋은 시스템이 자동 처리하도록)
            view.setPadding(insets.left, insets.top, insets.right, insets.bottom);

            // 소비하지 않고 전파하여 WebView가 IME 인셋에 반응하도록
            return WindowInsetsCompat.CONSUMED;
        });

        // 뒤로가기 버튼 처리 (Android 13+ 호환)
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    WebView webView = getBridge().getWebView();
                    String url = webView.getUrl();

                    android.util.Log.d("BackButton", "Current URL: " + url);

                    if (url != null) {
                        // URL에서 쿼리 파라미터와 해시 제거
                        String cleanUrl = url.split("\\?")[0].split("#")[0];

                        boolean isMainPage = cleanUrl.endsWith("index.html") ||
                                           cleanUrl.endsWith("/") ||
                                           cleanUrl.equals("https://localhost") ||
                                           cleanUrl.equals("https://localhost/");

                        android.util.Log.d("BackButton", "Clean URL: " + cleanUrl + ", isMainPage: " + isMainPage);

                        if (isMainPage) {
                            // 메인 화면에서는 앱 종료
                            finish();
                        } else {
                            // 다른 화면에서는 JavaScript로 index.html로 이동 (세션 유지)
                            webView.evaluateJavascript("window.location.href = 'index.html';", null);
                        }
                    }
                }
            }
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        // 화면 복귀 시에도 textZoom 재적용
        applyTextZoomSafely();
    }

    /**
     * WebView textZoom 100% 강제 설정 (텍스트 점프 방지)
     * WebView 준비 타이밍 이슈 방지를 위해 post + 지연 재시도 포함
     */
    private void applyTextZoomSafely() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        WebView webView = getBridge().getWebView();

        Runnable apply = () -> {
            try {
                webView.getSettings().setTextZoom(100);
                webView.getSettings().setLoadWithOverviewMode(false);
                webView.getSettings().setUseWideViewPort(true);
            } catch (Exception ignored) {}
        };

        webView.post(apply);
        new Handler(Looper.getMainLooper()).postDelayed(apply, 120);
        new Handler(Looper.getMainLooper()).postDelayed(apply, 350);
    }
}
