/*
  TinyML Model Definition

  This file contains the TensorFlow Lite model data converted to a C array.
  Replace this with your own trained model.

  To convert your model:
  1. Train a model in TensorFlow/Keras
  2. Convert to TensorFlow Lite: model.tflite
  3. Convert to C array: xxd -i model.tflite > model_data.cc
  4. Copy the array data here
*/

#ifndef TINYML_MODEL_H
#define TINYML_MODEL_H

// This is a placeholder model array
// Replace with your actual model data after conversion
// Example person detection model would be ~300KB
const unsigned char person_detect_model_data[] = {
  // Model data goes here
  // For now, this is a minimal valid TFLite model header
  0x1c, 0x00, 0x00, 0x00, 0x54, 0x46, 0x4c, 0x33,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
};

const int person_detect_model_data_len = sizeof(person_detect_model_data);

// Model input/output specifications
#define MODEL_INPUT_WIDTH  96   // Common for MobileNet-based models
#define MODEL_INPUT_HEIGHT 96
#define MODEL_INPUT_CHANNELS 1  // Grayscale

// Model categories (example for person detection)
const char* model_categories[] = {
  "No Person",
  "Person Detected"
};

const int num_categories = 2;

// Confidence threshold for detection
#define DETECTION_THRESHOLD 0.7  // 70% confidence

#endif // TINYML_MODEL_H
