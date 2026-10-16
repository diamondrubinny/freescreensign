plugins {
    id("com.android.application")
}

android {
    namespace = "net.rubinny.player"
    compileSdk = 36

    defaultConfig {
        applicationId = "net.rubinny.player"
        // PixelCopy of a window (screenshots) needs Android 8.0.
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
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
    }
}

dependencies {
    // Origin-restricted message channel between the page and the app (no addJavascriptInterface).
    implementation("androidx.webkit:webkit:1.12.1")
    // Back handling that also works with predictive back (Android 13+).
    implementation("androidx.activity:activity:1.9.3")

    testImplementation("junit:junit:4.13.2")

    androidTestImplementation("androidx.test:core:1.6.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
}
