# Portenta H7 Vision Shield - Computer Vision Starter Project

A beginner-friendly computer vision project for the Arduino Portenta H7 with Vision Shield. This project demonstrates basic CV operations including grayscale conversion, edge detection, and motion detection.

## Hardware Requirements

- **Arduino Portenta H7** (H7 or H7 Lite)
- **Portenta Vision Shield** (with camera module)
- USB-C cable for programming and power

## Software Requirements

### Arduino IDE Setup

1. **Install Arduino IDE** (version 1.8.19 or later, or Arduino IDE 2.x)
   - Download from: https://www.arduino.cc/en/software

2. **Install Board Support Package**
   ```
   Tools > Board > Boards Manager
   Search for: "Arduino Mbed OS Portenta Boards"
   Install the latest version
   ```

3. **Install Required Libraries**
   - Open: Tools > Manage Libraries
   - Search and install:
     - `Arduino_PortentaVision` or `Himax` (camera library)
     - May vary depending on your Vision Shield version

4. **Select Board**
   ```
   Tools > Board > Arduino Mbed OS Portenta Boards > Arduino Portenta H7 (M7 core)
   ```

## Project Structure

```
PortentaVisionCV/
├── PortentaVisionCV.ino    # Main sketch with CV algorithms
└── camera.h                 # Camera abstraction layer
```

## Features

### 1. Raw Camera Feed
- Direct camera frame capture
- Minimal processing
- Good for testing camera functionality

### 2. Grayscale Conversion
- Converts RGB565 color images to 8-bit grayscale
- Uses standard luminance formula: `Y = 0.299*R + 0.587*G + 0.114*B`
- Foundation for other CV operations

### 3. Edge Detection
- Sobel operator for edge detection
- Detects horizontal and vertical edges
- Useful for object boundary detection

### 4. Motion Detection
- Frame difference algorithm
- Detects moving objects by comparing consecutive frames
- Adjustable sensitivity threshold

## Usage

### Upload the Sketch

1. Connect your Portenta H7 (with Vision Shield attached)
2. Open `PortentaVisionCV/PortentaVisionCV.ino`
3. Select the correct port: `Tools > Port`
4. Click Upload button

### Serial Monitor Commands

Open Serial Monitor at **115200 baud** and use these commands:

| Command | Function |
|---------|----------|
| `1` | Switch to RAW camera feed mode |
| `2` | Switch to GRAYSCALE mode |
| `3` | Switch to EDGE DETECTION mode |
| `4` | Switch to MOTION DETECTION mode |
| `c` | Capture and display current frame info |
| `s` | Show frame statistics (brightness, range, etc.) |

### Example Session

```
Portenta H7 Vision Shield - CV Starter
======================================
Camera initialized successfully

Commands:
  '1' - Raw camera feed
  '2' - Grayscale mode
  '3' - Edge detection
  '4' - Motion detection
  'c' - Capture and display frame info
  's' - Show frame statistics

> 2
Mode: GRAYSCALE

> s
=== Frame Statistics ===
Mean brightness: 127.3
Min value: 12
Max value: 241
Range: 229
=======================

> 4
Mode: MOTION DETECTION
Motion detection initialized
MOTION DETECTED! 8.2% of pixels changed, avg diff: 15
```

## Configuration

### Change Camera Resolution

Edit in `PortentaVisionCV.ino`:

```cpp
#define CAMERA_WIDTH  320  // Options: 160, 320, 640
#define CAMERA_HEIGHT 240  // Options: 120, 240, 480
```

Available resolutions:
- **QQVGA**: 160x120 (fastest, lowest quality)
- **QVGA**: 320x240 (recommended for most CV tasks)
- **VGA**: 640x480 (highest quality, slower processing)

### Adjust Motion Detection Sensitivity

Edit in `PortentaVisionCV.ino`:

```cpp
int motion_threshold = 30;  // Lower = more sensitive
```

Change the percentage threshold:
```cpp
if (motion_percent > 5.0) {  // Adjust this value
```

## Computer Vision Concepts

### Grayscale Conversion
Reduces color images to brightness-only, simplifying many CV algorithms and reducing memory usage by 3x.

### Edge Detection (Sobel)
The Sobel operator uses two 3x3 kernels to detect edges:
- Horizontal edges (Gx kernel)
- Vertical edges (Gy kernel)
- Combined magnitude shows edge strength

### Motion Detection
Compares consecutive frames to detect changes:
1. Convert frame to grayscale
2. Calculate absolute difference from previous frame
3. Count pixels exceeding threshold
4. Report if motion percentage exceeds limit

## Extending This Project

### Ideas for Enhancement

1. **Color Blob Tracking**
   - Detect objects by color (red ball, blue marker, etc.)
   - Track object position across frames

2. **Face Detection**
   - Integrate Haar cascade or simple skin-tone detection
   - Track face position

3. **QR Code / Barcode Reading**
   - Use ZXing or similar library
   - Decode data from camera

4. **TinyML Integration**
   - Deploy TensorFlow Lite models
   - Object classification or detection

5. **Line Following**
   - Detect lines in grayscale images
   - Calculate robot steering angles

6. **Gesture Recognition**
   - Combine motion detection with pattern recognition
   - Control devices with hand gestures

## Troubleshooting

### Camera Initialization Failed
- Check Vision Shield is properly seated
- Verify correct board selection (M7 core)
- Try power cycling the board

### Compilation Errors
- Make sure `Arduino_PortentaVision` library is installed
- Update to latest board package version
- Check that both `.ino` and `.h` files are in the same folder

### Slow Performance
- Reduce resolution to 160x120
- Increase delay in main loop
- Disable serial printing in processing functions

### No Serial Output
- Check baud rate is 115200
- Try pressing reset button on board
- Verify USB cable supports data (not charge-only)

## Performance Notes

Processing times (approximate, at 320x240):
- **Grayscale conversion**: ~5ms
- **Edge detection**: ~30ms
- **Motion detection**: ~15ms

The main loop includes a 100ms delay to prevent overwhelming the processor. Adjust based on your needs.

## Resources

- [Portenta H7 Documentation](https://docs.arduino.cc/hardware/portenta-h7)
- [Vision Shield Documentation](https://docs.arduino.cc/hardware/portenta-vision-shield)
- [OpenMV Documentation](https://docs.openmv.io/) - Alternative firmware with more CV features
- [Computer Vision Fundamentals](https://opencv.org/)

## License

This project is open source and available for educational and commercial use.

## Contributing

Feel free to fork, modify, and submit pull requests with improvements!

## Author

Created for Arduino Portenta H7 Vision Shield beginners.
