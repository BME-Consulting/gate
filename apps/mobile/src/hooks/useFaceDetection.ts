import { useCallback } from 'react';
import { useFrameProcessor, Frame } from 'react-native-vision-camera';
import { useFaceDetector, Face, FaceDetectionOptions as LibraryFaceDetectionOptions } from 'react-native-vision-camera-face-detector';
import { useSharedValue, useRunOnJS } from 'react-native-worklets-core';

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

  // Use the plugin from the library
  const faceDetectorPlugin = useFaceDetector({
    performanceMode: 'fast',
    landmarkMode: 'none',
    contourMode: 'none',
    classificationMode: 'none',
  });

  // フレームスキップカウンター（cooldownMsを30fpsで換算）
  const skipFrames = Math.floor((cooldownMs / 1000) * 30);
  const frameCounter = useSharedValue(0);

  // Create a worklet-safe callback to run on JS thread
  const handleFacesOnJS = useRunOnJS((faces: Face[]) => {
    onFacesDetected(faces);
  }, [onFacesDetected]);

  const frameProcessor = useFrameProcessor((frame: Frame) => {
    'worklet';

    if (!enabled) return;

    // フレームスキップ（cooldown実装）
    frameCounter.value++;
    if (frameCounter.value % skipFrames !== 0) return;

    try {
      const faces = faceDetectorPlugin.detectFaces(frame);

      if (faces.length > 0) {
        const largeFaces = faces.filter((face: Face) => {
          const faceSize = face.bounds.width * face.bounds.height;
          return faceSize > minFaceSize;
        });

        if (largeFaces.length > 0) {
          handleFacesOnJS(largeFaces);
        }
      }
    } catch (error) {
      console.error('[FaceDetection] Error scanning faces:', error);
    }
  }, [enabled, minFaceSize, skipFrames, faceDetectorPlugin, handleFacesOnJS]);

  return frameProcessor;
}
