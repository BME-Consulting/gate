/**
 * OAuth Authentication Service Tests
 *
 * Tests for loginWithKeycloak, refreshAccessToken, and logout functions
 */

import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import { loginWithKeycloak, refreshAccessToken, logout } from "../auth";

// Mock modules
jest.mock("expo-auth-session");
jest.mock("expo-web-browser");
jest.mock("expo-constants");

describe("OAuth Authentication Service", () => {
  const mockConfig = {
    issuer: "http://192.168.1.4:8080/auth/realms/mcd3",
    clientId: "mc-gate-mobile",
    audience: "mc-gate",
  };

  const mockDiscovery = {
    authorizationEndpoint: "http://192.168.1.4:8080/auth/realms/mcd3/protocol/openid-connect/auth",
    tokenEndpoint: "http://192.168.1.4:8080/auth/realms/mcd3/protocol/openid-connect/token",
    endSessionEndpoint: "http://192.168.1.4:8080/auth/realms/mcd3/protocol/openid-connect/logout",
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Constants.expoConfig
    (Constants as any).expoConfig = {
      extra: {
        auth: mockConfig,
      },
    };

    // Mock fetchDiscoveryAsync
    (AuthSession.fetchDiscoveryAsync as jest.Mock).mockResolvedValue(mockDiscovery);

    // Mock makeRedirectUri
    (AuthSession.makeRedirectUri as jest.Mock).mockReturnValue("mcgate://auth");
  });

  describe("loginWithKeycloak", () => {
    it("should successfully login and return tokens", async () => {
      // Mock AuthRequest
      const mockAuthRequest = {
        promptAsync: jest.fn().mockResolvedValue({
          type: "success",
          params: {
            code: "mock-auth-code",
          },
        }),
        codeVerifier: "mock-code-verifier",
      };
      (AuthSession.AuthRequest as jest.Mock).mockImplementation(() => mockAuthRequest);

      // Mock exchangeCodeAsync
      (AuthSession.exchangeCodeAsync as jest.Mock).mockResolvedValue({
        accessToken: "mock-access-token",
        refreshToken: "mock-refresh-token",
        idToken: "mock-id-token",
        expiresIn: 3600,
        tokenType: "Bearer",
      });

      const result = await loginWithKeycloak();

      expect(result).toEqual({
        accessToken: "mock-access-token",
        refreshToken: "mock-refresh-token",
        idToken: "mock-id-token",
        expiresIn: 3600,
        tokenType: "Bearer",
      });

      expect(AuthSession.fetchDiscoveryAsync).toHaveBeenCalledWith(mockConfig.issuer);
      expect(AuthSession.makeRedirectUri).toHaveBeenCalledWith({
        scheme: "mcgate",
        path: "auth",
      });
      expect(mockAuthRequest.promptAsync).toHaveBeenCalledWith(mockDiscovery);
      expect(AuthSession.exchangeCodeAsync).toHaveBeenCalled();
    });

    it("should throw error when login is cancelled", async () => {
      const mockAuthRequest = {
        promptAsync: jest.fn().mockResolvedValue({
          type: "cancel",
        }),
        codeVerifier: "mock-code-verifier",
      };
      (AuthSession.AuthRequest as jest.Mock).mockImplementation(() => mockAuthRequest);

      await expect(loginWithKeycloak()).rejects.toThrow("Ì∞§ÛL≠„ÛªÎUå~W_");
    });

    it("should throw error when auth config is missing", async () => {
      (Constants as any).expoConfig = {
        extra: {},
      };

      await expect(loginWithKeycloak()).rejects.toThrow(
        "Auth configuration is missing. Please check app.config.ts extra.auth settings."
      );
    });

    it("should throw error when discovery fetch fails", async () => {
      (AuthSession.fetchDiscoveryAsync as jest.Mock).mockRejectedValue(
        new Error("Network error")
      );

      await expect(loginWithKeycloak()).rejects.toThrow("Network error");
    });
  });

  describe("refreshAccessToken", () => {
    it("should successfully refresh access token", async () => {
      (AuthSession.refreshAsync as jest.Mock).mockResolvedValue({
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
        idToken: "new-id-token",
        expiresIn: 3600,
        tokenType: "Bearer",
      });

      const result = await refreshAccessToken("mock-refresh-token");

      expect(result).toEqual({
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
        idToken: "new-id-token",
        expiresIn: 3600,
        tokenType: "Bearer",
      });

      expect(AuthSession.fetchDiscoveryAsync).toHaveBeenCalledWith(mockConfig.issuer);
      expect(AuthSession.refreshAsync).toHaveBeenCalledWith(
        {
          clientId: mockConfig.clientId,
          refreshToken: "mock-refresh-token",
        },
        mockDiscovery
      );
    });

    it("should throw error when refresh fails", async () => {
      (AuthSession.refreshAsync as jest.Mock).mockRejectedValue(
        new Error("Refresh token expired")
      );

      await expect(refreshAccessToken("invalid-token")).rejects.toThrow(
        "Refresh token expired"
      );
    });

    it("should reuse existing refresh token if new one is not provided", async () => {
      (AuthSession.refreshAsync as jest.Mock).mockResolvedValue({
        accessToken: "new-access-token",
        refreshToken: undefined,
        idToken: "new-id-token",
        expiresIn: 3600,
        tokenType: "Bearer",
      });

      const result = await refreshAccessToken("original-refresh-token");

      expect(result.refreshToken).toBe("original-refresh-token");
    });
  });

  describe("logout", () => {
    it("should call Keycloak logout endpoint with id token", async () => {
      (WebBrowser.openBrowserAsync as jest.Mock).mockResolvedValue({ type: "cancel" });

      await logout("mock-id-token");

      expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
        `${mockConfig.issuer}/protocol/openid-connect/logout?id_token_hint=mock-id-token`
      );
    });

    it("should not call logout endpoint when id token is not provided", async () => {
      await logout();

      expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
    });

    it("should not throw error when logout fails", async () => {
      (WebBrowser.openBrowserAsync as jest.Mock).mockRejectedValue(
        new Error("Browser failed")
      );

      await expect(logout("mock-id-token")).resolves.not.toThrow();
    });
  });

  describe("Error handling", () => {
    it("should handle network errors during discovery", async () => {
      (AuthSession.fetchDiscoveryAsync as jest.Mock).mockRejectedValue(
        new Error("Network request failed")
      );

      await expect(loginWithKeycloak()).rejects.toThrow("Network request failed");
    });

    it("should handle invalid response from auth server", async () => {
      const mockAuthRequest = {
        promptAsync: jest.fn().mockResolvedValue({
          type: "error",
          params: {
            error: "server_error",
          },
        }),
        codeVerifier: "mock-code-verifier",
      };
      (AuthSession.AuthRequest as jest.Mock).mockImplementation(() => mockAuthRequest);

      await expect(loginWithKeycloak()).rejects.toThrow("ç<k1WW~W_");
    });
  });
});
