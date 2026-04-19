cat > beacon.ino << 'EOF'
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Adafruit_NeoPixel.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ── Config ────────────────────────────────────────────────
const char* WIFI_SSID     = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* API_URL       = "https://YOUR_APP.vercel.app/api/beacon-status?beacon_id=beacon-1";

// ── LED strip ─────────────────────────────────────────────
#define LED_PIN    5
#define LED_COUNT  12
Adafruit_NeoPixel strip(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);

// ── OLED screen (128x64, I2C) ─────────────────────────────
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// ── State ─────────────────────────────────────────────────
String lastState = "";
String lastActivity = "";
unsigned long lastPoll = 0;
const int POLL_INTERVAL = 3000; // poll every 3 seconds
int pulseStep = 0;

void setup() {
    Serial.begin(115200);
    strip.begin();
    strip.setBrightness(180);
    strip.show();

    if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
        Serial.println("OLED not found");
    }
    showOLED("Beacon", "Connecting...", "");

    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nWiFi connected");
    showOLED("Beacon", "Ready", "Scan the QR!");
    setLEDs_empty();
}

void loop() {
    unsigned long now = millis();

    // Animate pulse for waiting state
    if (lastState == "waiting") {
        animatePulse();
    }

    // Poll API every POLL_INTERVAL ms
    if (now - lastPoll > POLL_INTERVAL) {
        lastPoll = now;
        pollAPI();
    }

    delay(30);
}

void pollAPI() {
    if (WiFi.status() != WL_CONNECTED) return;

    HTTPClient http;
    http.begin(API_URL);
    int code = http.GET();

    if (code == 200) {
        String body = http.getString();
        StaticJsonDocument<512> doc;
        deserializeJson(doc, body);

        String state    = doc["state"].as<String>();
        String activity = doc["activity"].isNull() ? "" : doc["activity"].as<String>();
        String userA    = doc["user_a"].isNull()   ? "" : doc["user_a"].as<String>();
        String userB    = doc["user_b"].isNull()   ? "" : doc["user_b"].as<String>();

        // Only update if something changed
        if (state != lastState || activity != lastActivity) {
            lastState    = state;
            lastActivity = activity;
            handleStateChange(state, activity, userA, userB);
        }
    }
    http.end();
}

void handleStateChange(String state, String activity, String userA, String userB) {
    Serial.println("State: " + state);

    if (state == "empty" || state == "") {
        setLEDs_empty();
        showOLED("BEACON", "Scan the QR", "to get started!");

    } else if (state == "waiting") {
        // Pulsing orange — person A is waiting
        showOLED("BEACON", userA + " is here!", "Scan to join...");
        // LEDs handled in loop() via animatePulse()

    } else if (state == "matched") {
        setLEDs_matched();
        showOLED("MATCHED!", userA + " + " + userB, "Setting activity...");

    } else if (state == "done") {
        setLEDs_done();
        // Show activity on screen, wrap long text
        showActivity(activity);
    }
}

// ── LED states ────────────────────────────────────────────

void setLEDs_empty() {
    // Slow dim white breathe
    for (int i = 0; i < LED_COUNT; i++) {
        strip.setPixelColor(i, strip.Color(10, 10, 10));
    }
    strip.show();
}

void animatePulse() {
    // Orange pulse for waiting
    pulseStep = (pulseStep + 3) % 360;
    float rad = pulseStep * PI / 180.0;
    int brightness = (int)(127 + 127 * sin(rad));
    for (int i = 0; i < LED_COUNT; i++) {
        strip.setPixelColor(i, strip.Color(brightness, brightness / 4, 0));
    }
    strip.show();
}

void setLEDs_matched() {
    // Solid green
    for (int i = 0; i < LED_COUNT; i++) {
        strip.setPixelColor(i, strip.Color(0, 200, 50));
    }
    strip.show();
}

void setLEDs_done() {
    // Cycling rainbow celebration
    for (int i = 0; i < LED_COUNT; i++) {
        int hue = (i * 65536L / LED_COUNT);
        strip.setPixelColor(i, strip.gamma32(strip.ColorHSV(hue)));
    }
    strip.show();
}

// ── OLED helpers ──────────────────────────────────────────

void showOLED(String line1, String line2, String line3) {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);

    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println(line1);

    display.setTextSize(1);
    display.setCursor(0, 20);
    display.println(line2);

    display.setCursor(0, 40);
    display.println(line3);

    display.display();
}

void showActivity(String text) {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println("YOUR ACTIVITY:");
    display.setCursor(0, 14);
    // Word wrap — print chars, break at spaces near 21 chars wide
    display.setTextWrap(true);
    display.println(text);
    display.display();
}
EOF
