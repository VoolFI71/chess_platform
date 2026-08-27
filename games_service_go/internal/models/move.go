package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
)

type ClocksAfter struct {
	WhitePastMs   int64 `json:"white_past_ms"`
	BlackPastMs   int64 `json:"black_past_ms"`
	WhiteFinishMs int64 `json:"white_finish_ms"`
	BlackFinishMs int64 `json:"black_finish_ms"`
}

func (ca *ClocksAfter) Scan(value interface{}) error {
	if value == nil {
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return fmt.Errorf("failed to unmarshal ClocksAfter value: %v", value)
	}
	return json.Unmarshal(bytes, ca)
}

func (ca ClocksAfter) Value() (driver.Value, error) {
	return json.Marshal(ca)
}
