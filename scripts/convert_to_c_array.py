#!/usr/bin/env python3
"""
Convert TensorFlow Lite model to C array for Arduino deployment

Usage:
    python convert_to_c_array.py input.tflite output.h [--var-name model_data]
"""

import sys
import argparse
from pathlib import Path


def convert_to_c_array(input_file, output_file, var_name="model_data"):
    """
    Convert a binary file to a C array header file

    Args:
        input_file: Path to input .tflite file
        output_file: Path to output .h file
        var_name: Name for the C array variable
    """
    # Read binary data
    with open(input_file, 'rb') as f:
        data = f.read()

    # Calculate size
    size = len(data)
    size_kb = size / 1024

    print(f"Input file: {input_file}")
    print(f"Size: {size} bytes ({size_kb:.2f} KB)")

    # Generate C array
    c_array = []
    c_array.append(f"// Auto-generated from {Path(input_file).name}")
    c_array.append(f"// Model size: {size} bytes ({size_kb:.2f} KB)")
    c_array.append("")
    c_array.append(f"#ifndef {var_name.upper()}_H")
    c_array.append(f"#define {var_name.upper()}_H")
    c_array.append("")
    c_array.append(f"const unsigned char {var_name}[] = {{")

    # Format data in rows of 12 bytes
    bytes_per_row = 12
    for i in range(0, len(data), bytes_per_row):
        chunk = data[i:i+bytes_per_row]
        hex_values = ', '.join(f'0x{b:02x}' for b in chunk)
        c_array.append(f"  {hex_values},")

    # Remove trailing comma from last line
    c_array[-1] = c_array[-1].rstrip(',')

    c_array.append("};")
    c_array.append("")
    c_array.append(f"const int {var_name}_len = sizeof({var_name});")
    c_array.append("")
    c_array.append(f"#endif // {var_name.upper()}_H")

    # Write to output file
    output_content = '\n'.join(c_array) + '\n'

    with open(output_file, 'w') as f:
        f.write(output_content)

    print(f"Output file: {output_file}")
    print(f"Array name: {var_name}")
    print(f"Success! Model converted to C array")

    # Print memory estimate
    print("\n=== Memory Estimate ===")
    print(f"Flash usage (model): ~{size_kb:.2f} KB")

    # Estimate tensor arena based on model size
    estimated_arena = max(80, int(size_kb * 0.3))  # Rough estimate
    print(f"Estimated tensor arena: ~{estimated_arena} KB")
    print(f"Total estimated RAM: ~{estimated_arena + 80} KB")
    print("\nNote: Actual tensor arena size depends on model architecture.")
    print("You may need to adjust kTensorArenaSize in tinyml_inference.h")


def main():
    parser = argparse.ArgumentParser(
        description='Convert TensorFlow Lite model to C array for Arduino'
    )
    parser.add_argument(
        'input_file',
        type=str,
        help='Input .tflite file'
    )
    parser.add_argument(
        'output_file',
        type=str,
        help='Output .h file'
    )
    parser.add_argument(
        '--var-name',
        type=str,
        default='model_data',
        help='C array variable name (default: model_data)'
    )

    args = parser.parse_args()

    # Validate input file exists
    if not Path(args.input_file).exists():
        print(f"ERROR: Input file not found: {args.input_file}")
        sys.exit(1)

    # Validate input file extension
    if not args.input_file.endswith('.tflite'):
        print(f"WARNING: Input file doesn't have .tflite extension")
        response = input("Continue anyway? (y/n): ")
        if response.lower() != 'y':
            sys.exit(0)

    # Create output directory if needed
    output_dir = Path(args.output_file).parent
    if output_dir != Path('.'):
        output_dir.mkdir(parents=True, exist_ok=True)

    # Convert
    try:
        convert_to_c_array(args.input_file, args.output_file, args.var_name)
    except Exception as e:
        print(f"\nERROR: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
