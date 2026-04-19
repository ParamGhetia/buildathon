#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <Adafruit_NeoPixel.h>
#include <Wire.h>
#include <LCD-I2C.h>

// ── Config ────────────────────────────────────────────────
const char* WIFI_SSID     = "Fortnite ";
const char* WIFI_PASSWORD = "5guys!!!";
const char* API_URL       = "https://beacon-app-beta.vercel.app/api/beacon-status?beacon_id=beacon-1";

// ── LED strip ─────────────────────────────────────────────
#define LED_PIN    13
#define LED_COUNT  11
Adafruit_NeoPixel strip(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);

// ── Buzzer ────────────────────────────────────────────────
#define BUZZER_PIN  14
#define BUZZER_ON   LOW
#define BUZZER_OFF  HIGH

// ── Joystick button ───────────────────────────────────────
#define JOYSTICK_SW     16
bool waitingForButton   = false;
bool displayOn          = false;
bool lastButtonState    = HIGH;
String pendingActivity  = "";
String pendingUserA     = "";
String pendingUserB     = "";

// ── LCD ───────────────────────────────────────────────────
LCD_I2C lcd(0x27, 16, 2);

// ── Scrolling ─────────────────────────────────────────────
String scrollLine1       = "";
String scrollLine2       = "";
int scrollPos            = 0;
unsigned long lastScroll = 0;
const int SCROLL_INTERVAL = 350;
bool scrolling           = false;

// ── State ─────────────────────────────────────────────────
String lastState    = "";
String lastActivity = "";
unsigned long lastPoll = 0;
const int POLL_INTERVAL = 3000;
float pulseStep = 0;

// ── LED layout ────────────────────────────────────────────
#define WHITE_LED 0
int redSlots[]  = {1, 3, 5, 7, 9};
int blueSlots[] = {2, 4, 6, 8, 10};

// ── Forward declarations ──────────────────────────────────
void buzz(int durationMs);
void buzzPattern(int times, int onMs, int offMs);
void pollAPI();
void handleStateChange(String state, String activity, String userA, String userB);
void revealActivity();
void setLEDs_empty();
void setLEDs_userA();
void setLEDs_userB();
void animatePulse();
void animateReadyPulse();
void showLCD(String line1, String line2);
void showLCDScroll(String line1, String line2);
void tickScroll();
void updateLCDForState();

// ─────────────────────────────────────────────────────────
void setup() {
    pinMode(BUZZER_PIN, OUTPUT);
    digitalWrite(BUZZER_PIN, BUZZER_OFF);

    Serial.begin(115200);
    delay(500);
    Serial.println("\n\n=== BEACON BOOT ===");

    pinMode(JOYSTICK_SW, INPUT);

    // LCD
    Wire.begin();
    lcd.begin(&Wire);
    lcd.display();
    lcd.backlightOff();
    Serial.println("[LCD] OK");

    // LEDs
    strip.begin();
    strip.setBrightness(180);
    strip.show();
    Serial.println("[LEDs] OK");

    // WiFi
    Serial.print("[WiFi] Connecting to: ");
    Serial.println(WIFI_SSID);

    WiFi.persistent(false);
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();
    delay(100);

    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 40) {
        delay(500);
        Serial.print(".");
        Serial.print(WiFi.status());
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\n[WiFi] Connected: " + WiFi.localIP().toString());
        buzzPattern(2, 100, 80);
        setLEDs_empty();
    } else {
        Serial.println("\n[WiFi] !! FAILED — last status: " + String(WiFi.status()));
        buzzPattern(3, 300, 100);
    }
}

// ─────────────────────────────────────────────────────────
void loop() {
    // Button toggle
    bool currentButtonState = digitalRead(JOYSTICK_SW);
    if (lastButtonState == HIGH && currentButtonState == LOW) {
        delay(50);
        if (digitalRead(JOYSTICK_SW) == LOW) {
            if (waitingForButton) {
                waitingForButton = false;
                revealActivity();
            } else {
                displayOn = !displayOn;
                if (displayOn) {
                    lcd.backlight();
                    updateLCDForState();
                } else {
                    scrolling = false;
                    lcd.clear();
                    lcd.backlightOff();
                }
            }
        }
    }
    lastButtonState = currentButtonState;

    // Tick scroll if active and display is on
    if (scrolling && displayOn) {
        tickScroll();
    }

    if (waitingForButton) {
        animateReadyPulse();
    } else if (lastState == "waiting") {
        animatePulse();
    }

    if (millis() - lastPoll > POLL_INTERVAL) {
        lastPoll = millis();
        pollAPI();
    }

    delay(30);
}

