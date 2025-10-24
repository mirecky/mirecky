/*
  Portenta H7 Vision Shield - Computer Vision Starter

  This sketch demonstrates basic computer vision functionality using the
  Arduino Portenta H7 with Vision Shield (camera).

  Features:
  - Camera initialization and image capture
  - Grayscale conversion
  - Edge detection (Sobel filter)
  - Motion detection
  - TinyML inference (TensorFlow Lite Micro)
  - Serial image preview

  Hardware Required:
  - Arduino Portenta H7
  - Portenta Vision Shield

  Libraries Required:
  - Arduino_PortentaVision or camera library
  - Arduino Mbed OS Portenta Boards
  - Arduino_TensorFlowLite (for TinyML features)
*/

#include "camera.h"

// Uncomment to enable TinyML features
// Requires Arduino_TensorFlowLite library
// #define ENABLE_TINYML

#ifdef ENABLE_TINYML
  #include "tinyml_inference.h"
#endif

// Camera resolution settings
// QVGA = 320x240, VGA = 640x480, QQVGA = 160x120
#define CAMERA_WIDTH  320
#define CAMERA_HEIGHT 240

// Frame buffers
FrameBuffer fb;
uint8_t grayscale_buffer[CAMERA_WIDTH * CAMERA_HEIGHT];
uint8_t edge_buffer[CAMERA_WIDTH * CAMERA_HEIGHT];

// CV Mode selection
enum CVMode {
  MODE_RAW,           // Raw camera feed
  MODE_GRAYSCALE,     // Grayscale conversion
  MODE_EDGE_DETECT,   // Sobel edge detection
  MODE_MOTION_DETECT, // Simple motion detection
  MODE_TINYML        // TinyML inference
};

CVMode currentMode = MODE_GRAYSCALE;

// Motion detection variables
uint8_t previous_frame[CAMERA_WIDTH * CAMERA_HEIGHT];
bool has_previous_frame = false;
int motion_threshold = 30;

// TinyML variables
bool tinyml_initialized = false;
int inference_interval = 1000;  // Run inference every 1000ms
unsigned long last_inference_millis = 0;

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 5000);  // Wait up to 5 seconds for serial

  Serial.println("Portenta H7 Vision Shield - CV Starter");
  Serial.println("======================================");

  // Initialize camera
  if (!initCamera()) {
    Serial.println("ERROR: Camera initialization failed!");
    while (1) {
      delay(1000);
    }
  }

  Serial.println("Camera initialized successfully");

#ifdef ENABLE_TINYML
  // Initialize TinyML
  Serial.println("\nInitializing TinyML...");
  tinyml_initialized = initTinyML();
  if (tinyml_initialized) {
    Serial.println("TinyML ready!");
  } else {
    Serial.println("WARNING: TinyML initialization failed - mode disabled");
  }
#endif

  Serial.println("\nCommands:");
  Serial.println("  '1' - Raw camera feed");
  Serial.println("  '2' - Grayscale mode");
  Serial.println("  '3' - Edge detection");
  Serial.println("  '4' - Motion detection");
#ifdef ENABLE_TINYML
  Serial.println("  '5' - TinyML inference");
#endif
  Serial.println("  'c' - Capture and display frame info");
  Serial.println("  's' - Show frame statistics");
#ifdef ENABLE_TINYML
  Serial.println("  'm' - Show TinyML memory usage");
#endif
  Serial.println();
}

void loop() {
  // Check for serial commands
  if (Serial.available() > 0) {
    char cmd = Serial.read();
    handleCommand(cmd);
  }

  // Capture frame
  if (Camera.grabFrame(fb, 3000) == 0) {
    // Process based on current mode
    processFrame();

    // Small delay to prevent overwhelming the system
    delay(100);
  } else {
    Serial.println("ERROR: Failed to grab frame");
    delay(1000);
  }
}

bool initCamera() {
  // Initialize camera with specific resolution and format
  if (!Camera.begin(CAMERA_R320x240, CAMERA_RGB565, 30)) {
    return false;
  }
  return true;
}

