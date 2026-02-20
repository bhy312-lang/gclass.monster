package com.inclass.app;

import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;
import android.graphics.Color;
import android.webkit.WebView;
import android.webkit.WebSettings;
import androidx.core.view.WindowCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.graphics.Insets;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "inClass-MainActivity";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 상태바 색상 설정
        getWindow().setStatusBarColor(Color.parseColor("#ec4899"));

        // 콘텐츠가 상태바 영역을 침범하지 않도록 설정
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);

        // WebView에 상태바 높이만큼 패딩 적용
        View rootView = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(rootView, (view, windowInsets) -> {
            Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            view.setPadding(insets.left, insets.top, insets.right, 0);
            return WindowInsetsCompat.CONSUMED;
        });

        // WebView OAuth 인증을 위한 설정
        setupWebViewForOAuth();

        // Deep Link 처리 로깅
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Deep Link 처리 로깅
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;

        String action = intent.getAction();
        Uri data = intent.getData();

        Log.d(TAG, "Intent received - Action: " + action + ", Data: " + (data != null ? data.toString() : "null"));

        if (Intent.ACTION_VIEW.equals(action) && data != null) {
            String url = data.toString();
            Log.d(TAG, "Deep Link URL: " + url);

            // Capacitor가 자동으로 처리하도록 함
            // appUrlOpen 이벤트가 JS로 전달됨
        }
    }

    /**
     * OAuth 인증이 앱 내 WebView에서 처리되도록 설정
     * 외부 브라우저가 열리는 것을 방지하기 위해 WebView의 설정만 조정
     * (Capacitor의 WebViewClient/WebChromeClient를 유지하기 위해 설정만 변경)
     */
    private void setupWebViewForOAuth() {
        if (getBridge() == null || getBridge().getWebView() == null) {
            return;
        }

        WebView webView = getBridge().getWebView();
        WebSettings settings = webView.getSettings();

        // JavaScript가 팝업을 열 수 있도록 허용 (OAuth를 위해 필요)
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(true); // OAuth 팝업을 위해 필요
        settings.setDomStorageEnabled(true);

        // User-Agent 설정 (모바일 브라우저로 인식되도록)
        String userAgent = settings.getUserAgentString();
        settings.setUserAgentString(userAgent);
    }
}
