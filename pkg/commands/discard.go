package commands

import (
	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
)

// discardOnError removes a draft the caller created when err is set, so a
// failed import leaves nothing half-written, and returns err. A draft that
// existed before the command ran (created is false) is never removed.
func discardOnError(draft drafts.Draft, created bool, err error) error {
	if err != nil && created {
		discardDraft(draft)
	}
	return err
}

// discardDraft removes a half-written draft, logging rather than returning a
// failure since the caller is already returning the error that matters.
func discardDraft(draft drafts.Draft) {
	if err := draft.Remove(); err != nil {
		logrus.WithError(err).WithField("draft", draft.ID).Error("Failed to remove the half-written draft")
		return
	}
	logrus.WithField("draft", draft.ID).Info("Removed the half-written draft")
}
