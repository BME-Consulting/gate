import { useEffect, useMemo, useCallback } from 'react';
import { useFrameProcessor, Frame } from 'react-native-vision-camera';
import { useFaceDetector, Face } from 'react-native-vision-camera-face-detector';
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

  // Use the plugin from the library - memoize to prevent re-initialization
  const faceDetectorPlugin = useMemo(() => useFaceDetector({
    performanceMode: 'fast',
    landmarkMode: 'none',
    contourMode: 'none',
    classificationMode: 'none',
  }), []);

  // フレームスキップカウンター（cooldownMsを30fpsで換算）
  const skipFrames = useMemo(() => Math.floor((cooldownMs / 1000) * 30), [cooldownMs]);
  const frameCounter = useSharedValue(0);
  const isProcessing = useSharedValue(false);

  // Wrap the callback with useRunOnJS to make it callable from worklet
  const handleFacesCallback = useRunOnJS((faces: Face[]) => {
    onFacesDetected(faces);
  }, [onFacesDetected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Reset shared values on unmount
      frameCounter.value = 0;
      isProcessing.value = false;
    };
  }, [frameCounter, isProcessing]);

  const frameProcessor = useFrameProcessor((frame: Frame) => {
    'worklet';

    if (!enabled || isProcessing.value) return;

    // フレームスキップ（cooldown実装）
    frameCounter.value++;
    if (frameCounter.value % skipFrames !== 0) return;

    try {
      isProcessing.value = true;
      const faces = faceDetectorPlugin.detectFaces(frame);

      // Guard against undefined/null results
      if (!faces || !Array.isArray(faces)) {
        console.warn('[FaceDetection] detectFaces returned invalid result:', faces);
        return;
      }

      if (faces.length > 0) {
        const largeFaces = faces.filter((face: Face) => {
          const faceSize = face.bounds.width * face.bounds.height;
          return faceSize > minFaceSize;
        });

        if (largeFaces.length > 0) {
          handleFacesCallback(largeFaces);
        }
      }
    } catch (error) {
      console.error('[FaceDetection] Error scanning faces:', error);
    } finally {
      isProcessing.value = false;
    }
  }, [enabled, minFaceSize, skipFrames]);

  return frameProcessor;
}
