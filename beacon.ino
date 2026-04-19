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
const char* API_URL       = "https://beacon-app-beta.vercel.app/api/beacon-status?beacon_id=beacon-1";

// ── LED strip ─────────────────────────────────────────────
#define LED_PIN    5
#define LED_COUNT  12
Adafruit_NeoPixel strip(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);

// ── OLED screen (128x64, I2C) ─────────────────────────────
#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// ── State ─────────────────────────────────────────────────
String lastState    = "";
String lastActivity = "";
unsigned long lastPoll = 0;
const int POLL_INTERVAL = 3000;
float pulseStep = 0;

void setup() {
    Serial.begin(115200);

    // LEDs
    strip.begin();
    strip.setBrightness(180);
    strip.show();

    // OLED
    Wire.begin(21, 22); // SDA=21, SCL=22 (default ESP32 pins)
    if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
        Serial.println("OLED not found — check wiring");
    }

    showOLED("BEACON", "Connecting...", "");

    // WiFi
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30) {
        delay(500);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\nWiFi connected: " + WiFi.localIP().toString());
        showOLED("BEACON", "Ready!", "Scan the QR code");
        setLEDs_empty();
    } else {
        showOLED("BEACON", "WiFi failed", "Check credentials");
    }
}

void loop() {
    // Animate pulse in waiting state
    if (lastState == "waiting") {
        animatePulse();
    }

    // Poll API
    if (millis() - lastPoll > POLL_INTERVAL) {
        lastPoll = millis();
        pollAPI();
    }

    delay(30);
}

// ── API polling ───────────────────────────────────────────

void pollAPI() {
    if (WiFi.status() != WL_CONNECTED) return;

    HTTPClient http;
    http.begin(API_URL);
    http.setTimeout(5000);
    int code = http.GET();

    if (code == 200) {
        String body = http.getString();
        Serial.println(body);

        StaticJsonDocument<512> doc;
        DeserializationError err = deserializeJson(doc, body);
        if (err) { Serial.println("JSON parse error"); return; }

        String state    = doc["state"].as<String>();
        String activity = doc["activity"].isNull() ? "" : doc["activity"].as<String>();
        String userA    = doc["user_a"].isNull()   ? "" : doc["user_a"].as<String>();
        String userB    = doc["user_b"].isNull()   ? "" : doc["user_b"].as<String>();

        if (state != lastState || activity != lastActivity) {
            lastState    = state;
            lastActivity = activity;
            handleStateChange(state, activity, userA, userB);
        }
    } else {
        Serial.println("HTTP error: " + String(code));
    }
    http.end();
}

void handleStateChange(String state, String activity, String userA, String userB) {
    Serial.println("→ State: " + state);

    if (state == "empty" || state == "") {
        setLEDs_empty();
        showOLED("BEACON", "Scan the QR", "to get started!");

    } else if (state == "waiting") {
        showOLED("BEACON", userA + " is here!", "Scan QR to join");
        // LEDs handled by animatePulse() in loop()

    } else if (state == "matched") {
        setLEDs_matched();
        String names = userA + " + " + userB;
        showOLED("MATCHED!", names.c_str(), "Picking activity...");

    } else if (state == "done") {
        setLEDs_done();
        showActivity(activity);
    }
}

// ── LED states ────────────────────────────────────────────

void setLEDs_empty() {
    for (int i = 0; i < LED_COUNT; i++)
        strip.setPixelColor(i, strip.Color(8, 8, 12));
    strip.show();
}

void animatePulse() {
    pulseStep += 0.05;
    int brightness = (int)(127 + 127 * sin(pulseStep));
    for (int i = 0; i < LED_COUNT; i++)
        strip.setPixelColor(i, strip.Color(brightness, brightness / 5, 0));
    strip.show();
}

void setLEDs_matched() {
    for (int i = 0; i < LED_COUNT; i++)
        strip.setPixelColor(i, strip.Color(0, 200, 50));
    strip.show();
}

void setLEDs_done() {
    for (int i = 0; i < LED_COUNT; i++) {
        uint16_t hue = (i * 65536L / LED_COUNT);
        strip.setPixelColor(i, strip.gamma32(strip.ColorHSV(hue)));
    }
    strip.show();
}

// ── OLED helpers ──────────────────────────────────────────

void showOLED(String line1, String line2, String line3) {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextWrap(false);

    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println(line1);

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
    display.drawLine(0, 10, 128, 10, SSD1306_WHITE);
    display.setCursor(0, 14);
    display.setTextWrap(true);
    display.println(text);
    display.display();
}
