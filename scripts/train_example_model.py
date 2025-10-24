#!/usr/bin/env python3
"""
Example script to train a simple person detection model for TinyML

This creates a basic model architecture suitable for deployment on
Arduino Portenta H7. Replace the dataset loading with your own data.

Requirements:
    pip install tensorflow numpy pillow scikit-learn
"""

import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
import numpy as np
from pathlib import Path


def create_model(input_shape=(96, 96, 1), num_classes=2):
    """
    Create a lightweight CNN for person detection

    Args:
        input_shape: Input image shape (height, width, channels)
        num_classes: Number of output classes

    Returns:
        Compiled Keras model
    """
    model = keras.Sequential([
        # Input layer
        layers.Input(shape=input_shape),

        # Conv block 1
        layers.Conv2D(16, (3, 3), activation='relu', padding='same'),
        layers.MaxPooling2D((2, 2)),
        layers.Dropout(0.1),

        # Conv block 2
        layers.Conv2D(32, (3, 3), activation='relu', padding='same'),
        layers.MaxPooling2D((2, 2)),
        layers.Dropout(0.1),

        # Conv block 3
        layers.Conv2D(64, (3, 3), activation='relu', padding='same'),
        layers.MaxPooling2D((2, 2)),
        layers.Dropout(0.2),

        # Dense layers
        layers.Flatten(),
        layers.Dense(64, activation='relu'),
        layers.Dropout(0.5),
        layers.Dense(num_classes, activation='softmax')
    ])

    return model


def load_dummy_data(num_samples=1000, input_shape=(96, 96, 1)):
    """
    Generate dummy data for testing
    Replace this with your actual dataset loading

    Args:
        num_samples: Number of samples to generate
        input_shape: Shape of input images

    Returns:
        X_train, y_train, X_val, y_val
    """
    print("Generating dummy data...")
    print("IMPORTANT: Replace this with your actual dataset!")

    # Generate random images
    X = np.random.rand(num_samples, *input_shape).astype(np.float32)

    # Generate random labels (50/50 split)
    y = np.random.randint(0, 2, num_samples)
    y = keras.utils.to_categorical(y, 2)

    # Split into train/val
    split = int(0.8 * num_samples)
    X_train, X_val = X[:split], X[split:]
    y_train, y_val = y[:split], y[split:]

    return X_train, y_train, X_val, y_val


def train_model(model, X_train, y_train, X_val, y_val, epochs=20):
    """
    Train the model with callbacks

    Args:
        model: Keras model
        X_train, y_train: Training data
        X_val, y_val: Validation data
        epochs: Number of training epochs

    Returns:
        Training history
    """
    model.compile(
        optimizer='adam',
        loss='categorical_crossentropy',
        metrics=['accuracy']
    )

    callbacks = [
        keras.callbacks.EarlyStopping(
            monitor='val_loss',
            patience=5,
            restore_best_weights=True
        ),
        keras.callbacks.ReduceLROnPlateau(
            monitor='val_loss',
            factor=0.5,
            patience=3,
            min_lr=1e-6
        ),
        keras.callbacks.ModelCheckpoint(
            'best_model.h5',
            monitor='val_accuracy',
            save_best_only=True
        )
    ]

    history = model.fit(
        X_train, y_train,
        batch_size=32,
        epochs=epochs,
        validation_data=(X_val, y_val),
        callbacks=callbacks,
        verbose=1
    )

    return history


def convert_to_tflite(model_path, output_path='model.tflite', quantize=True):
    """
    Convert Keras model to TensorFlow Lite

    Args:
        model_path: Path to .h5 model file
        output_path: Output .tflite file path
        quantize: Whether to apply quantization
    """
    print(f"\nConverting {model_path} to TensorFlow Lite...")

    # Load model
    model = keras.models.load_model(model_path)

    # Create converter
    converter = tf.lite.TFLiteConverter.from_keras_model(model)

    if quantize:
        print("Applying quantization...")
        converter.optimizations = [tf.lite.Optimize.DEFAULT]

        # For full integer quantization, you would need a representative dataset
        # Uncomment and modify this if you want INT8 quantization:
        """
        def representative_dataset():
            for i in range(100):
                # Provide sample input data from your dataset
                data = np.random.rand(1, 96, 96, 1).astype(np.float32)
                yield [data]

        converter.representative_dataset = representative_dataset
        converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
        converter.inference_input_type = tf.int8
        converter.inference_output_type = tf.int8
        """

    # Convert
    tflite_model = converter.convert()

    # Save
    with open(output_path, 'wb') as f:
        f.write(tflite_model)

    size_kb = len(tflite_model) / 1024
    print(f"Model saved to {output_path}")
    print(f"Model size: {size_kb:.2f} KB")

    if size_kb > 500:
        print("WARNING: Model is large (>500 KB). Consider reducing size.")
    elif size_kb > 1000:
        print("ERROR: Model is too large (>1 MB) for Portenta H7!")

    return output_path


def main():
    print("=" * 60)
    print("TinyML Model Training Script")
    print("=" * 60)

    # Configuration
    INPUT_SHAPE = (96, 96, 1)  # 96x96 grayscale
    NUM_CLASSES = 2            # Binary classification
    EPOCHS = 20

    # Create output directory
    output_dir = Path('models')
    output_dir.mkdir(exist_ok=True)

    # Load data (replace with your own dataset)
    print("\nStep 1: Loading data...")
    X_train, y_train, X_val, y_val = load_dummy_data(
        num_samples=1000,
        input_shape=INPUT_SHAPE
    )
    print(f"Training samples: {len(X_train)}")
    print(f"Validation samples: {len(X_val)}")

    # Create model
    print("\nStep 2: Creating model...")
    model = create_model(INPUT_SHAPE, NUM_CLASSES)
    model.summary()

    # Train model
    print("\nStep 3: Training model...")
    print("Note: With dummy data, accuracy will be ~50% (random)")
    history = train_model(model, X_train, y_train, X_val, y_val, epochs=EPOCHS)

    # Save model
    model_path = output_dir / 'person_detector.h5'
    model.save(model_path)
    print(f"\nModel saved to {model_path}")

    # Convert to TFLite
    print("\nStep 4: Converting to TensorFlow Lite...")
    tflite_path = output_dir / 'person_detector.tflite'
    convert_to_tflite(model_path, tflite_path, quantize=True)

    print("\n" + "=" * 60)
    print("Training complete!")
    print("=" * 60)
    print("\nNext steps:")
    print("1. Convert to C array:")
    print(f"   python convert_to_c_array.py {tflite_path} model_data.h")
    print("2. Copy array data to tinyml_model.h")
    print("3. Update MODEL_INPUT_WIDTH/HEIGHT if needed")
    print("4. Upload sketch to Portenta H7")
    print("\nIMPORTANT: Replace dummy data with real training data!")


if __name__ == '__main__':
    main()