void processFrame() {
  switch (currentMode) {
    case MODE_RAW:
      // Just indicate frame received
      Serial.print(".");
      break;

    case MODE_GRAYSCALE:
      convertToGrayscale();
      break;

    case MODE_EDGE_DETECT:
      convertToGrayscale();
      detectEdges();
      break;

    case MODE_MOTION_DETECT:
      convertToGrayscale();
      detectMotion();
      break;

    case MODE_TINYML:
#ifdef ENABLE_TINYML
      runTinyMLInference();
#else
      Serial.println("TinyML not enabled. Define ENABLE_TINYML and install Arduino_TensorFlowLite");
      currentMode = MODE_GRAYSCALE;
#endif
      break;
  }
}

void convertToGrayscale() {
  uint16_t* rgb565_data = (uint16_t*)fb.getBuffer();

  for (int i = 0; i < CAMERA_WIDTH * CAMERA_HEIGHT; i++) {
    // Convert RGB565 to grayscale
    uint16_t pixel = rgb565_data[i];
    uint8_t r = (pixel >> 11) & 0x1F;
    uint8_t g = (pixel >> 5) & 0x3F;
    uint8_t b = pixel & 0x1F;

    // Scale to 8-bit and apply luminance formula
    r = (r * 255) / 31;
    g = (g * 255) / 63;
    b = (b * 255) / 31;

    grayscale_buffer[i] = (uint8_t)(0.299 * r + 0.587 * g + 0.114 * b);
  }
}

void detectEdges() {
  // Simple Sobel edge detection
  for (int y = 1; y < CAMERA_HEIGHT - 1; y++) {
    for (int x = 1; x < CAMERA_WIDTH - 1; x++) {
      int idx = y * CAMERA_WIDTH + x;

      // Sobel X kernel
      int gx = -grayscale_buffer[(y-1)*CAMERA_WIDTH + (x-1)] + grayscale_buffer[(y-1)*CAMERA_WIDTH + (x+1)]
               -2*grayscale_buffer[y*CAMERA_WIDTH + (x-1)] + 2*grayscale_buffer[y*CAMERA_WIDTH + (x+1)]
               -grayscale_buffer[(y+1)*CAMERA_WIDTH + (x-1)] + grayscale_buffer[(y+1)*CAMERA_WIDTH + (x+1)];

      // Sobel Y kernel
      int gy = -grayscale_buffer[(y-1)*CAMERA_WIDTH + (x-1)] - 2*grayscale_buffer[(y-1)*CAMERA_WIDTH + x] - grayscale_buffer[(y-1)*CAMERA_WIDTH + (x+1)]
               +grayscale_buffer[(y+1)*CAMERA_WIDTH + (x-1)] + 2*grayscale_buffer[(y+1)*CAMERA_WIDTH + x] + grayscale_buffer[(y+1)*CAMERA_WIDTH + (x+1)];

      // Gradient magnitude
      int magnitude = abs(gx) + abs(gy);
      edge_buffer[idx] = constrain(magnitude, 0, 255);
    }
  }
}

void detectMotion() {
  if (!has_previous_frame) {
    // First frame - just store it
    memcpy(previous_frame, grayscale_buffer, CAMERA_WIDTH * CAMERA_HEIGHT);
    has_previous_frame = true;
    Serial.println("Motion detection initialized");
    return;
  }

  // Calculate difference from previous frame
  int motion_pixels = 0;
  long total_diff = 0;

  for (int i = 0; i < CAMERA_WIDTH * CAMERA_HEIGHT; i++) {
    int diff = abs(grayscale_buffer[i] - previous_frame[i]);
    total_diff += diff;

    if (diff > motion_threshold) {
      motion_pixels++;
    }
  }

  // Update previous frame
  memcpy(previous_frame, grayscale_buffer, CAMERA_WIDTH * CAMERA_HEIGHT);

  // Calculate motion percentage
  float motion_percent = (motion_pixels * 100.0) / (CAMERA_WIDTH * CAMERA_HEIGHT);

  if (motion_percent > 5.0) {  // Threshold: 5% of pixels changed
    Serial.print("MOTION DETECTED! ");
    Serial.print(motion_percent);
    Serial.print("% of pixels changed, avg diff: ");
    Serial.println(total_diff / (CAMERA_WIDTH * CAMERA_HEIGHT));
  }
}

