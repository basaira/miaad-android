package com.miaad.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.animation.ValueAnimator;
import android.graphics.drawable.ColorDrawable;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.KeyEvent;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.View;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;

public class MainActivity extends Activity {
    private static final int REQ_NOTIFICATIONS = 4101;
    private static final int REQ_FILE = 4102;
    private static final long MIN_BRANDED_SPLASH_MS = 650L;

    private WebView webView;
    private MiaadBridge bridge;
    private ValueCallback<Uri[]> fileCallback;
    private FrameLayout root;
    private View splashOverlay;
    private boolean splashHidden = false;
    private long splashStartedAt;
    private FirebaseAuth firebaseAuth;
    private FirebaseAuth.AuthStateListener authObserver;
    private String loadedFirebaseUid;
    private boolean authAttemptPending;

    @Override
    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        splashStartedAt = SystemClock.uptimeMillis();

        final int deepGreen = Color.rgb(8, 31, 24);
        getWindow().setStatusBarColor(deepGreen);
        getWindow().setNavigationBarColor(deepGreen);
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);

        getWindow().setBackgroundDrawable(new ColorDrawable(deepGreen));
        root = new FrameLayout(this);
        root.setBackgroundColor(deepGreen);
        if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0)
            WebView.setWebContentsDebuggingEnabled(true);
        webView = new WebView(this);
        webView.setBackgroundColor(deepGreen);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));

        splashOverlay = createBrandedSplash();
        root.addView(splashOverlay, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
        setContentView(root);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(
                        android.view.WindowInsets.Type.systemBars() |
                        android.view.WindowInsets.Type.displayCutout());
                android.graphics.Insets keyboard = insets.getInsets(android.view.WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom));
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        root.requestApplyInsets();

        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        webSettings.setAllowFileAccess(true);
        webSettings.setAllowContentAccess(true);
        webSettings.setJavaScriptCanOpenWindowsAutomatically(false);
        webSettings.setMediaPlaybackRequiresUserGesture(true);
        webSettings.setCacheMode(WebSettings.LOAD_DEFAULT);
        webSettings.setBuiltInZoomControls(false);
        webSettings.setDisplayZoomControls(false);
        webSettings.setSupportZoom(false);
        webSettings.setTextZoom(100);
        // Prepare the covered WebView's first frame before the splash fades.
        webSettings.setOffscreenPreRaster(true);

        bridge = new MiaadBridge(this, webView);
        webView.addJavascriptInterface(bridge, "AndroidBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (url == null || !url.startsWith("file:///android_asset/index.html")) return;
                // A superseded page may finish after Authentication moved
                // from A to B. Never reveal that page or attach a B Cloud read
                // until its JS bootstrap proves the current Native session.
                final String expected=bridge.sessionToken();
                final String ready="(function(){try{return typeof ownershipEnabled==='boolean'"+
                    "&&(!ownershipEnabled||ownerSession==="+org.json.JSONObject.quote(expected)+
                    ");}catch(e){return false;}})()";
                view.evaluateJavascript(ready, response -> {
                    if (!"true".equals(response) ||
                            !expected.equals(bridge.sessionToken())) return;
                    android.util.Log.i("MiaadStartup", "page-finished");
                    bridge.setPageReady(true);
                    openNotificationIntent(getIntent());
                    bridge.pullCloudToWeb();
                    view.postVisualStateCallback(0, new WebView.VisualStateCallback() {
                        @Override public void onComplete(long requestId) {
                            if (!expected.equals(bridge.sessionToken())) return;
                            view.setVisibility(View.VISIBLE);
                            android.util.Log.i("MiaadStartup", "first-frame-ready");
                            hideSplash();
                        }
                    });
                });
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url == null || url.startsWith("file:///android_asset/") || url.startsWith("file:///android_res/")) {
                    return false;
                }
                if (url.startsWith("https://") || url.startsWith("http://")) {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    return true;
                }
                return false;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(android.webkit.ConsoleMessage message) {
                if (message.messageLevel() == android.webkit.ConsoleMessage.MessageLevel.ERROR) {
                    android.util.Log.e("MiaadWeb", message.message() + " line " + message.lineNumber());
                }
                return true;
            }
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent;
                try {
                    intent = params.createIntent();
                } catch (Exception e) {
                    intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("application/json");
                }
                startActivityForResult(intent, REQ_FILE);
                return true;
            }
        });

        // Android 13+ uses the predictive-back dispatcher. This preserves the
        // existing WebView history behavior while avoiding deprecated onBackPressed().
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                    () -> handleBackNavigation()
            );
        }

        authenticateForCloudSync();
    }

    private void handleBackNavigation() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else finish();
    }

    /** Compatibility path for Android 8–12, where the predictive-back API does not exist. */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && Build.VERSION.SDK_INT < 33) {
            handleBackNavigation();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    private void openNotificationIntent(Intent intent) {
        String entity = intent == null ? null : intent.getStringExtra("entity");
        if (entity == null || entity.isEmpty()) return;
        intent.removeExtra("entity");
        webView.evaluateJavascript("window.__miaadOpenNotification && window.__miaadOpenNotification(" +
                org.json.JSONObject.quote(entity) + ");", null);
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openNotificationIntent(intent);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private TextView brandText(int resource, int size, int color) {
        TextView text = new TextView(this);
        text.setText(resource);
        text.setTextSize(size);
        text.setTextColor(color);
        text.setGravity(Gravity.CENTER);
        return text;
    }

    private View createBrandedSplash() {
        LinearLayout splash = new LinearLayout(this);
        splash.setOrientation(LinearLayout.VERTICAL);
        splash.setGravity(Gravity.CENTER);
        splash.setBackgroundColor(Color.rgb(8, 31, 24));
        splash.setPadding(dp(24), dp(24), dp(24), dp(24));
        splash.setClickable(true);

        ImageView artwork = new ImageView(this);
        artwork.setImageResource(R.drawable.miaad_logo);
        artwork.setScaleType(ImageView.ScaleType.FIT_CENTER);
        artwork.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        int logoSize = Math.min(180, getResources().getConfiguration().screenHeightDp / 3);
        splash.addView(artwork, new LinearLayout.LayoutParams(dp(logoSize), dp(logoSize)));
        TextView arabic = brandText(R.string.app_name, 34, Color.rgb(246, 241, 230));
        arabic.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(-1, -2);
        titleParams.topMargin = dp(14);
        splash.addView(arabic, titleParams);
        TextView latin = brandText(R.string.brand_latin, 13, Color.rgb(201, 164, 97));
        latin.setLetterSpacing(0.22f);
        splash.addView(latin);
        TextView tagline = brandText(R.string.brand_tagline, 15, Color.rgb(222, 225, 212));
        LinearLayout.LayoutParams taglineParams = new LinearLayout.LayoutParams(-1, -2);
        taglineParams.topMargin = dp(14);
        splash.addView(tagline, taglineParams);
        return splash;
    }

    private void hideSplash() {
        if (splashHidden || splashOverlay == null || root == null) return;

        long elapsed = SystemClock.uptimeMillis() - splashStartedAt;
        if (elapsed < MIN_BRANDED_SPLASH_MS) {
            root.postDelayed(this::hideSplash, MIN_BRANDED_SPLASH_MS - elapsed);
            return;
        }

        splashHidden = true;
        splashOverlay.animate()
                .alpha(0f)
                .setDuration(ValueAnimator.areAnimatorsEnabled() ? 220 : 0)
                .withEndAction(() -> {
                    if (splashOverlay != null && splashOverlay.getParent() == root) {
                        root.removeView(splashOverlay);
                    }
                    splashOverlay = null;
                    webView.getSettings().setOffscreenPreRaster(false);
                    android.util.Log.i("MiaadStartup", "content-ready");
                    requestNotificationPermissionIfNeeded();
                })
                .start();
    }

    boolean isIsolatedFirebaseTestMode() {
        return (getApplicationInfo().flags &
            android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0 &&
            getIntent().getBooleanExtra("miaad_isolated_no_firebase", false);
    }
    boolean requiresIsolatedAuthVerification() {
        return isIsolatedFirebaseTestMode() &&
               getIntent().getBooleanExtra("miaad_test_auth_emulator",false);
    }

    private void authenticateForCloudSync() {
        if (isIsolatedFirebaseTestMode()) {
            bridge.setUid(null);
            webView.loadUrl("file:///android_asset/index.html");
            return;
        }
        firebaseAuth=FirebaseAuth.getInstance();
        authObserver=auth -> {
            FirebaseUser current=auth.getCurrentUser();
            if (current != null) {
                authAttemptPending=false;
                final String now=current.getUid();
                if (!java.util.Objects.equals(loadedFirebaseUid,now)) {
                    // Stop rendering or saving the previous owner's DOM before
                    // a new owner's WebView is initialized.
                    webView.setVisibility(View.INVISIBLE);
                    bridge.setUid(now);
                    bridge.setPageReady(false);
                    loadedFirebaseUid=now;
                    webView.stopLoading();
                    webView.loadUrl("about:blank");
                    webView.loadUrl("file:///android_asset/index.html");
                }
                return;
            }
            if (loadedFirebaseUid != null) {
                loadedFirebaseUid=null;
                webView.setVisibility(View.INVISIBLE);
                bridge.setUid(null);
                bridge.setPageReady(false);
                webView.stopLoading();
                webView.loadUrl("about:blank");
            }
            if (authAttemptPending) return;
            authAttemptPending=true;
            auth.signInAnonymously().addOnCompleteListener(this, task -> {
                authAttemptPending=false;
                if (!task.isSuccessful()) {
                    bridge.pushNativeStatus("cloud-pending");
                    android.util.Log.w("MiaadAuth","Sign-in unavailable; withholding owned academic view.");
                }
            });
        };
        firebaseAuth.addAuthStateListener(authObserver);
    }

    public void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
        }
    }

    public boolean notificationsEnabled() {
        return Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    public void openAppNotificationSettings() {
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
        startActivity(intent);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE && fileCallback != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null) {
                Uri uri = data.getData();
                if (uri != null) result = new Uri[]{uri};
            }
            fileCallback.onReceiveValue(result);
            fileCallback = null;
        }
    }

    @Override
    protected void onDestroy() {
        if (firebaseAuth != null && authObserver != null)
            firebaseAuth.removeAuthStateListener(authObserver);
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidBridge");
            webView.destroy();
        }
        super.onDestroy();
    }
}
