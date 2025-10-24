/*
  Camera abstraction header for Portenta Vision Shield

  This header provides a simplified interface to the camera,
  compatible with different camera libraries.
*/

#ifndef CAMERA_H
#define CAMERA_H

// Try to include the appropriate camera library
// The actual library depends on what's installed
#if __has_include("camera.h")
  // For newer Arduino_PortentaVision or similar
  #include <camera.h>
#elif __has_include("himax.h")
  // For Himax camera (older library)
  #include "himax.h"
  HM01B0 himax;
  #define Camera himax
#else
  #warning "No camera library found. Please install Arduino_PortentaVision"
#endif

// Camera resolution definitions (if not already defined)
#ifndef CAMERA_R320x240
  #define CAMERA_R320x240 1
  #define CAMERA_R640x480 2
  #define CAMERA_R160x120 3
#endif

// Pixel format definitions (if not already defined)
#ifndef CAMERA_RGB565
  #define CAMERA_RGB565 0
  #define CAMERA_GRAYSCALE 1
#endif

// Frame buffer class wrapper
class FrameBuffer {
  private:
    uint8_t* buffer;
    uint32_t buffer_size;

  public:
    FrameBuffer() : buffer(nullptr), buffer_size(0) {}

    void setBuffer(uint8_t* buf, uint32_t size) {
      buffer = buf;
      buffer_size = size;
    }

    uint8_t* getBuffer() {
      return buffer;
    }

    uint32_t getBufferSize() {
      return buffer_size;
    }
};

// Alternative camera interface for libraries that don't have one
#ifndef CAMERA_H_INCLUDED
class CameraClass {
  private:
    bool initialized;
    uint8_t* frame_buffer;
    uint32_t frame_size;

  public:
    CameraClass() : initialized(false), frame_buffer(nullptr), frame_size(0) {}

    bool begin(int resolution, int format, int fps) {
      // This is a placeholder - actual implementation depends on the library
      initialized = true;

      // Allocate frame buffer based on resolution
      switch(resolution) {
        case CAMERA_R160x120:
          frame_size = 160 * 120 * 2;  // RGB565 = 2 bytes per pixel
          break;
        case CAMERA_R320x240:
          frame_size = 320 * 240 * 2;
          break;
        case CAMERA_R640x480:
          frame_size = 640 * 480 * 2;
          break;
        default:
          frame_size = 320 * 240 * 2;
      }

      frame_buffer = (uint8_t*)malloc(frame_size);

      return frame_buffer != nullptr;
    }

    int grabFrame(FrameBuffer &fb, uint32_t timeout) {
      if (!initialized || frame_buffer == nullptr) {
        return -1;
      }

      fb.setBuffer(frame_buffer, frame_size);

      // Actual camera capture would happen here
      // For now, this is a placeholder

      return 0;  // Success
    }
};

// Create global Camera instance if not already defined
#ifndef Camera
  CameraClass Camera;
#endif
#endif

#endif // CAMERA_H
