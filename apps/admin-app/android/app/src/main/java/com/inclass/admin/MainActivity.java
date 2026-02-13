package com.inclass.admin;

import android.os.Bundle;
import android.graphics.Color;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;
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

        // 상태바 색상 설정
        getWindow().setStatusBarColor(Color.parseColor("#1e3a8a"));

        // 콘텐츠가 상태바 영역을 침범하지 않도록 설정
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);

        // WebView에 상태바 높이만큼 패딩 적용
        View rootView = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(rootView, (view, windowInsets) -> {
            Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            view.setPadding(insets.left, insets.top, insets.right, 0);
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
                            // 다른 화면에서는 index.html로 이동
                            webView.loadUrl("https://localhost/index.html");
                        }
                    }
                }
            }
        });
    }
}
