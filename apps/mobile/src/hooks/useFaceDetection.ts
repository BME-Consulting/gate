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

    // 🔐 ワークレット全体を try/catch でラップ（ネイティブクラッシュ防止）
    try {
      if (!enabled || isProcessing.value) return;

      // フレームスキップ（cooldown実装）
      frameCounter.value++;
      if (frameCounter.value % skipFrames !== 0) return;

      try {
        isProcessing.value = true;

        // 🔐 防御的実装: detectFaces が何を返してきても落ちないようにする
        let faces: any;
        try {
          faces = faceDetectorPlugin.detectFaces(frame);
        } catch (detectError) {
          console.log('[FaceDetection] detectFaces threw error:', detectError);
          return;
        }

        // 🔐 防御的実装: undefined/null/非配列を厳密にガード
        if (!faces) {
          // 顔なし - 正常なケース、ログは不要
          return;
        }

        if (!Array.isArray(faces)) {
          console.log('[FaceDetection] detectFaces returned non-array:', typeof faces);
          return;
        }

        if (faces.length === 0) {
          // 顔なし - 正常なケース、ログは不要
          return;
        }

        // 🔐 防御的実装: 各faceオブジェクトの構造を検証（必要最小限）
        const safeFaces = faces.filter((face: any) => {
          if (!face || typeof face !== 'object') return false;
          if (!face.bounds || typeof face.bounds !== 'object') return false;
          // Number.isFinite でさらに厳密にチェック
          if (!Number.isFinite(face.bounds.width) || !Number.isFinite(face.bounds.height)) return false;
          return true;
        });

        if (safeFaces.length === 0) {
          console.log('[FaceDetection] No valid face objects found');
          return;
        }

        // minFaceSize フィルタリング
        const largeFaces = safeFaces.filter((face: Face) => {
          const faceSize = face.bounds.width * face.bounds.height;
          return Number.isFinite(faceSize) && faceSize > minFaceSize;
        });

        if (largeFaces.length > 0) {
          // JS 側の handleFacesDetected でさらに防御しているので、とにかく落とさず渡す
          handleFacesCallback(largeFaces);
        }
      } catch (error) {
        console.log('[FaceDetection] Inner error in frame processor:', error);
      } finally {
        isProcessing.value = false;
      }
    } catch (error) {
      // 🚨 重要: ワークレット内のエラーは絶対にネイティブに伝播させない
      console.log('[FaceDetection] Outer worklet error:', error);
    }
  }, [enabled, minFaceSize, skipFrames]);

  return frameProcessor;
}
