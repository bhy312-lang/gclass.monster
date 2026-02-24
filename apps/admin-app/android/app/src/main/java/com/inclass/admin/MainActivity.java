package com.inclass.admin;

import android.os.Bundle;
import android.graphics.Color;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;
import android.os.Handler;
import android.os.Looper;
import android.content.pm.PackageManager;
import android.content.pm.PackageInfo;
import android.content.pm.Signature;
import android.util.Base64;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.graphics.Insets;
import com.getcapacitor.BridgeActivity;

// Kakao SDK import
import com.kakao.sdk.common.KakaoSdk;
import android.content.Context;
import com.inclass.admin.KakaoAuthPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        android.util.Log.d("CapacitorPlugins", "Registering KakaoAuthPlugin...");
        registerPlugin(KakaoAuthPlugin.class);
        super.onCreate(savedInstanceState);
        android.util.Log.d("CapacitorPlugins", "KakaoAuthPlugin registered");

        // Kakao SDK 초기??
        try {
            // 진단 로그 출력
            android.util.Log.d("KakaoSDK", "=== KOE101 진단 로그 ?�작 ===");
            android.util.Log.d("KakaoSDK", "packageName=" + getPackageName());

            String appKey = com.inclass.admin.BuildConfig.KAKAO_NATIVE_APP_KEY;
            android.util.Log.d("KakaoSDK", "appKey length=" + appKey.length());

            // ?�뒤 4?�리�??�출 (?�체 ???�출 금�?)
            String keyPrefix = appKey.substring(0, 4);
            String keySuffix = appKey.substring(appKey.length() - 4);
            android.util.Log.d("KakaoSDK", "appKey=" + keyPrefix + "..." + keySuffix);

            KakaoSdk.init(this, appKey);
            android.util.Log.d("KakaoSDK", "Kakao SDK initialized successfully");

            // KeyHash 로그 출력 (KOE101 ?�버깅용)
            String keyHash = getKeyHash();
            android.util.Log.d("KakaoSDK", "KeyHash=" + keyHash);
            android.util.Log.d("KakaoSDK", "=== KOE101 진단 로그 ??===");

        } catch (Exception e) {
            android.util.Log.e("KakaoSDK", "Failed to initialize Kakao SDK", e);
        }

        // WebView textZoom 100% 강제 ?�정 (?�스???�프 방�?)
        applyTextZoomSafely();

        // ?�태�??�상 ?�정
        getWindow().setStatusBarColor(Color.parseColor("#1e3a8a"));

        // ?�스??UI ?�셋 처리 (?�보???�?�을 ?�해)
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);

        // ?�보?��? ?�라????WebView가 리사?�즈?�도�?처리
        View rootView = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(rootView, (view, windowInsets) -> {
            Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            Insets imeInsets = windowInsets.getInsets(WindowInsetsCompat.Type.ime());

            // ?�태�??�비게이?�바 ?�셋�??�용 (IME ?�셋?� ?�스?�이 ?�동 처리?�도�?
            view.setPadding(insets.left, insets.top, insets.right, insets.bottom);

            // ?�비?��? ?�고 ?�파?�여 WebView가 IME ?�셋??반응?�도�?
            return windowInsets;
        });

        // ?�로가�?버튼 처리 (Android 13+ ?�환)
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    WebView webView = getBridge().getWebView();
                    String url = webView.getUrl();

                    android.util.Log.d("BackButton", "Current URL: " + url);

                    if (url != null) {
                        // URL?�서 쿼리 ?�라미터?� ?�시 ?�거
                        String cleanUrl = url.split("\\?")[0].split("#")[0];

                        boolean isMainPage = cleanUrl.endsWith("index.html") ||
                                           cleanUrl.endsWith("/") ||
                                           cleanUrl.equals("https://localhost") ||
                                           cleanUrl.equals("https://localhost/");

                        android.util.Log.d("BackButton", "Clean URL: " + cleanUrl + ", isMainPage: " + isMainPage);

                        if (isMainPage) {
                            // 메인 ?�면?�서????종료
                            finish();
                        } else {
                            // ?�른 ?�면?�서??JavaScript�?index.html�??�동 (?�션 ?��?)
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
        // ?�면 복�? ?�에??textZoom ?�적??
        applyTextZoomSafely();
    }

    /**
     * WebView textZoom 100% 강제 ?�정 (?�스???�프 방�?)
     * WebView 준�??�?�밍 ?�슈 방�?�??�해 post + 지???�시???�함
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

    /**
     * KeyHash 구하�?(Kakao ?�증??
     */
    private String getKeyHash() {
        try {
            PackageInfo packageInfo = getPackageManager().getPackageInfo(getPackageName(), PackageManager.GET_SIGNATURES);
            for (Signature signature : packageInfo.signatures) {
                MessageDigest md = MessageDigest.getInstance("SHA");
                md.update(signature.toByteArray());
                String keyHash = Base64.encodeToString(md.digest(), Base64.NO_WRAP);
                return keyHash;
            }
        } catch (PackageManager.NameNotFoundException | NoSuchAlgorithmException e) {
            android.util.Log.e("KakaoSDK", "Failed to get KeyHash", e);
        }
        return "";
    }
}
