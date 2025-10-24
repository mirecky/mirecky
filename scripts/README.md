# TinyML Helper Scripts

This directory contains Python scripts to help you prepare and deploy TensorFlow models for the Portenta H7.

## Scripts Overview

### 1. convert_to_c_array.py

Converts a TensorFlow Lite (.tflite) model to a C array that can be embedded in Arduino sketches.

**Usage:**
```bash
python convert_to_c_array.py model.tflite output.h
```

**Options:**
- `--var-name`: Specify custom array variable name (default: model_data)

**Example:**
```bash
python convert_to_c_array.py person_detector.tflite model_data.h --var-name person_detect_model_data
```

### 2. train_example_model.py

Example training script that demonstrates how to create and train a TinyML-compatible model.

**Usage:**
```bash
python train_example_model.py
```

**Note:** This script uses dummy data. Replace the `load_dummy_data()` function with your actual dataset.

**Output:**
- `models/person_detector.h5` - Keras model
- `models/person_detector.tflite` - TensorFlow Lite model

## Setup

Install required Python packages:

```bash
pip install tensorflow numpy pillow scikit-learn
```

Or use a virtual environment:

```bash
python -m venv tinyml_env
source tinyml_env/bin/activate  # On Windows: tinyml_env\Scripts\activate
pip install tensorflow numpy pillow scikit-learn
```

## Workflow

### Complete Model Deployment Workflow

1. **Train your model** (or use pre-trained):
   ```bash
   python train_example_model.py
   ```

2. **Convert to C array**:
   ```bash
   python convert_to_c_array.py models/person_detector.tflite model_data.h
   ```

3. **Update Arduino sketch**:
   - Copy the array data from `model_data.h`
   - Paste into `PortentaVisionCV/tinyml_model.h`
   - Update `MODEL_INPUT_WIDTH`, `MODEL_INPUT_HEIGHT`, etc.

4. **Upload to Portenta H7**:
   - Uncomment `#define ENABLE_TINYML` in sketch
   - Upload via Arduino IDE
   - Test with command `5` in Serial Monitor

## Model Size Limits

- **Recommended**: < 500 KB
- **Maximum**: < 1 MB (depends on available flash)
- **Tensor arena**: Adjust `kTensorArenaSize` based on model needs

Use quantization to reduce model size:
```python
converter.optimizations = [tf.lite.Optimize.DEFAULT]
```

## Tips

### For Smallest Models
- Use depthwise separable convolutions
- Limit number of filters and layers
- Apply full INT8 quantization
- Prune unnecessary connections

### For Best Accuracy
- Use quantization-aware training
- Provide representative dataset during conversion
- Test preprocessing matches training pipeline
- Collect diverse training data

### For Fastest Inference
- Use smaller input sizes (64x64 vs 96x96)
- Reduce model complexity
- Use INT8 quantization (hardware accelerated)
- Optimize operations (use MutableOpResolver)

## Troubleshooting

### Model too large
- Apply quantization
- Reduce number of filters
- Use smaller input size
- Prune model

### Low accuracy after conversion
- Use quantization-aware training
- Provide representative dataset
- Check preprocessing pipeline
- Increase model capacity slightly

### Out of memory on device
- Increase `kTensorArenaSize`
- Or reduce model size
- Check arena usage with command `m`

## Resources

- [TensorFlow Lite for Microcontrollers](https://www.tensorflow.org/lite/microcontrollers)
- [Model Optimization](https://www.tensorflow.org/model_optimization)
- [TinyML Book](https://tinymlbook.com/)
- [Edge Impulse](https://edgeimpulse.com/)

## Examples

See `../TinyML_Guide.md` for detailed examples and tutorials.
