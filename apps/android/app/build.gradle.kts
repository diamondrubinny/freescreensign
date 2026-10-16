plugins {
    id("com.android.application")
}

android {
    namespace = "net.rubinny.player"
    compileSdk = 37

    defaultConfig {
        applicationId = "net.rubinny.player"
        // PixelCopy of a window (screenshots) needs Android 8.0.
        minSdk = 26
        // Tested behavior: Android 16. Raise after testing on Android 17.
        targetSdk = 36
        versionCode = 3
        versionName = "0.3.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        abortOnError = true
        checkDependencies = true
        // targetSdk is raised deliberately after testing a new Android version.
        disable += "OldTargetApi"
    }
}

dependencies {
    // Origin-restricted message channel between the page and the app (no addJavascriptInterface).
    implementation("androidx.webkit:webkit:1.17.1")
    // Back handling that also works with predictive back (Android 13+).
    implementation("androidx.activity:activity:1.13.0")

    testImplementation("junit:junit:4.13.2")

    androidTestImplementation("androidx.test:core:1.7.0")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
}
