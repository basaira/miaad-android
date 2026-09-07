package com.miaad.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;

public class MainActivity extends Activity {
    private static final int REQ_NOTIFICATIONS = 4101;
    private static final int REQ_FILE = 4102;
    private static final long MIN_BRANDED_SPLASH_MS = 720L;

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
        getWindow().getDecorView().setBackgroundColor(deepGreen);

        root = new FrameLayout(this);
        root.setBackgroundColor(deepGreen);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(244, 240, 231));
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
                installChronometricLuxury(view);
                view.postDelayed(MainActivity.this::hideSplash, 80L);
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
        requestNotificationPermissionIfNeeded();
        webView.loadUrl("file:///android_asset/index.html");
    }

    private View createBrandedSplash() {
        final int deepGreen = Color.rgb(8, 31, 24);
        final int ivory = Color.rgb(246, 241, 230);
        final int gold = Color.rgb(217, 183, 104);
        final int muted = Color.rgb(188, 202, 194);

        FrameLayout splash = new FrameLayout(this);
        splash.setBackgroundColor(deepGreen);
        splash.setClickable(true);
        splash.setContentDescription("مِيعاد — لكل موعد قيمة");

        LinearLayout stack = new LinearLayout(this);
        stack.setOrientation(LinearLayout.VERTICAL);
        stack.setGravity(Gravity.CENTER_HORIZONTAL);
        stack.setPadding(dp(28), dp(28), dp(28), dp(28));

        ImageView artwork = new ImageView(this);
        artwork.setImageResource(R.drawable.miaad_logo);
        artwork.setScaleType(ImageView.ScaleType.CENTER_CROP);
        artwork.setContentDescription("شعار مِيعاد");
        LinearLayout.LayoutParams artParams = new LinearLayout.LayoutParams(dp(190), dp(190));
        artParams.bottomMargin = dp(24);
        stack.addView(artwork, artParams);

        TextView arabicName = splashText("مِيعاد", 34f, ivory, Typeface.BOLD);
        stack.addView(arabicName, wrapCentered());

        TextView latinName = splashText("MIAAD", 13f, muted, Typeface.NORMAL);
        LinearLayout.LayoutParams latinParams = wrapCentered();
        latinParams.topMargin = dp(2);
        stack.addView(latinName, latinParams);

        View divider = new View(this);
        GradientDrawable dividerBg = new GradientDrawable();
        dividerBg.setColor(gold);
        dividerBg.setCornerRadius(dp(2));
        divider.setBackground(dividerBg);
        LinearLayout.LayoutParams dividerParams = new LinearLayout.LayoutParams(dp(44), dp(2));
        dividerParams.topMargin = dp(14);
        dividerParams.bottomMargin = dp(13);
        dividerParams.gravity = Gravity.CENTER_HORIZONTAL;
        stack.addView(divider, dividerParams);

        TextView tagline = splashText("لكل موعد قيمة", 17f, gold, Typeface.NORMAL);
        stack.addView(tagline, wrapCentered());

        TextView signature = splashText("CHRONOMETRIC LUXURY", 8f, muted, Typeface.NORMAL);
        signature.setLetterSpacing(0.12f);
        LinearLayout.LayoutParams signatureParams = wrapCentered();
        signatureParams.topMargin = dp(82);
        stack.addView(signature, signatureParams);

        FrameLayout.LayoutParams stackParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
        );
        stackParams.gravity = Gravity.CENTER;
        splash.addView(stack, stackParams);
        return splash;
    }

    private TextView splashText(String text, float sp, int color, int style) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextColor(color);
        view.setTextSize(sp);
        view.setGravity(Gravity.CENTER);
        view.setTypeface(Typeface.create("sans-serif", style));
        view.setIncludeFontPadding(false);
        return view;
    }

    private LinearLayout.LayoutParams wrapCentered() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.gravity = Gravity.CENTER_HORIZONTAL;
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void installChronometricLuxury(WebView view) {
        String js = "(function(){" +
                "if(!document.getElementById('chronometricLuxuryCss')){" +
                "var l=document.createElement('link');l.id='chronometricLuxuryCss';l.rel='stylesheet';l.href='file:///android_asset/css-luxury.css';document.head.appendChild(l);}" +
                "if(!document.getElementById('chronometricLuxuryJs')){" +
                "var s=document.createElement('script');s.id='chronometricLuxuryJs';s.src='file:///android_asset/app-luxury.js';document.body.appendChild(s);}" +
                "})();";
        view.evaluateJavascript(js, null);
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
                .setDuration(260)
                .withEndAction(() -> {
                    if (splashOverlay != null && splashOverlay.getParent() == root) {
                        root.removeView(splashOverlay);
                    }
                    splashOverlay = null;
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
