import { useRef, useCallback } from 'react';
import { useFrameProcessor, Frame } from 'react-native-vision-camera';
import { scanFaces, Face } from 'vision-camera-face-detector';
import { runOnJS } from 'react-native-worklets-core';

interface FaceDetectionOptions {
  enabled: boolean;
  onFacesDetected: (faces: Face[]) => void;
  minFaceSize?: number;
  cooldownMs?: number;
}

/**
 * Custom hook for face detection using vision-camera frame processors
 *
 * @param options - Face detection configuration
 * @returns Frame processor for vision-camera
 */
export function useFaceDetection(options: FaceDetectionOptions) {
  const { enabled, onFacesDetected, minFaceSize = 20000, cooldownMs = 2000 } = options;
  const lastProcessTime = useRef(0);

  const frameProcessor = useFrameProcessor((frame: Frame) => {
    'worklet';

    if (!enabled) return;

    const now = Date.now();
    if (now - lastProcessTime.current < cooldownMs) return;

    try {
      const faces = scanFaces(frame, {
        performanceMode: 'fast',
        landmarkMode: 'none',
        contourMode: 'none',
        classificationMode: 'none',
      });

      if (faces.length > 0) {
        const largeFaces = faces.filter(face => {
          const faceSize = face.bounds.width * face.bounds.height;
          return faceSize > minFaceSize;
        });

        if (largeFaces.length > 0) {
          lastProcessTime.current = now;
          runOnJS(onFacesDetected)(largeFaces);
        }
      }
    } catch (error) {
      console.error('[FaceDetection] Error scanning faces:', error);
    }
  }, [enabled, minFaceSize, cooldownMs]);

  return frameProcessor;
}
