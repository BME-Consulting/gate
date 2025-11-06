// ==========================================
// ネットワーク状態管理フック
// ==========================================

import { useState, useEffect } from "react";
import NetInfo from "@react-native-community/netinfo";

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    // 初回の接続状態を取得
    NetInfo.fetch().then((state) => {
      setIsOnline(state.isConnected ?? true);
      setIsConnected(state.isInternetReachable ?? true);
    });

    // 接続状態の変化を監視
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected ?? true);
      setIsConnected(state.isInternetReachable ?? true);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    isOnline,
    isConnected,
    isOffline: !isOnline || !isConnected,
  };
}
