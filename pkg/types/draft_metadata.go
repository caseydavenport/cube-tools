package types

// DraftMetadata is a draft's identity and event details, stored once at
// <draftDir>/metadata.json. ID is unique within the cube and never reused;
// EventCode is a short tag for the event (e.g. "bcp26", "local"), and
// CubeCobraRecord is the CubeCobra record the draft was exported to, if any.
type DraftMetadata struct {
	ID               int    `json:"id"`
	Date             string `json:"date"`
	EventName        string `json:"event_name,omitempty"`
	EventCode        string `json:"event_code,omitempty"`
	EventDescription string `json:"event_description,omitempty"`
	Flight           string `json:"flight,omitempty"`
	CubeCobraRecord  string `json:"cubecobra_record,omitempty"`
}
