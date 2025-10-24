/*
  TinyML Inference Engine

  Handles TensorFlow Lite Micro inference for embedded ML on Portenta H7
*/

#ifndef TINYML_INFERENCE_H
#define TINYML_INFERENCE_H

#include <TensorFlowLite.h>
#include "tensorflow/lite/micro/all_ops_resolver.h"
#include "tensorflow/lite/micro/micro_error_reporter.h"
#include "tensorflow/lite/micro/micro_interpreter.h"
#include "tensorflow/lite/schema/schema_generated.h"
#include "tensorflow/lite/version.h"

#include "tinyml_model.h"

// TensorFlow Lite globals
namespace {
  tflite::ErrorReporter* error_reporter = nullptr;
  const tflite::Model* model = nullptr;
  tflite::MicroInterpreter* interpreter = nullptr;
  TfLiteTensor* input = nullptr;
  TfLiteTensor* output = nullptr;

  // Tensor arena for model operations
  // Adjust size based on your model (larger models need more memory)
  constexpr int kTensorArenaSize = 100 * 1024;  // 100KB - increase if needed
  uint8_t tensor_arena[kTensorArenaSize];
}

// Model state
bool model_initialized = false;
unsigned long last_inference_time = 0;
float last_inference_scores[10];  // Support up to 10 categories
int last_inference_category = -1;

/*
  Initialize the TensorFlow Lite Micro interpreter
*/
bool initTinyML() {
  Serial.println("Initializing TinyML...");

  // Set up error reporting
  static tflite::MicroErrorReporter micro_error_reporter;
  error_reporter = &micro_error_reporter;

  // Map the model into a usable data structure
  model = tflite::GetModel(person_detect_model_data);
  if (model->version() != TFLITE_SCHEMA_VERSION) {
    Serial.print("ERROR: Model version ");
    Serial.print(model->version());
    Serial.print(" doesn't match schema version ");
    Serial.println(TFLITE_SCHEMA_VERSION);
    return false;
  }

  // Pull in all operations (use MutableOpResolver for specific ops to save memory)
  static tflite::AllOpsResolver resolver;

  // Build interpreter
  static tflite::MicroInterpreter static_interpreter(
    model, resolver, tensor_arena, kTensorArenaSize, error_reporter
  );
  interpreter = &static_interpreter;

  // Allocate memory for model tensors
  TfLiteStatus allocate_status = interpreter->AllocateTensors();
  if (allocate_status != kTfLiteOk) {
    Serial.println("ERROR: AllocateTensors() failed");
    return false;
  }

  // Get pointers to input and output tensors
  input = interpreter->input(0);
  output = interpreter->output(0);

  // Verify input tensor dimensions
  if ((input->dims->size != 4) ||
      (input->dims->data[1] != MODEL_INPUT_HEIGHT) ||
      (input->dims->data[2] != MODEL_INPUT_WIDTH) ||
      (input->dims->data[3] != MODEL_INPUT_CHANNELS)) {
    Serial.println("ERROR: Input tensor dimensions don't match model requirements");
    Serial.print("Expected: 1 x ");
    Serial.print(MODEL_INPUT_HEIGHT);
    Serial.print(" x ");
    Serial.print(MODEL_INPUT_WIDTH);
    Serial.print(" x ");
    Serial.println(MODEL_INPUT_CHANNELS);
    return false;
  }

  Serial.println("TinyML initialized successfully!");
  Serial.print("Input shape: ");
  Serial.print(input->dims->data[1]);
  Serial.print(" x ");
  Serial.print(input->dims->data[2]);
  Serial.print(" x ");
  Serial.println(input->dims->data[3]);
  Serial.print("Tensor arena size: ");
  Serial.print(kTensorArenaSize);
  Serial.println(" bytes");

  model_initialized = true;
  return true;
}