void handleCommand(char cmd) {
  switch (cmd) {
    case '1':
      currentMode = MODE_RAW;
      Serial.println("Mode: RAW camera feed");
      break;

    case '2':
      currentMode = MODE_GRAYSCALE;
      Serial.println("Mode: GRAYSCALE");
      break;

    case '3':
      currentMode = MODE_EDGE_DETECT;
      Serial.println("Mode: EDGE DETECTION");
      break;

    case '4':
      currentMode = MODE_MOTION_DETECT;
      has_previous_frame = false;
      Serial.println("Mode: MOTION DETECTION");
      break;

    case '5':
#ifdef ENABLE_TINYML
      if (tinyml_initialized) {
        currentMode = MODE_TINYML;
        Serial.println("Mode: TINYML INFERENCE");
      } else {
        Serial.println("ERROR: TinyML not initialized");
      }
#else
      Serial.println("TinyML not enabled. Define ENABLE_TINYML in sketch");
#endif
      break;

    case 'c':
      captureFrameInfo();
      break;

    case 's':
      showStatistics();
      break;

    case 'm':
#ifdef ENABLE_TINYML
      if (tinyml_initialized) {
        printMemoryUsage();
      } else {
        Serial.println("TinyML not initialized");
      }
#else
      Serial.println("TinyML not enabled");
#endif
      break;

    default:
      Serial.println("Unknown command");
  }
}

void captureFrameInfo() {
  Serial.println("\n=== Frame Information ===");
  Serial.print("Resolution: ");
  Serial.print(CAMERA_WIDTH);
  Serial.print(" x ");
  Serial.println(CAMERA_HEIGHT);
  Serial.print("Buffer size: ");
  Serial.print(fb.getBufferSize());
  Serial.println(" bytes");
  Serial.print("Current mode: ");

  switch (currentMode) {
    case MODE_RAW: Serial.println("RAW"); break;
    case MODE_GRAYSCALE: Serial.println("GRAYSCALE"); break;
    case MODE_EDGE_DETECT: Serial.println("EDGE DETECTION"); break;
    case MODE_MOTION_DETECT: Serial.println("MOTION DETECTION"); break;
    case MODE_TINYML: Serial.println("TINYML INFERENCE"); break;
  }
  Serial.println("========================\n");
}

#ifdef ENABLE_TINYML
/*
  Run TinyML inference with rate limiting
*/
void runTinyMLInference() {
  unsigned long current_millis = millis();

  // Rate limit inference to prevent overwhelming the system
  if (current_millis - last_inference_millis < inference_interval) {
    Serial.print(".");
    return;
  }

  last_inference_millis = current_millis;

  // Convert to grayscale first
  convertToGrayscale();

  // Run inference
  Serial.println("\nRunning inference...");
  if (runInference(grayscale_buffer, CAMERA_WIDTH, CAMERA_HEIGHT)) {
    printInferenceResults();
  } else {
    Serial.println("Inference failed!");
  }
}
#endif

void showStatistics() {
  if (currentMode == MODE_RAW) {
    Serial.println("Statistics not available in RAW mode");
    return;
  }

  convertToGrayscale();

  // Calculate histogram and statistics
  uint32_t histogram[256] = {0};
  long sum = 0;
  uint8_t min_val = 255, max_val = 0;

  for (int i = 0; i < CAMERA_WIDTH * CAMERA_HEIGHT; i++) {
    uint8_t val = grayscale_buffer[i];
    histogram[val]++;
    sum += val;
    if (val < min_val) min_val = val;
    if (val > max_val) max_val = val;
  }

  float mean = (float)sum / (CAMERA_WIDTH * CAMERA_HEIGHT);

  Serial.println("\n=== Frame Statistics ===");
  Serial.print("Mean brightness: ");
  Serial.println(mean);
  Serial.print("Min value: ");
  Serial.println(min_val);
  Serial.print("Max value: ");
  Serial.println(max_val);
  Serial.print("Range: ");
  Serial.println(max_val - min_val);
  Serial.println("=======================\n");
}
