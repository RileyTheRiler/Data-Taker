plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.rileytheriler.datataker"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.rileytheriler.datataker"
        minSdk = 30
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    val generatedWebAssets = layout.buildDirectory.dir("generated/webAssets")
    sourceSets["main"].assets.srcDir(generatedWebAssets)

    testOptions { unitTests.isReturnDefaultValues = true }
}

kotlin { jvmToolchain(17) }

val syncWebAssets by tasks.registering(Copy::class) {
    from(rootProject.projectDir.parentFile) {
        include("*.html", "manifest.json", "static/**")
    }
    into(layout.buildDirectory.dir("generated/webAssets"))
}

tasks.named("preBuild").configure { dependsOn(syncWebAssets) }

dependencies {
    implementation(project(":shared"))
    implementation("androidx.activity:activity-ktx:1.12.1")
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("com.google.android.gms:play-services-wearable:20.0.1")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20250517")
    testImplementation("androidx.test:core:1.7.0")
    testImplementation("org.robolectric:robolectric:4.16")
}
