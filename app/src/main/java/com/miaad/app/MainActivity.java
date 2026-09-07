package com.miaad.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.animation.ValueAnimator;
import android.graphics.drawable.ColorDrawable;
import android.graphics.Typeface;
import android.view.Gravity;
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

        bridge = new MiaadBridge(this, webView);
        webView.addJavascriptInterface(bridge, "AndroidBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                bridge.setPageReady(true);
                bridge.pullCloudToWeb();
                // The static HTML loads the final local theme and brand scripts.
                // Reveal only after WebView confirms the frame can be drawn.
                view.postVisualStateCallback(0, new WebView.VisualStateCallback() {
                    @Override public void onComplete(long requestId) {
                        hideSplash();
                    }
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

        authenticateForCloudSync();
        webView.loadUrl("file:///android_asset/index.html");
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
                    requestNotificationPermissionIfNeeded();
                })
                .start();
    }

    private void authenticateForCloudSync() {
        FirebaseAuth auth = FirebaseAuth.getInstance();
        FirebaseUser user = auth.getCurrentUser();
        if (user != null) {
            bridge.setUid(user.getUid());
            bridge.pullCloudToWeb();
            return;
        }

        auth.signInAnonymously().addOnCompleteListener(this, task -> {
            if (task.isSuccessful() && auth.getCurrentUser() != null) {
                bridge.setUid(auth.getCurrentUser().getUid());
                bridge.pullCloudToWeb();
            } else {
                bridge.pushNativeStatus("local-only");
            }
        });
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
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidBridge");
            webView.destroy();
        }
        super.onDestroy();
    }
}