// ── Scrolling LCD ─────────────────────────────────────────
void showLCDScroll(String line1, String line2) {
    scrollLine1 = line1;
    scrollLine2 = "                " + line2 + "                "; // 16 spaces each side
    scrollPos   = 0;
    lastScroll  = millis();
    scrolling   = (line2.length() > 16);

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print(scrollLine1.substring(0, 16));

    if (!scrolling) {
        lcd.setCursor(0, 1);
        lcd.print(line2.substring(0, 16));
    }
}

void showLCD(String line1, String line2) {
    scrolling = false;
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print(line1.substring(0, 16));
    lcd.setCursor(0, 1);
    lcd.print(line2.substring(0, 16));
}

void tickScroll() {
    if (millis() - lastScroll < SCROLL_INTERVAL) return;
    lastScroll = millis();

    int len = scrollLine2.length();
    char window[17];  // 16 chars + null terminator

    for (int i = 0; i < 16; i++) {
        window[i] = scrollLine2[(scrollPos + i) % len];
    }
    window[16] = '\0';

    lcd.setCursor(0, 1);
    lcd.print(window);

    scrollPos++;
    if (scrollPos >= len) scrollPos = 0;
}

void updateLCDForState() {
    if (lastState == "" || lastState == "empty") {
        showLCD("BEACON", "Scan QR 2 start");
    } else if (lastState == "waiting") {
        showLCD(pendingUserA + " is here!", "Scan QR to join");
    } else if (lastState == "matched") {
        showLCD("MATCHED!", pendingUserA + " + " + pendingUserB);
    } else if (lastState == "done") {
        showLCDScroll("Press button", "to reveal your activity!");
    }
}

// ── Buzzer ────────────────────────────────────────────────
void buzz(int durationMs) {
    digitalWrite(BUZZER_PIN, BUZZER_ON);
    delay(durationMs);
    digitalWrite(BUZZER_PIN, BUZZER_OFF);
}

void buzzPattern(int times, int onMs, int offMs) {
    for (int i = 0; i < times; i++) {
        buzz(onMs);
        if (i < times - 1) delay(offMs);
    }
}

// ── API polling ───────────────────────────────────────────
void pollAPI() {
    if (WiFi.status() != WL_CONNECTED) return;

    WiFiClientSecure client;
    client.setInsecure();
    HTTPClient http;
    http.begin(client, API_URL);
    http.setTimeout(8000);
    http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);

    int code = http.GET();
    Serial.println("[API] HTTP code: " + String(code));

    if (code == 200) {
        String body = http.getString();
        Serial.println("[API] Raw response: " + body);

        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, body);
        if (err) {
            Serial.println("[API] !! JSON parse error: " + String(err.c_str()));
            http.end();
            return;
        }

        String state    = doc["state"].as<String>();
        String activity = doc["activity"].isNull() ? "" : doc["activity"].as<String>();
        String userA    = doc["user_a"].isNull()   ? "" : doc["user_a"].as<String>();
        String userB    = doc["user_b"].isNull()   ? "" : doc["user_b"].as<String>();

        Serial.println("[API] state=" + state + " activity=" + activity + " userA=" + userA + " userB=" + userB);

        if (state != lastState || activity != lastActivity) {
            Serial.println("[STATE] Change: " + lastState + " → " + state);
            lastState    = state;
            lastActivity = activity;
            handleStateChange(state, activity, userA, userB);
        }
    } else {
        Serial.println("[API] !! HTTP error: " + String(code));
    }
    http.end();
}

