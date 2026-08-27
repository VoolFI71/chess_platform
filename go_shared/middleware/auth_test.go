package middleware

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func signedTestToken(t *testing.T, method jwt.SigningMethod, tokenType string) string {
	t.Helper()
	token := jwt.NewWithClaims(method, jwt.MapClaims{
		"sub":  "42",
		"type": tokenType,
		"exp":  time.Now().Add(time.Minute).Unix(),
	})
	signed, err := token.SignedString([]byte("secret"))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return signed
}

func TestValidateJWTRequiresAccessTokenAndConfiguredAlgorithm(t *testing.T) {
	accessToken := signedTestToken(t, jwt.SigningMethodHS256, "access")
	userID, err := ValidateJWT(accessToken, "secret", "HS256")
	if err != nil || userID != 42 {
		t.Fatalf("expected valid access token for user 42, got user=%d err=%v", userID, err)
	}

	refreshToken := signedTestToken(t, jwt.SigningMethodHS256, "refresh")
	if _, err := ValidateJWT(refreshToken, "secret", "HS256"); err == nil {
		t.Fatal("refresh token must be rejected")
	}

	wrongAlgorithm := signedTestToken(t, jwt.SigningMethodHS512, "access")
	if _, err := ValidateJWT(wrongAlgorithm, "secret", "HS256"); err == nil {
		t.Fatal("token signed with an unexpected algorithm must be rejected")
	}
}
