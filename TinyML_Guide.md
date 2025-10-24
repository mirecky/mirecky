# TinyML Guide for Portenta H7 Vision Shield

This guide explains how to deploy custom TensorFlow Lite models on the Arduino Portenta H7 for on-device machine learning inference.

## Table of Contents

1. [What is TinyML?](#what-is-tinyml)
2. [Setup Requirements](#setup-requirements)
3. [Enabling TinyML Features](#enabling-tinyml-features)
4. [Creating Your Model](#creating-your-model)
5. [Converting Models to TFLite](#converting-models-to-tflite)
6. [Deploying Your Model](#deploying-your-model)
7. [Model Examples](#model-examples)
8. [Troubleshooting](#troubleshooting)

## What is TinyML?

TinyML (Tiny Machine Learning) enables machine learning inference on microcontrollers with limited resources. The Portenta H7 has:
- **480 MHz Dual-core ARM Cortex-M7 & M4**
- **8 MB SDRAM** for models and data
- **2 MB Flash** for program storage
- **Hardware acceleration** for some operations

This is enough to run small neural networks for tasks like:
- Image classification (identifying objects)
- Person detection (presence/absence)
- Gesture recognition
- Keyword spotting (audio)
- Anomaly detection

## Setup Requirements

### Arduino Libraries

Install via Arduino Library Manager (Tools > Manage Libraries):

1. **Arduino_TensorFlowLite** (required)
   - TensorFlow Lite Micro runtime
   - Version 2.4.0 or later recommended

2. **Arduino_PortentaVision** (already installed)
   - Camera interface

### Python Environment (for model training/conversion)

```bash
# Create virtual environment
python -m venv tinyml_env
source tinyml_env/bin/activate  # On Windows: tinyml_env\Scripts\activate

# Install required packages
pip install tensorflow
pip install pillow numpy matplotlib
```

## Enabling TinyML Features

### Step 1: Uncomment the ENABLE_TINYML define

In `PortentaVisionCV.ino`, change line 29:

```cpp
// FROM:
// #define ENABLE_TINYML

// TO:
#define ENABLE_TINYML
```

### Step 2: Upload the Sketch

Upload to your Portenta H7. The Serial Monitor should show:

```
Portenta H7 Vision Shield - CV Starter
======================================
Camera initialized successfully

Initializing TinyML...
TinyML initialized successfully!
Input shape: 96 x 96 x 1
Tensor arena size: 102400 bytes
TinyML ready!

Commands:
  '1' - Raw camera feed
  '2' - Grayscale mode
  '3' - Edge detection
  '4' - Motion detection
  '5' - TinyML inference
  'c' - Capture and display frame info
  's' - Show frame statistics
  'm' - Show TinyML memory usage
```

### Step 3: Test TinyML Mode

Type `5` in Serial Monitor to switch to TinyML inference mode.

## Creating Your Model

### Model Constraints

The Portenta H7 has limited resources, so models must be small:

| Resource | Typical Limit | Recommended |
|----------|---------------|-------------|
| Model size | < 1 MB | < 500 KB |
| Tensor arena | < 500 KB | < 200 KB |
| Inference time | < 1000 ms | < 200 ms |
| Input size | Variable | 96x96 or smaller |

### Example: Person Detection Model

```python
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers

# Define a simple CNN for person detection
def create_person_detector():
    model = keras.Sequential([
        # Input: 96x96x1 grayscale image
        layers.Input(shape=(96, 96, 1)),

        # Conv block 1
        layers.Conv2D(16, (3, 3), activation='relu', padding='same'),
        layers.MaxPooling2D((2, 2)),

        # Conv block 2
        layers.Conv2D(32, (3, 3), activation='relu', padding='same'),
        layers.MaxPooling2D((2, 2)),

        # Conv block 3
        layers.Conv2D(64, (3, 3), activation='relu', padding='same'),
        layers.MaxPooling2D((2, 2)),

        # Dense layers
        layers.Flatten(),
        layers.Dense(64, activation='relu'),
        layers.Dropout(0.5),
        layers.Dense(2, activation='softmax')  # 2 classes: person, no person
    ])

    return model

# Create and compile
model = create_person_detector()
model.compile(
    optimizer='adam',
    loss='categorical_crossentropy',
    metrics=['accuracy']
)

model.summary()
```

### Training Tips

1. **Use small input sizes**: 96x96 or 64x64 is ideal
2. **Limit model depth**: 3-5 conv layers maximum
3. **Use depthwise separable convolutions**: More efficient
4. **Quantization-aware training**: Better accuracy after quantization
5. **Data augmentation**: Improve generalization with limited data

### Example Training Script

```python
# train_model.py
import tensorflow as tf
import numpy as np
from sklearn.model_selection import train_test_split

# Load your dataset
# X_train: images (N, 96, 96, 1), y_train: labels (N, 2)
X_train, y_train = load_your_data()

# Split data
X_train, X_val, y_train, y_val = train_test_split(
    X_train, y_train, test_size=0.2, random_state=42
)

# Create model
model = create_person_detector()

# Train
history = model.fit(
    X_train, y_train,
    batch_size=32,
    epochs=20,
    validation_data=(X_val, y_val),
    callbacks=[
        tf.keras.callbacks.EarlyStopping(patience=5, restore_best_weights=True),
        tf.keras.callbacks.ReduceLROnPlateau(factor=0.5, patience=3)
    ]
)

# Save model
model.save('person_detector.h5')
print("Model saved!")
```

## Converting Models to TFLite

### Step 1: Convert to TensorFlow Lite

```python
# convert_to_tflite.py
import tensorflow as tf

# Load your trained model
model = tf.keras.models.load_model('person_detector.h5')

# Convert to TFLite with quantization
converter = tf.lite.TFLiteConverter.from_keras_model(model)

# Enable optimizations
converter.optimizations = [tf.lite.Optimize.DEFAULT]

# Optional: Full integer quantization for smallest size
# Requires representative dataset
def representative_dataset():
    for i in range(100):
        # Provide sample input data
        data = np.random.rand(1, 96, 96, 1).astype(np.float32)
        yield [data]

converter.representative_dataset = representative_dataset
converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
converter.inference_input_type = tf.int8
converter.inference_output_type = tf.int8

# Convert
tflite_model = converter.convert()

# Save
with open('person_detector.tflite', 'wb') as f:
    f.write(tflite_model)

print(f"Model size: {len(tflite_model) / 1024:.2f} KB")
```

### Step 2: Convert to C Array

Use the provided script or xxd command:

```bash
# Using xxd (Linux/Mac)
xxd -i person_detector.tflite > model_data.cc

# Or use the Python script (cross-platform)
python convert_to_c_array.py person_detector.tflite model_data.h
```

### Step 3: Replace Model Data

Copy the array from `model_data.h` into `tinyml_model.h`:

```cpp
// tinyml_model.h
const unsigned char person_detect_model_data[] = {
  // Paste your model data here
  0x1c, 0x00, 0x00, 0x00, 0x54, 0x46, 0x4c, 0x33,
  // ... rest of model data ...
};

const int person_detect_model_data_len = sizeof(person_detect_model_data);
```

### Step 4: Update Model Metadata

Update the model specifications in `tinyml_model.h`:

```cpp
// Model input size (must match your model)
#define MODEL_INPUT_WIDTH  96
#define MODEL_INPUT_HEIGHT 96
#define MODEL_INPUT_CHANNELS 1  // 1 for grayscale, 3 for RGB

// Model output categories
const char* model_categories[] = {
  "No Person",
  "Person Detected"
};

const int num_categories = 2;

// Detection threshold
#define DETECTION_THRESHOLD 0.7  // Adjust based on your model
```

## Deploying Your Model

### Memory Optimization

If your model is too large, adjust the tensor arena size in `tinyml_inference.h`:

```cpp
// Increase if you get allocation errors
constexpr int kTensorArenaSize = 150 * 1024;  // 150KB

// Or decrease to save RAM
constexpr int kTensorArenaSize = 80 * 1024;   // 80KB
```

Check actual usage with command `m` in Serial Monitor:

```
=== TinyML Memory Usage ===
Tensor arena size: 102400 bytes
Arena used: 78542 bytes
Available: 23858 bytes
===========================
```

### Performance Tuning

Adjust inference rate in `PortentaVisionCV.ino`:

```cpp
// Run inference every N milliseconds
int inference_interval = 1000;  // 1 second (default)
int inference_interval = 500;   // 0.5 seconds (faster)
int inference_interval = 2000;  // 2 seconds (slower, saves power)
```

## Model Examples

### 1. Person Detection

**Use Case**: Detect if a person is in the camera view

**Model**: MobileNetV1 or custom CNN
- Input: 96x96 grayscale
- Output: 2 classes (person/no person)
- Size: ~300 KB

**Training Data**:
- COCO dataset (person class)
- MS-COCO Person Keypoints
- Custom images

### 2. Gesture Recognition

**Use Case**: Recognize hand gestures (rock, paper, scissors, etc.)

**Model**: Small CNN
- Input: 64x64 grayscale
- Output: N gesture classes
- Size: ~100 KB

### 3. Object Classification

**Use Case**: Classify common objects (cup, phone, keyboard, etc.)

**Model**: MobileNetV2 (pruned)
- Input: 96x96 RGB (requires modification to code)
- Output: 10-20 object classes
- Size: ~500 KB

### 4. Face Detection

**Use Case**: Detect presence of faces

**Model**: MTCNN or custom lightweight detector
- Input: 96x96 grayscale
- Output: Face/no face
- Size: ~200 KB

### Pre-trained Models

Check these resources for pre-trained TinyML models:

- **TensorFlow Lite Model Garden**: https://www.tensorflow.org/lite/models
- **Edge Impulse**: https://www.edgeimpulse.com/ (no-code ML platform)
- **TensorFlow Hub**: https://tfhub.dev/
- **Arduino ML Library Examples**: Included with Arduino_TensorFlowLite

## Troubleshooting

### "AllocateTensors() failed"

**Cause**: Tensor arena too small

**Solution**: Increase `kTensorArenaSize` in `tinyml_inference.h`:
```cpp
constexpr int kTensorArenaSize = 150 * 1024;  // Try larger value
```

### "Input tensor dimensions don't match"

**Cause**: Model input size doesn't match `MODEL_INPUT_WIDTH/HEIGHT`

**Solution**: Update definitions in `tinyml_model.h` to match your model:
```cpp
#define MODEL_INPUT_WIDTH  64   // Match your model
#define MODEL_INPUT_HEIGHT 64
```

### "Model version doesn't match schema version"

**Cause**: TFLite model version incompatible with library

**Solution**:
1. Update Arduino_TensorFlowLite library
2. Or re-convert model with compatible TensorFlow version

### Inference is very slow (>1 second)

**Causes**:
- Model too large/complex
- Not using quantization
- Camera resolution too high

**Solutions**:
1. Use quantized INT8 model instead of float32
2. Reduce model complexity (fewer layers, smaller filters)
3. Use smaller input size (64x64 instead of 96x96)

### Out of memory during compilation

**Cause**: Model data array is too large for flash

**Solution**:
1. Reduce model size through pruning/quantization
2. Use external flash storage (advanced)
3. Simplify model architecture

### Low accuracy after deployment

**Causes**:
- Quantization loss
- Different preprocessing on device vs training
- Poor model generalization

**Solutions**:
1. Use quantization-aware training
2. Test preprocessing pipeline matches training
3. Collect more diverse training data
4. Adjust DETECTION_THRESHOLD

## Advanced Topics

### Using MutableOpResolver (Reduce Flash Usage)

Instead of `AllOpsResolver`, specify only needed operations:

```cpp
// In tinyml_inference.h
static tflite::MicroMutableOpResolver<5> resolver;
resolver.AddConv2D();
resolver.AddMaxPool2D();
resolver.AddFullyConnected();
resolver.AddReshape();
resolver.AddSoftmax();
```

### Custom Preprocessing

Modify `preprocessImage()` in `tinyml_inference.h` for your model's needs:

```cpp
// Example: Normalize to -1 to 1 instead of 0 to 1
input->data.f[dst_idx] = (grayscale_img[src_idx] / 127.5f) - 1.0f;
```

### Post-processing

Add custom logic after inference in `runTinyMLInference()`:

```cpp
if (last_inference_category == 1 && last_inference_scores[1] > 0.9) {
  // Trigger action for high-confidence person detection
  digitalWrite(LED_BUILTIN, HIGH);
}
```

## Resources

- **TensorFlow Lite for Microcontrollers**: https://www.tensorflow.org/lite/microcontrollers
- **TinyML Book**: "TinyML: Machine Learning with TensorFlow Lite on Arduino and Ultra-Low-Power Microcontrollers"
- **Edge Impulse**: https://edgeimpulse.com (visual ML training platform)
- **Portenta H7 Docs**: https://docs.arduino.cc/hardware/portenta-h7
- **TensorFlow Model Optimization**: https://www.tensorflow.org/model_optimization

## Example Workflow Summary

1. **Collect/prepare training data**
2. **Train model in TensorFlow/Keras** (keep it small!)
3. **Convert to TensorFlow Lite** with quantization
4. **Convert to C array** using xxd or script
5. **Update `tinyml_model.h`** with model data and metadata
6. **Adjust tensor arena size** if needed
7. **Upload sketch** with `ENABLE_TINYML` defined
8. **Test and iterate** on performance

Good luck with your TinyML projects!
