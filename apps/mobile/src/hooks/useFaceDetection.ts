import { useCallback } from 'react';
import { useFrameProcessor, Frame } from 'react-native-vision-camera';
import { scanFaces, Face } from 'react-native-vision-camera-face-detector';
import { runOnJS, useSharedValue } from 'react-native-worklets-core';

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

  // フレームスキップカウンター（cooldownMsを30fpsで換算）
  const skipFrames = Math.floor((cooldownMs / 1000) * 30);
  const frameCounter = useSharedValue(0);

  const frameProcessor = useFrameProcessor((frame: Frame) => {
    'worklet';

    if (!enabled) return;

    // フレームスキップ（cooldown実装）
    frameCounter.value++;
    if (frameCounter.value % skipFrames !== 0) return;

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
          runOnJS(onFacesDetected)(largeFaces);
        }
      }
    } catch (error) {
      console.error('[FaceDetection] Error scanning faces:', error);
    }
  }, [enabled, minFaceSize, skipFrames]);

  return frameProcessor;
}