/*
  Preprocess image for model input
  - Resize from camera resolution to model input size
  - Normalize pixel values (0-255 to 0-1 or -1 to 1 depending on model)
*/
void preprocessImage(uint8_t* grayscale_img, int img_width, int img_height) {
  // Simple nearest-neighbor downsampling
  float x_ratio = (float)img_width / MODEL_INPUT_WIDTH;
  float y_ratio = (float)img_height / MODEL_INPUT_HEIGHT;

  for (int y = 0; y < MODEL_INPUT_HEIGHT; y++) {
    for (int x = 0; x < MODEL_INPUT_WIDTH; x++) {
      int src_x = (int)(x * x_ratio);
      int src_y = (int)(y * y_ratio);
      int src_idx = src_y * img_width + src_x;
      int dst_idx = y * MODEL_INPUT_WIDTH + x;

      // Normalize to 0-1 range (adjust if your model expects -1 to 1)
      // For int8 quantized models, you may need different preprocessing
      if (input->type == kTfLiteFloat32) {
        input->data.f[dst_idx] = grayscale_img[src_idx] / 255.0f;
      } else if (input->type == kTfLiteInt8) {
        // For quantized models: scale to -128 to 127
        input->data.int8[dst_idx] = (int8_t)(grayscale_img[src_idx] - 128);
      } else {
        // Uint8 models
        input->data.uint8[dst_idx] = grayscale_img[src_idx];
      }
    }
  }
}

/*
  Run inference on preprocessed image
*/
bool runInference(uint8_t* grayscale_img, int img_width, int img_height) {
  if (!model_initialized) {
    Serial.println("ERROR: Model not initialized");
    return false;
  }

  unsigned long start_time = micros();

  // Preprocess image to model input format
  preprocessImage(grayscale_img, img_width, img_height);

  // Run inference
  TfLiteStatus invoke_status = interpreter->Invoke();
  if (invoke_status != kTfLiteOk) {
    Serial.println("ERROR: Invoke() failed");
    return false;
  }

  last_inference_time = micros() - start_time;

  // Process output
  // Output format depends on model, this assumes classification with softmax
  int max_idx = 0;
  float max_score = 0.0;

  // Copy scores (adapt based on your model's output)
  int num_outputs = output->dims->data[output->dims->size - 1];
  num_outputs = min(num_outputs, 10);  // Cap at array size

  for (int i = 0; i < num_outputs; i++) {
    float score;

    if (output->type == kTfLiteFloat32) {
      score = output->data.f[i];
    } else if (output->type == kTfLiteInt8) {
      // Dequantize int8 output
      score = (output->data.int8[i] - output->params.zero_point) * output->params.scale;
    } else {
      score = output->data.uint8[i] / 255.0;
    }

    last_inference_scores[i] = score;

    if (score > max_score) {
      max_score = score;
      max_idx = i;
    }
  }

  last_inference_category = max_idx;

  return true;
}

/*
  Print inference results to serial
*/
void printInferenceResults() {
  Serial.println("\n=== TinyML Inference Results ===");
  Serial.print("Inference time: ");
  Serial.print(last_inference_time / 1000.0);
  Serial.println(" ms");

  Serial.println("\nCategory scores:");
  int num_outputs = min(num_categories, 10);

  for (int i = 0; i < num_outputs; i++) {
    Serial.print("  ");
    if (i < num_categories) {
      Serial.print(model_categories[i]);
    } else {
      Serial.print("Category ");
      Serial.print(i);
    }
    Serial.print(": ");
    Serial.print(last_inference_scores[i] * 100.0);
    Serial.println("%");
  }

  Serial.print("\nPrediction: ");
  if (last_inference_category < num_categories) {
    Serial.println(model_categories[last_inference_category]);
  } else {
    Serial.print("Category ");
    Serial.println(last_inference_category);
  }
  Serial.print("Confidence: ");
  Serial.print(last_inference_scores[last_inference_category] * 100.0);
  Serial.println("%");

  // Check detection threshold
  if (last_inference_scores[last_inference_category] >= DETECTION_THRESHOLD) {
    Serial.println("*** DETECTION CONFIDENT ***");
  } else {
    Serial.println("(Low confidence - may be false positive)");
  }

  Serial.println("================================\n");
}

/*
  Get memory usage information
*/
void printMemoryUsage() {
  Serial.println("\n=== TinyML Memory Usage ===");
  Serial.print("Tensor arena size: ");
  Serial.print(kTensorArenaSize);
  Serial.println(" bytes");
  Serial.print("Arena used: ");
  Serial.print(interpreter->arena_used_bytes());
  Serial.println(" bytes");
  Serial.print("Available: ");
  Serial.print(kTensorArenaSize - interpreter->arena_used_bytes());
  Serial.println(" bytes");
  Serial.println("===========================\n");
}

#endif // TINYML_INFERENCE_H
