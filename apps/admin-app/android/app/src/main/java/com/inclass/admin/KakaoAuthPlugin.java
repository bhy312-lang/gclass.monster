package com.inclass.admin;

import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.kakao.sdk.auth.model.OAuthToken;
import com.kakao.sdk.user.UserApiClient;
import com.kakao.sdk.user.model.User;
import kotlin.Unit;
import kotlin.jvm.functions.Function2;
import kotlin.jvm.functions.Function1;

@CapacitorPlugin(name = "KakaoAuth")
public class KakaoAuthPlugin extends Plugin {

    private static final String TAG = "KakaoAuth";

    @PluginMethod
    public void login(PluginCall call) {
        if (UserApiClient.getInstance().isKakaoTalkLoginAvailable(getActivity())) {
            // 카카오톡 앱으로 로그인
            UserApiClient.getInstance().loginWithKakaoTalk(getActivity(),
                new Function2<OAuthToken, Throwable, Unit>() {
                    @Override
                    public Unit invoke(OAuthToken token, Throwable error) {
                        if (error != null) {
                            Log.e(TAG, "Kakao login failed", error);
                            JSObject result = new JSObject();
                            result.put("success", false);
                            result.put("error", error.getMessage());
                            call.resolve(result);
                            return Unit.INSTANCE;
                        }
                        Log.d(TAG, "Kakao login success");
                        getUserInfo(call, token);
                        return Unit.INSTANCE;
                    }
                });
        } else {
            // 카카오 계정으로 로그인 (웹뷰)
            UserApiClient.getInstance().loginWithKakaoAccount(getActivity(),
                new Function2<OAuthToken, Throwable, Unit>() {
                    @Override
                    public Unit invoke(OAuthToken token, Throwable error) {
                        if (error != null) {
                            Log.e(TAG, "Kakao login failed (account)", error);
                            JSObject result = new JSObject();
                            result.put("success", false);
                            result.put("error", error.getMessage());
                            call.resolve(result);
                            return Unit.INSTANCE;
                        }
                        Log.d(TAG, "Kakao login success (account)");
                        getUserInfo(call, token);
                        return Unit.INSTANCE;
                    }
                });
        }
    }

    private void getUserInfo(PluginCall call, OAuthToken token) {
        UserApiClient.getInstance().me(new Function2<User, Throwable, Unit>() {
            @Override
            public Unit invoke(User user, Throwable error) {
                JSObject result = new JSObject();
                if (error != null) {
                    Log.e(TAG, "Failed to get user info", error);
                    result.put("success", true);
                    result.put("accessToken", token.getAccessToken());
                    result.put("refreshToken", token.getRefreshToken());
                    result.put("id", 0);
                    result.put("email", (String)null);
                    result.put("nickname", (String)null);
                    call.resolve(result);
                    return Unit.INSTANCE;
                }

                result.put("success", true);
                result.put("accessToken", token.getAccessToken());
                result.put("refreshToken", token.getRefreshToken());
                result.put("id", user.getId());
                result.put("email", user.getKakaoAccount() != null ? user.getKakaoAccount().getEmail() : null);
                result.put("nickname", user.getKakaoAccount() != null && user.getKakaoAccount().getProfile() != null
                        ? user.getKakaoAccount().getProfile().getNickname() : null);

                call.resolve(result);
                return Unit.INSTANCE;
            }
        });
    }

    @PluginMethod
    public void logout(PluginCall call) {
        UserApiClient.getInstance().logout(new Function1<Throwable, Unit>() {
            @Override
            public Unit invoke(Throwable error) {
                JSObject result = new JSObject();
                if (error != null) {
                    result.put("success", false);
                    result.put("error", error.getMessage());
                } else {
                    result.put("success", true);
                }
                call.resolve(result);
                return Unit.INSTANCE;
            }
        });
    }
}
