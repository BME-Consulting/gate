#!/usr/bin/env python3
import subprocess
import os

# Set environment variables
env = os.environ.copy()
env['EXPO_TOKEN'] = 'r3kIBuCA-RDE1_KYFJKcsEIaMi-t2TThCKIOPgBu'

# Run eas update:configure with auto-confirmation
process = subprocess.Popen(
    ['npx', 'eas-cli', 'update:configure'],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    env=env,
    text=True
)

# Send 'y' for any confirmation prompts
output, _ = process.communicate(input='y\n')
print(output)
print(f"Exit code: {process.returncode}")
