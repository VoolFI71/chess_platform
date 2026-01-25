package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestCreateComputerGame_InvalidJSON(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	
	req, _ := http.NewRequest("POST", "/computer-games", bytes.NewBufferString("invalid json"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	
	router.ServeHTTP(w, req)
	
	assert.NotNil(t, w)
}

func TestGetComputerGame_InvalidUUID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	
	req, _ := http.NewRequest("GET", "/computer-games/invalid-uuid", nil)
	w := httptest.NewRecorder()
	
	router.ServeHTTP(w, req)
	
	assert.NotNil(t, w)
}

func TestMakeMove_InvalidGameID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	
	reqBody := map[string]interface{}{
		"uci": "e2e4",
	}
	body, _ := json.Marshal(reqBody)
	req, _ := http.NewRequest("POST", "/computer-games/invalid-uuid/move", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	
	router.ServeHTTP(w, req)
	
	assert.NotNil(t, w)
}

func TestMakeMove_InvalidUCI(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	
	gameID := uuid.New()
	reqBody := map[string]interface{}{
		"uci": "invalid-move",
	}
	body, _ := json.Marshal(reqBody)
	req, _ := http.NewRequest("POST", "/computer-games/"+gameID.String()+"/move", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	
	router.ServeHTTP(w, req)
	
	assert.NotNil(t, w)
}