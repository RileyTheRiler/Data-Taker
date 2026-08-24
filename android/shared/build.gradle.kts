plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.rileytheriler.datataker.shared"
    compileSdk = 36

    defaultConfig { minSdk = 30 }
}