// ── State handler ─────────────────────────────────────────
void handleStateChange(String state, String activity, String userA, String userB) {
    Serial.println("[STATE] Handling: " + state);

    if (state == "empty" || state == "") {
        waitingForButton = false;
        setLEDs_empty();
        pendingUserA = "";
        pendingUserB = "";
        if (displayOn) showLCD("BEACON", "Scan QR 2 start");

    } else if (state == "waiting") {
        waitingForButton = false;
        pendingUserA = userA;
        setLEDs_userA();
        if (displayOn) showLCD(userA + " is here!", "Scan QR to join");
        buzzPattern(1, 150, 0);

    } else if (state == "matched") {
        waitingForButton = false;
        pendingUserA = userA;
        pendingUserB = userB;
        setLEDs_userB();
        if (displayOn) showLCD("MATCHED!", userA + " + " + userB);
        buzzPattern(3, 80, 60);

    } else if (state == "done") {
        pendingActivity  = activity;
        pendingUserA     = userA;
        pendingUserB     = userB;
        waitingForButton = true;
        if (displayOn) showLCDScroll("Press button", "to reveal your activity!");
        buzzPattern(1, 200, 0);
    }
}

// ── Reveal on button press ────────────────────────────────
void revealActivity() {
    Serial.println("[REVEAL] Revealing: " + pendingActivity);

    for (int flash = 0; flash < 8; flash++) {
        strip.setPixelColor(WHITE_LED, strip.Color(255, 255, 255));
        for (int i = 0; i < 5; i++) {
            strip.setPixelColor(redSlots[i],  strip.Color(255, 0, 0));
            strip.setPixelColor(blueSlots[i], strip.Color(0, 0, 0));
        }
        strip.show();
        buzz(80);
        delay(80);

        strip.setPixelColor(WHITE_LED, strip.Color(255, 255, 255));
        for (int i = 0; i < 5; i++) {
            strip.setPixelColor(redSlots[i],  strip.Color(0, 0, 0));
            strip.setPixelColor(blueSlots[i], strip.Color(0, 0, 255));
        }
        strip.show();
        buzz(80);
        delay(80);
    }

    // Final — all on steady
    strip.setPixelColor(WHITE_LED, strip.Color(255, 255, 255));
    for (int i = 0; i < 5; i++) {
        strip.setPixelColor(redSlots[i],  strip.Color(255, 0, 0));
        strip.setPixelColor(blueSlots[i], strip.Color(0, 0, 255));
    }
    strip.show();
    buzzPattern(3, 60, 40);

    // Force LCD on and scroll activity
    displayOn = true;
    lcd.backlight();
    showLCDScroll("Your activity:", pendingActivity);
    Serial.println("[LCD] Scrolling activity: " + pendingActivity);
}

// ── LED states ────────────────────────────────────────────
void setLEDs_empty() {
    for (int i = 0; i < LED_COUNT; i++)
        strip.setPixelColor(i, strip.Color(8, 8, 12));
    strip.show();
}

void setLEDs_userA() {
    strip.setPixelColor(WHITE_LED, strip.Color(255, 255, 255));
    for (int i = 0; i < 5; i++) {
        strip.setPixelColor(redSlots[i],  strip.Color(200, 0, 0));
        strip.setPixelColor(blueSlots[i], strip.Color(0, 0, 0));
    }
    strip.show();
}

void setLEDs_userB() {
    strip.setPixelColor(WHITE_LED, strip.Color(255, 255, 255));
    for (int i = 0; i < 5; i++) {
        strip.setPixelColor(redSlots[i],  strip.Color(200, 0, 0));
        strip.setPixelColor(blueSlots[i], strip.Color(0, 0, 200));
    }
    strip.show();
}

void animatePulse() {
    pulseStep += 0.05;
    int brightness = (int)(127 + 127 * sin(pulseStep));
    for (int i = 0; i < LED_COUNT; i++)
        strip.setPixelColor(i, strip.Color(brightness, brightness / 5, 0));
    strip.show();
}

void animateReadyPulse() {
    pulseStep += 0.05;
    uint8_t bright = (uint8_t)((sin(pulseStep) + 1.0) / 2.0 * 200);
    strip.setPixelColor(WHITE_LED, strip.Color(255, 255, 255));
    for (int i = 0; i < 5; i++) {
        strip.setPixelColor(redSlots[i],  strip.Color(bright, 0, 0));
        strip.setPixelColor(blueSlots[i], strip.Color(0, 0, bright));
    }
    strip.show();
}
